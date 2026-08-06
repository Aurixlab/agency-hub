import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { fetchShopifyCatalogPage } from '@/lib/product-automation/shopify-catalog';

export async function POST(request: Request) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only admins can sync the Shopify catalog' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const cursor = typeof body.cursor === 'string' && body.cursor.length <= 1024 ? body.cursor : null;
    const page = await fetchShopifyCatalogPage(cursor);
    const syncedAt = new Date();

    await prisma.$transaction(page.products.map(product =>
      prisma.importedShopifyProduct.upsert({
        where: { shopifyProductId: product.shopifyProductId },
        create: {
          ...product,
          tags: product.tags as any,
          snapshot: product.snapshot as any,
          lastSyncedAt: syncedAt,
          lastSyncedBy: session.id,
        },
        update: {
          legacyResourceId: product.legacyResourceId,
          handle: product.handle,
          title: product.title,
          vendor: product.vendor,
          productType: product.productType,
          shopifyStatus: product.shopifyStatus,
          templateSuffix: product.templateSuffix,
          tags: product.tags as any,
          descriptionHtml: product.descriptionHtml,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
          featuredImageUrl: product.featuredImageUrl,
          variantCount: product.variantCount,
          imageCount: product.imageCount,
          metafieldCount: product.metafieldCount,
          snapshot: product.snapshot as any,
          snapshotBytes: product.snapshotBytes,
          sourceHash: product.sourceHash,
          shopifyUpdatedAt: product.shopifyUpdatedAt,
          lastSyncedAt: syncedAt,
          lastSyncedBy: session.id,
        },
      })
    ));

    return NextResponse.json({
      synced: page.products.length,
      hasNextPage: page.pageInfo.hasNextPage,
      nextCursor: page.pageInfo.endCursor,
    });
  } catch (error) {
    console.error('Import Shopify catalog error:', error);
    const message = error instanceof Error ? error.message : 'Failed to import Shopify products';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
