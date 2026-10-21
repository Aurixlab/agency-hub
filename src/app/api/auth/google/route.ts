import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { googleOAuth } from '@/lib/gsc-oauth';
import { hash } from '@/lib/mcp-auth';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequestFull(req);
  if (!session || session.role !== 'ADMIN' || session.mustChangePassword) return NextResponse.json({ error: 'Admin sign-in required' }, { status: 401 });
  try {
    const auth = googleOAuth();
    const state = await new SignJWT({ sub: session.id, binding: hash(req.cookies.get('agency-hub-session')?.value || ''), nonce: randomBytes(24).toString('hex') }).setProtectedHeader({ alg: 'HS256' }).setAudience('gsc-connect').setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
    const res = NextResponse.redirect(auth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/webmasters.readonly'], state }));
    res.cookies.set('gsc-oauth-state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600, path: '/api/auth/google' });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch { return NextResponse.json({ error: 'Configure Google OAuth and token encryption first' }, { status: 503 }); }
}
