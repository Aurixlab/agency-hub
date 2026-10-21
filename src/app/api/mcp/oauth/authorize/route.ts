import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getSessionFromRequestFull } from '@/lib/auth';
import { hash, oauthConfig, sign, verify, storeGrant } from '@/lib/mcp-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const headers = { 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", 'Referrer-Policy': 'no-referrer' };

export async function GET(req: NextRequest) {
  try {
    const config = oauthConfig();
    const q = req.nextUrl.searchParams;
    const redirect = q.get('redirect_uri') || '';
    if (q.get('client_id') !== config.clientId || !config.redirects.includes(redirect) || q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(q.get('code_challenge') || '') || (q.get('resource') && q.get('resource') !== config.resource) || (q.get('scope') && q.get('scope') !== 'gsc:read')) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers });
    }
    const session = await getSessionFromRequestFull(req);
    if (!session) return new NextResponse('<p>Sign in to Agency Hub in another tab, then reload this page.</p><a href="/login" target="_blank" rel="noopener">Sign in</a>', { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
    if (session.role !== 'ADMIN' || session.mustChangePassword) return NextResponse.json({ error: 'Admin access required' }, { status: 403, headers });
    const ticket = await sign({ sub: session.id, sessionBinding: hash(req.cookies.get('agency-hub-session')?.value || ''), redirect, state: q.get('state') || '', challenge: q.get('code_challenge'), nonce: randomBytes(24).toString('hex') }, 'consent', '10m');
    return new NextResponse(`<!doctype html><html><head><title>Connect GSC to Claude</title></head><body><h1>Allow read-only Search Console access?</h1><p>This connection can read only the client properties approved by your administrator. It cannot change your sites or sitemaps.</p><p>Return address: ${escape(redirect)}</p><form method="post"><input type="hidden" name="ticket" value="${escape(ticket)}"><button name="decision" value="allow">Allow access</button><button name="decision" value="deny">Cancel</button></form></body></html>`, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  } catch { return NextResponse.json({ error: 'OAuth unavailable; check server configuration' }, { status: 503, headers }); }
}

export async function POST(req: NextRequest) {
  try {
    const config = oauthConfig();
    if (req.headers.get('origin') !== config.origin) return NextResponse.json({ error: 'Invalid origin' }, { status: 403, headers });
    const session = await getSessionFromRequestFull(req);
    if (!session || session.role !== 'ADMIN' || session.mustChangePassword) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    const form = await req.formData();
    const ticket = await verify(String(form.get('ticket') || ''), 'consent');
    if (ticket.sub !== session.id || ticket.sessionBinding !== hash(req.cookies.get('agency-hub-session')?.value || '') || !config.redirects.includes(String(ticket.redirect))) throw new Error('Invalid consent');
    const target = new URL(String(ticket.redirect));
    if (ticket.state) target.searchParams.set('state', String(ticket.state));
    if (form.get('decision') !== 'allow') target.searchParams.set('error', 'access_denied');
    else {
      const code = await sign({ sub: session.id, redirect: ticket.redirect, challenge: ticket.challenge, jti: randomBytes(24).toString('hex') }, 'code', '5m');
      await storeGrant(session.id, code, 300);
      target.searchParams.set('code', code);
    }
    return NextResponse.redirect(target, { status: 303, headers });
  } catch { return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers }); }
}
