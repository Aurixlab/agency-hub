import { jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { googleOAuth } from '@/lib/gsc-oauth';
import { hash } from '@/lib/mcp-auth';
import { encryptToken } from '@/lib/posting/crypto';
import { prisma } from '@/lib/prisma';
import { ensureGscStorage, connectionFailure, type GoogleConnectionStage } from '@/lib/gsc-connection';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  let stage: GoogleConnectionStage = 'configuration';
  try {
    const auth = googleOAuth();
    const session = await getSessionFromRequestFull(req);
    if (!session || session.role !== 'ADMIN' || session.mustChangePassword) return NextResponse.json({ error: 'Admin sign-in required' }, { status: 401, headers });
    stage = 'state';
    const state = req.nextUrl.searchParams.get('state');
    const code = req.nextUrl.searchParams.get('code');
    if (!state || state !== req.cookies.get('gsc-oauth-state')?.value) throw new Error('Invalid state');
    const { payload } = await jwtVerify(state, new TextEncoder().encode(process.env.AUTH_SECRET!), { algorithms: ['HS256'], audience: 'gsc-connect' });
    if (payload.sub !== session.id || payload.binding !== hash(req.cookies.get('agency-hub-session')?.value || '')) throw new Error('Wrong session');
    if (req.nextUrl.searchParams.has('error')) return NextResponse.json({ error: 'Google authorization was cancelled. Start Connect Google again to grant access.', code: 'google_access_denied', stage }, { status: 400, headers });
    if (!code) throw new Error('Missing authorization code');
    stage = 'encryption';
    encryptToken('configuration-check');
    stage = 'storage_setup';
    await ensureGscStorage();
    stage = 'exchange';
    const { tokens } = await auth.getToken(code);
    if (!tokens.refresh_token) throw new Error('No refresh token');
    stage = 'encryption';
    const encrypted = encryptToken(tokens.refresh_token);
    stage = 'storage';
    await prisma.gscConnection.upsert({ where: { id: 'agency' }, create: { id: 'agency', ...encrypted }, update: encrypted });
    const res = NextResponse.json({ success: true, message: 'Google Search Console connected. You can return to SEO Rankings.' }, { headers });
    res.cookies.set('gsc-oauth-state', '', { maxAge: 0, path: '/api/auth/google' });
    return res;
  } catch (error) {
    const failure = connectionFailure(stage, error);
    console.error('GSC connection callback failed', { stage, code: failure.code });
    return NextResponse.json({ error: failure.message, code: failure.code, stage }, { status: stage === 'state' || stage === 'exchange' ? 400 : 503, headers });
  }
}
