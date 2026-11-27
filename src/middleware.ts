import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const publicPaths = ['/login', '/api/auth/google'];

// Constant-time string comparison (Edge runtime has no node:crypto timingSafeEqual).
function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// Cookie presence is not authentication: require a validly signed, unexpired session JWT.
async function hasValidSession(token: string | undefined) {
  if (!token || !process.env.AUTH_SECRET) return false;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET), { algorithms: ['HS256'] });
    return Boolean(payload.userId);
  } catch { return false; }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // MCP routes validate bearer tokens or OAuth consent themselves; cookies are not MCP credentials.
  if (pathname === '/api/mcp' || pathname.startsWith('/api/mcp/oauth/') || pathname.startsWith('/.well-known/')) {
    return NextResponse.next();
  }
  const sessionToken = request.cookies.get('agency-hub-session')?.value;
  if (pathname === '/api/seo' || pathname.startsWith('/api/seo/') || pathname.startsWith('/api/reports/')) {
    try {
      if (!sessionToken || !process.env.AUTH_SECRET) throw new Error('No session');
      const { payload } = await jwtVerify(sessionToken, new TextEncoder().encode(process.env.AUTH_SECRET), { algorithms: ['HS256'] });
      if (!payload.userId || !['ADMIN', 'MEMBER'].includes(String(payload.role))) throw new Error('No access');
      return NextResponse.next();
    } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  }
  const enrichmentBatchPath = '/api/product-automation/imported-products/enrichment-batch';
  const enrichmentBatchToken = process.env.PRODUCT_ENRICHMENT_BATCH_TOKEN;
  const suppliedEnrichmentBatchToken = request.headers.get('x-enrichment-batch-token');
  const tshirtRolloutToken = process.env.PRODUCT_TSHIRT_ROLLOUT_TOKEN;
  const suppliedTshirtRolloutToken = request.headers.get('x-tshirt-rollout-token');
  const tshirtRolloutPaths = [
    '/api/product-automation/imported-products/sync',
    '/api/product-automation/imported-products/tshirt-content-rollout',
  ];

  if (
    pathname === enrichmentBatchPath
    && enrichmentBatchToken
    && safeEqual(suppliedEnrichmentBatchToken || '', enrichmentBatchToken)
  ) {
    return NextResponse.next();
  }

  if (
    tshirtRolloutPaths.includes(pathname)
    && tshirtRolloutToken
    && safeEqual(suppliedTshirtRolloutToken || '', tshirtRolloutToken)
  ) {
    return NextResponse.next();
  }

  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/cron')) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    const querySecret = request.nextUrl.searchParams.get('secret');
    const isAuthorizedCron =
      cronSecret &&
      (safeEqual(authHeader || '', `Bearer ${cronSecret}`) || safeEqual(querySecret || '', cronSecret));

    if (isAuthorizedCron || await hasValidSession(sessionToken)) {
      return NextResponse.next();
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    // Static-file bypass must not apply to API paths (dynamic ids may contain a dot).
    (!pathname.startsWith('/api/') && pathname.includes('.'))
  ) {
    return NextResponse.next();
  }

  if (!sessionToken) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
