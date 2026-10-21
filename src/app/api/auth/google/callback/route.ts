import { jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { googleOAuth } from '@/lib/gsc-oauth';
import { hash } from '@/lib/mcp-auth';
import { encryptToken } from '@/lib/posting/crypto';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  try {
    const auth = googleOAuth();
    const session = await getSessionFromRequestFull(req);
    if (!session || session.role !== 'ADMIN' || session.mustChangePassword) return NextResponse.json({ error: 'Admin sign-in required' }, { status: 401, headers });
    const state = req.nextUrl.searchParams.get('state');
    const code = req.nextUrl.searchParams.get('code');
    if (!state || !code || state !== req.cookies.get('gsc-oauth-state')?.value) throw new Error('Invalid state');
    const { payload } = await jwtVerify(state, new TextEncoder().encode(process.env.AUTH_SECRET!), { algorithms: ['HS256'], audience: 'gsc-connect' });
    if (payload.sub !== session.id || payload.binding !== hash(req.cookies.get('agency-hub-session')?.value || '')) throw new Error('Wrong session');
    const { tokens } = await auth.getToken(code);
    if (!tokens.refresh_token) throw new Error('No refresh token');
    const encrypted = encryptToken(tokens.refresh_token);
    await prisma.gscConnection.upsert({ where: { id: 'agency' }, create: { id: 'agency', ...encrypted }, update: encrypted });
    const res = NextResponse.json({ success: true, message: 'Google Search Console connected. You can return to SEO Rankings.' }, { headers });
    res.cookies.set('gsc-oauth-state', '', { maxAge: 0, path: '/api/auth/google' });
    return res;
  } catch { return NextResponse.json({ error: 'Google connection failed. Restart authorization and check server configuration.' }, { status: 400, headers }); }
}
