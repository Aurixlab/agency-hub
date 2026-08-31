import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/login', '/api/auth/login', '/api/auth/google', '/api/seo'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get('agency-hub-session')?.value;
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
    && suppliedEnrichmentBatchToken === enrichmentBatchToken
  ) {
    return NextResponse.next();
  }

  if (
    tshirtRolloutPaths.includes(pathname)
    && tshirtRolloutToken
    && suppliedTshirtRolloutToken === tshirtRolloutToken
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
      (authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret);

    if (sessionToken || isAuthorizedCron) {
      return NextResponse.next();
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
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
