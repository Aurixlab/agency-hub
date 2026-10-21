import { NextRequest, NextResponse } from 'next/server';
import { oauthConfig, matches, hash, verify, activeAdmin, consumeGrant, issueTokens } from '@/lib/mcp-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };
export async function POST(req: NextRequest) {
  try {
    const config = oauthConfig();
    const body = await req.formData();
    let clientId = String(body.get('client_id') || '');
    let clientSecret = String(body.get('client_secret') || '');
    const authorization = req.headers.get('authorization');
    if (authorization?.startsWith('Basic ')) {
      const pair = Buffer.from(authorization.slice(6), 'base64').toString();
      const index = pair.indexOf(':');
      clientId = decodeURIComponent(pair.slice(0, index));
      clientSecret = decodeURIComponent(pair.slice(index + 1));
    }
    if (clientId !== config.clientId || (process.env.MCP_CLIENT_SECRET && !matches(clientSecret, process.env.MCP_CLIENT_SECRET))) return NextResponse.json({ error: 'invalid_client' }, { status: 401, headers });
    if (body.get('resource') && body.get('resource') !== config.resource) throw new Error('Invalid resource');
    const grant = body.get('grant_type');
    if (grant !== 'authorization_code' && grant !== 'refresh_token') return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400, headers });
    const raw = String(body.get(grant === 'authorization_code' ? 'code' : 'refresh_token') || '');
    const payload = await verify(raw, grant === 'authorization_code' ? 'code' : 'refresh');
    if (!payload.sub || !await activeAdmin(payload.sub)) throw new Error('Unauthorized');
    if (grant === 'authorization_code') {
      const verifier = String(body.get('code_verifier') || '');
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || hash(verifier) !== payload.challenge || body.get('redirect_uri') !== payload.redirect || !config.redirects.includes(String(payload.redirect))) throw new Error('Invalid code binding');
    }
    await consumeGrant(payload.sub, raw);
    return NextResponse.json(await issueTokens(payload.sub), { headers });
  } catch { return NextResponse.json({ error: 'invalid_grant' }, { status: 400, headers }); }
}
