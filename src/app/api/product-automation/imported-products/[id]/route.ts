import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const product = await prisma.importedShopifyProduct.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      shopifyProductId: true,
      legacyResourceId: true,
      title: true,
      handle: true,
      vendor: true,
      productType: true,
      shopifyStatus: true,
      templateSuffix: true,
      tags: true,
      descriptionHtml: true,
      seoTitle: true,
      seoDescription: true,
      featuredImageUrl: true,
      variantCount: true,
      imageCount: true,
      metafieldCount: true,
      snapshot: true,
      snapshotBytes: true,
      sourceHash: true,
      shopifyUpdatedAt: true,
      lastSyncedAt: true,
      syncedBy: { select: { id: true, name: true, username: true } },
    },
  });

  if (!product) return NextResponse.json({ error: 'Imported product not found' }, { status: 404 });
  return NextResponse.json({ product });
}
