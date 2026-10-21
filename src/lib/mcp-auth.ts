import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { prisma } from './prisma';

export function oauthConfig() {
  const origin = process.env.MCP_ORIGIN;
  const clientId = process.env.MCP_CLIENT_ID;
  const secret = process.env.MCP_SIGNING_SECRET;
  const redirects = (process.env.MCP_REDIRECT_URIS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!origin || new URL(origin).origin !== origin || !origin.startsWith('https://') || !clientId || !secret || secret.length < 32 || !redirects.length) throw new Error('MCP OAuth is not configured');
  return { origin, clientId, key: new TextEncoder().encode(secret), redirects, resource: `${origin}/api/mcp` };
}
export const hash = (value: string) => createHash('sha256').update(value).digest('base64url');
export function matches(a: string, b: string) {
  return timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
}
export async function sign(payload: JWTPayload, purpose: string, ttl: string) {
  const config = oauthConfig();
  return new SignJWT({ ...payload, purpose }).setProtectedHeader({ alg: 'HS256' }).setIssuer(config.origin).setAudience(config.resource).setIssuedAt().setExpirationTime(ttl).sign(config.key);
}
export async function verify(token: string, purpose: string) {
  const config = oauthConfig();
  const { payload } = await jwtVerify(token, config.key, { algorithms: ['HS256'], issuer: config.origin, audience: config.resource });
  if (payload.purpose !== purpose) throw new Error('Wrong token purpose');
  return payload;
}
// Existing Session storage supplies atomic one-time consumption across Vercel instances.
// Store only token digests; never raw OAuth codes or refresh tokens.
export async function storeGrant(userId: string, token: string, ttlSeconds: number) {
  await prisma.session.create({ data: { userId, token: `mcp:${hash(token)}`, expiresAt: new Date(Date.now() + ttlSeconds * 1000) } });
}
export async function consumeGrant(userId: string, token: string) {
  const result = await prisma.session.deleteMany({ where: { userId, token: `mcp:${hash(token)}`, expiresAt: { gt: new Date() } } });
  if (result.count !== 1) throw new Error('Grant expired or already consumed');
}
export async function activeAdmin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, disabled: true, mustChangePassword: true } });
  return user?.role === 'ADMIN' && !user.disabled && !user.mustChangePassword;
}
export async function issueTokens(userId: string) {
  const access = await sign({ sub: userId, scope: 'gsc:read' }, 'access', '1h');
  const refresh = await sign({ sub: userId, jti: randomBytes(24).toString('hex') }, 'refresh', '30d');
  await storeGrant(userId, refresh, 30 * 86400);
  return { access_token: access, token_type: 'Bearer', expires_in: 3600, refresh_token: refresh, scope: 'gsc:read' };
}
export async function verifyAccess(token?: string) {
  if (!token) return undefined;
  try {
    const payload = await verify(token, 'access');
    if (!payload.sub || payload.scope !== 'gsc:read' || !await activeAdmin(payload.sub)) return undefined;
    return { token, clientId: oauthConfig().clientId, scopes: ['gsc:read'], expiresAt: payload.exp };
  } catch { return undefined; }
}
