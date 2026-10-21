import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getSessionFromRequestFull, type SessionUser } from '@/lib/auth';
import { hash, oauthConfig, sign, verify, storeGrant } from '@/lib/mcp-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const headers = { 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", 'Referrer-Policy': 'no-referrer' };

function accountAccessPage(req: NextRequest, session: SessionUser | null) {
  const pendingPassword = session?.role === 'ADMIN' && session.mustChangePassword;
  const title = !session ? 'Sign in to Agency Hub to continue' : pendingPassword ? 'Finish setting up your admin account' : 'Use an Agency Hub admin account';
  const details = !session
    ? 'Sign in to Agency Hub in this browser, then return here to continue connecting Claude.'
    : pendingPassword
      ? 'Your account is an admin, but its initial password change is still pending. Finish that step before approving access to client data.'
      : 'This Agency Hub account cannot approve access to the agency’s Search Console data. Sign in with your existing admin account.';
  const account = session ? `<p>Signed in as <strong>${escape(session.username || session.name)}</strong>. Agency Hub role: <strong>${escape(session.role)}</strong>.</p>` : '';
  const action = pendingPassword ? '/change-password' : '/login';
  const label = pendingPassword ? 'Complete password change' : session ? 'Sign in with another Agency Hub account' : 'Sign in to Agency Hub';
  const retry = escape(req.nextUrl.pathname + req.nextUrl.search);
  return new NextResponse(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1>${account}<p>${details}</p><p>Your Claude and Google email addresses can be different. Access is approved by your Agency Hub admin account.</p><p><a href="${action}" target="_blank" rel="noopener">${label}</a></p><p>After finishing in the other tab, <a href="${retry}">check this account again</a>. If Claude’s connection has timed out, click Connect again in Claude.</p></main></body></html>`, { status: session ? 403 : 200, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function GET(req: NextRequest) {
  try {
    const config = oauthConfig();
    const q = req.nextUrl.searchParams;
    const redirect = q.get('redirect_uri') || '';
    if (q.get('client_id') !== config.clientId || !config.redirects.includes(redirect) || q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(q.get('code_challenge') || '') || (q.get('resource') && q.get('resource') !== config.resource) || (q.get('scope') && q.get('scope') !== 'gsc:read')) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers });
    }
    const session = await getSessionFromRequestFull(req);
    if (!session || session.role !== 'ADMIN' || session.mustChangePassword) return accountAccessPage(req, session);
    const ticket = await sign({ sub: session.id, sessionBinding: hash(req.cookies.get('agency-hub-session')?.value || ''), redirect, state: q.get('state') || '', challenge: q.get('code_challenge'), nonce: randomBytes(24).toString('hex') }, 'consent', '10m');
    return new NextResponse(`<!doctype html><html><head><title>Connect GSC to Claude</title></head><body><h1>Allow read-only Search Console access?</h1><p>This connection can read only the client properties approved by your administrator. It cannot change your sites or sitemaps.</p><p>Return address: ${escape(redirect)}</p><form method="post"><input type="hidden" name="ticket" value="${escape(ticket)}"><button name="decision" value="allow">Allow access</button><button name="decision" value="deny">Cancel</button></form></body></html>`, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  } catch { return NextResponse.json({ error: 'OAuth unavailable; check server configuration' }, { status: 503, headers }); }
}

export async function POST(req: NextRequest) {
  try {
    const config = oauthConfig();
    if (req.headers.get('origin') !== config.origin) return NextResponse.json({ error: 'Invalid origin' }, { status: 403, headers });
    const session = await getSessionFromRequestFull(req);
    if (!session) return NextResponse.json({ error: 'Sign in to Agency Hub and restart Connect in Claude.', code: 'agency_hub_sign_in_required' }, { status: 401, headers });
    if (session.role !== 'ADMIN') return NextResponse.json({ error: 'The signed-in Agency Hub account must be an ADMIN to approve client data access.', code: 'agency_hub_admin_required' }, { status: 403, headers });
    if (session.mustChangePassword) return NextResponse.json({ error: 'Complete your Agency Hub initial password change, then restart Connect in Claude.', code: 'password_change_required' }, { status: 403, headers });
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
