import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const search = new URL(request.url).searchParams.get('search')?.trim().slice(0, 100) || '';
  const where = search
    ? {
      OR: [
        { title: { contains: search, mode: 'insensitive' as const } },
        { handle: { contains: search, mode: 'insensitive' as const } },
        { vendor: { contains: search, mode: 'insensitive' as const } },
        { legacyResourceId: { contains: search, mode: 'insensitive' as const } },
      ],
    }
    : {};

  const [products, stats] = await Promise.all([
    prisma.importedShopifyProduct.findMany({
      where,
      orderBy: [{ shopifyUpdatedAt: 'desc' }, { title: 'asc' }],
      take: 100,
      select: {
        id: true,
        legacyResourceId: true,
        handle: true,
        title: true,
        vendor: true,
        productType: true,
        shopifyStatus: true,
        templateSuffix: true,
        tags: true,
        featuredImageUrl: true,
        variantCount: true,
        imageCount: true,
        metafieldCount: true,
        snapshotBytes: true,
        shopifyUpdatedAt: true,
        lastSyncedAt: true,
      },
    }),
    prisma.importedShopifyProduct.aggregate({
      _count: { _all: true },
      _sum: { snapshotBytes: true },
      _max: { lastSyncedAt: true },
    }),
  ]);

  return NextResponse.json({
    products,
    stats: {
      totalProducts: stats._count._all,
      storageBytes: stats._sum.snapshotBytes || 0,
      lastSyncedAt: stats._max.lastSyncedAt,
    },
  });
}
