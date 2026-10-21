import { NextRequest, NextResponse } from 'next/server';
import { oauthConfig } from '@/lib/mcp-auth';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    const c = oauthConfig();
    const name = req.nextUrl.pathname;
    if (name === '/.well-known/oauth-authorization-server') return NextResponse.json({
      issuer: c.origin, authorization_endpoint: `${c.origin}/api/mcp/oauth/authorize`, token_endpoint: `${c.origin}/api/mcp/oauth/token`,
      response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'], scopes_supported: ['gsc:read'],
      token_endpoint_auth_methods_supported: process.env.MCP_CLIENT_SECRET ? ['client_secret_post', 'client_secret_basic'] : ['none'],
    });
    if (name === '/.well-known/oauth-protected-resource' || name === '/.well-known/oauth-protected-resource/api/mcp') return NextResponse.json({ resource: c.resource, authorization_servers: [c.origin], scopes_supported: ['gsc:read'], bearer_methods_supported: ['header'] });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch { return NextResponse.json({ error: 'OAuth not configured' }, { status: 503 }); }
}
