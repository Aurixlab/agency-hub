import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { analyticsSchema, summarizeMetrics } from './gsc-query';
import { hash, sign, verify, verifyAccess, storeGrant } from './mcp-auth';
import { prisma } from './prisma';
import { POST as tokenEndpoint } from '../app/api/mcp/oauth/token/route';
import { POST as mcpEndpoint } from '../app/api/mcp/route';
import { GET as authorize, POST as consent } from '../app/api/mcp/oauth/authorize/route';
import { middleware } from '../middleware';
import { SignJWT } from 'jose';
import { readMcpBody } from './mcp-request';
import { ensureGscStorage, connectionFailure } from './gsc-connection';
import { GET as accountStatus } from '../app/api/auth/me/route';

process.env.MCP_ORIGIN = 'https://agency.example';
process.env.MCP_CLIENT_ID = 'test-client';
process.env.MCP_CLIENT_SECRET = 'test-secret';
process.env.MCP_SIGNING_SECRET = randomBytes(32).toString('hex');
process.env.MCP_REDIRECT_URIS = 'https://claude.example/callback';
const appSessionSecret = process.env.AUTH_SECRET || 'fallback-secret-change-me';

const grants = new Map<string, { userId: string; expiresAt: Date }>();
prisma.user.findUnique = async () => ({ role: 'ADMIN', disabled: false, mustChangePassword: false });
prisma.session.create = async ({ data }: any) => { grants.set(data.token, data); return data; };
prisma.session.deleteMany = async ({ where }: any) => {
  const grant = grants.get(where.token);
  if (!grant || grant.userId !== where.userId || grant.expiresAt <= where.expiresAt.gt) return { count: 0 };
  grants.delete(where.token); return { count: 1 };
};

test('weighted metrics preserve total CTR and ignore zero-impression days for position', () => {
  const result = summarizeMetrics([{ clicks: 2, impressions: 10, position: 3 }, { clicks: 0, impressions: 0, position: 0 }]);
  assert.equal(result.ctr, 0.2); assert.equal(result.position, 3);
  assert.equal(summarizeMetrics([]).position, null);
});
test('invalid dates, reversed ranges and mismatched hourly requests are rejected', () => {
  const base = { client: 'one', startDate: '2026-01-01', endDate: '2026-01-02' };
  for (const change of [{ startDate: '2026-02-30' }, { startDate: '2026-01-03' }, { dimensions: ['hour'] }, { dimensions: ['date', 'date'] }, { rowLimit: 25001 }]) {
    assert.equal(analyticsSchema.safeParse({ ...base, ...change }).success, false);
  }
  assert.equal(analyticsSchema.safeParse({ ...base, dimensions: [] }).success, true);
});
test('protocol input rejects oversized and deeply nested JSON before validation', async () => {
  const request = (body: string) => new Request('https://agency.example/api/mcp', { method: 'POST', body });
  await assert.rejects(readMcpBody(request(JSON.stringify({ value: 'x'.repeat(65536) }))));
  await assert.rejects(readMcpBody(request('['.repeat(25) + '0' + ']'.repeat(25))));
  assert.deepEqual(await readMcpBody(request('{"jsonrpc":"2.0","id":1}')), { jsonrpc: '2.0', id: 1 });
});
test('Google connection provisions only a missing storage table and preserves other DB errors', async () => {
  const statements: string[] = [];
  const missing = { code: 'P2021' };
  await ensureGscStorage({
    gscConnection: { findUnique: async () => { throw missing; } },
    $transaction: async (work: (tx: unknown) => Promise<void>) => work({ $executeRaw: async (strings: TemplateStringsArray) => { statements.push(strings.join('')); } }),
  });
  assert.equal(statements.length, 2);
  assert.match(statements[0], /CREATE TABLE IF NOT EXISTS public.gsc_connections/);
  assert.match(statements[1], /ENABLE ROW LEVEL SECURITY/);
  await ensureGscStorage({ gscConnection: { findUnique: async () => ({ id: 'agency' }) }, $executeRaw: async () => { throw new Error('Unexpected schema change'); } });
  const denied = { code: 'P1010', message: 'sensitive database details' };
  await assert.rejects(ensureGscStorage({ gscConnection: { findUnique: async () => { throw denied; } } }), error => error === denied);
  assert.equal(connectionFailure('storage', missing).code, 'gsc_storage_missing');
  assert.equal(connectionFailure('exchange', { response: { data: { error: 'invalid_grant', secret: 'do-not-expose' } } }).code, 'google_authorization_expired');
  assert.equal(JSON.stringify(connectionFailure('storage', denied)).includes('sensitive database details'), false);
});
test('OAuth enforces purpose, signature, PKCE, redirect binding, code replay and refresh rotation', async () => {
  const verifier = randomBytes(32).toString('base64url');
  const code = await sign({ sub: 'admin', redirect: 'https://claude.example/callback', challenge: hash(verifier), jti: 'one' }, 'code', '5m');
  await storeGrant('admin', code, 300);
  await assert.rejects(verify(code, 'access'));
  assert.equal(await verifyAccess(code), undefined);
  await assert.rejects(verify(`${code.slice(0, -8)}xxxxxxxx`, 'code'));
  const request = (values: Record<string, string>) => tokenEndpoint(new NextRequest('https://agency.example/api/mcp/oauth/token', { method: 'POST', body: new URLSearchParams({ client_id: 'test-client', client_secret: 'test-secret', ...values }) }));
  const args = { grant_type: 'authorization_code', code, redirect_uri: 'https://claude.example/callback', code_verifier: verifier };
  assert.equal((await request({ ...args, code_verifier: 'wrong' })).status, 400);
  assert.equal((await request({ ...args, redirect_uri: 'https://evil.example' })).status, 400);
  assert.equal((await request({ ...args, client_secret: 'wrong' })).status, 401);
  const response = await request(args);
  assert.equal(response.status, 200);
  const tokens = await response.json();
  assert.ok(await verifyAccess(tokens.access_token));
  assert.equal((await request(args)).status, 400);
  const refresh = { grant_type: 'refresh_token', refresh_token: tokens.refresh_token };
  assert.equal((await request(refresh)).status, 200);
  assert.equal((await request(refresh)).status, 400);
  const expired = await sign({ sub: 'admin', scope: 'gsc:read' }, 'access', '-1s');
  assert.equal(await verifyAccess(expired), undefined);
});
test('MCP rejects anonymous access and lists seven read-only tools with a valid token', async () => {
  const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  const request = (token?: string) => new Request('https://agency.example/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: payload });
  const anonymous = await mcpEndpoint(request());
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers.get('www-authenticate') || '', /oauth-protected-resource/);
  const token = await sign({ sub: 'admin', scope: 'gsc:read' }, 'access', '1h');
  const response = await mcpEndpoint(request(token));
  assert.equal(response.status, 200);
  const raw = await response.text();
  const message = raw.startsWith('data:') || raw.includes('\ndata:') ? JSON.parse(raw.split('\n').find(l => l.startsWith('data:'))!.slice(5)) : JSON.parse(raw);
  assert.equal(message.result.tools.length, 7);
  assert.ok(message.result.tools.every((t: any) => t.annotations.readOnlyHint));
  prisma.user.findUnique = async () => ({ role: 'ADMIN', disabled: true });
  assert.equal((await mcpEndpoint(request(token))).status, 401);
  prisma.user.findUnique = async () => ({ id: 'admin', role: 'ADMIN', disabled: false, mustChangePassword: false });
});

test('OAuth consent rejects foreign origins and binds approval to the signed admin session', async () => {
  process.env.AUTH_SECRET = appSessionSecret;
  const cookie = await new SignJWT({ userId: 'admin', role: 'ADMIN' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  prisma.session.findFirst = async () => ({ userId: 'admin', token: cookie, expiresAt: new Date(Date.now() + 100000) });
  const headers = { Cookie: `agency-hub-session=${cookie}` };
  const q = new URLSearchParams({ client_id: 'test-client', redirect_uri: 'https://claude.example/callback', response_type: 'code', code_challenge_method: 'S256', code_challenge: hash('verifier'), state: 'original-state' });
  const url = `https://agency.example/api/mcp/oauth/authorize?${q}`;
  const form = await authorize(new NextRequest(url, { headers }));
  assert.equal(form.status, 200);
  const ticket = (await form.text()).match(/name="ticket" value="([^"]+)"/)![1];
  const approve = (origin: string) => consent(new NextRequest(url, { method: 'POST', headers: { ...headers, Origin: origin }, body: new URLSearchParams({ ticket, decision: 'allow' }) }));
  assert.equal((await approve('https://evil.example')).status, 403);
  const response = await approve('https://agency.example');
  assert.equal(response.status, 303);
  const location = new URL(response.headers.get('location')!);
  assert.equal(location.searchParams.get('state'), 'original-state');
  assert.equal((await verify(location.searchParams.get('code')!, 'code')).sub, 'admin');
  assert.equal((await middleware(new NextRequest('https://agency.example/api/seo/overview'))).status, 401);
  assert.equal((await middleware(new NextRequest('https://agency.example/api/seo/overview', { headers: { Cookie: 'agency-hub-session=forged' } }))).status, 401);
  assert.equal((await middleware(new NextRequest('https://agency.example/api/seo/overview', { headers }))).status, 200);
});

test('connector access explains current account restrictions without granting member or pending-password access', async () => {
  process.env.AUTH_SECRET = appSessionSecret;
  // Deliberately stale ADMIN claims: routes must use the current database role.
  const cookie = await new SignJWT({ userId: 'admin', role: 'ADMIN', mustChangePassword: false }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode(appSessionSecret));
  prisma.session.findFirst = async () => ({ userId: 'admin', token: cookie, expiresAt: new Date(Date.now() + 100000) });
  const headers = { Cookie: `agency-hub-session=${cookie}` };
  const q = new URLSearchParams({ client_id: 'test-client', redirect_uri: 'https://claude.example/callback', response_type: 'code', code_challenge_method: 'S256', code_challenge: hash('verifier') });
  const url = `https://agency.example/api/mcp/oauth/authorize?${q}`;
  prisma.user.findUnique = async () => ({ id: 'admin', username: 'member@example.test', role: 'MEMBER', mustChangePassword: false, disabled: false });
  const member = await authorize(new NextRequest(url, { headers }));
  assert.equal(member.status, 403);
  const memberPage = await member.text();
  assert.match(memberPage, /member@example.test/);
  assert.match(memberPage, /Sign in with another Agency Hub account/);
  assert.doesNotMatch(memberPage, /name="ticket"/);
  const denied = await consent(new NextRequest(url, { method: 'POST', headers: { ...headers, Origin: 'https://agency.example' }, body: new URLSearchParams() }));
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, 'agency_hub_admin_required');
  assert.equal((await (await accountStatus(new Request('https://agency.example/api/auth/me', { headers }))).json()).role, 'MEMBER');
  prisma.user.findUnique = async () => ({ id: 'admin', username: 'owner', role: 'ADMIN', mustChangePassword: true, disabled: false });
  const pending = await authorize(new NextRequest(url, { headers }));
  assert.equal(pending.status, 403);
  assert.match(await pending.text(), /href="\/change-password"/);
  const pendingPost = await consent(new NextRequest(url, { method: 'POST', headers: { ...headers, Origin: 'https://agency.example' }, body: new URLSearchParams() }));
  assert.equal((await pendingPost.json()).code, 'password_change_required');
  prisma.user.findUnique = async () => ({ id: 'admin', role: 'ADMIN', disabled: true });
  assert.equal((await accountStatus(new Request('https://agency.example/api/auth/me', { headers }))).status, 401);
});
