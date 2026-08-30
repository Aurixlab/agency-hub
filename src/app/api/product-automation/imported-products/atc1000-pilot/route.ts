import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  ATC1000_PILOT_HANDLE,
  ATC1000_PILOT_PRODUCT_ID,
  addIndustryCollectionReferences,
  buildAtc1000PilotDraft,
} from '@/lib/product-automation/catalog-enrichment';
import {
  fetchShopifyEnrichmentTarget,
  resolveShopifyCollectionIds,
  setShopifyProductMetafieldsOnly,
} from '@/lib/product-automation/shopify';

const CONFIRMATION = 'ATC1000-ONLY';

export async function POST(request: Request) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only admins can apply the ATC1000 pilot' }, { status: 403 });
  }
  if (process.env.PRODUCT_ENRICHMENT_SHOPIFY_WRITES_ENABLED !== 'true') {
    return NextResponse.json({
      error: 'Shopify enrichment writes are locked while the new content is under review',
    }, { status: 423 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    if (body.confirmation !== CONFIRMATION) {
      return NextResponse.json({ error: 'ATC1000 pilot confirmation is required' }, { status: 400 });
    }

    const product = await prisma.importedShopifyProduct.findUnique({
      where: { shopifyProductId: ATC1000_PILOT_PRODUCT_ID },
      select: {
        shopifyProductId: true,
        title: true,
        handle: true,
        vendor: true,
        tags: true,
        snapshot: true,
      },
    });
    if (!product) {
      return NextResponse.json({ error: 'ATC1000 is missing from the imported catalog' }, { status: 404 });
    }

    const draft = buildAtc1000PilotDraft(product);
    const liveProduct = await fetchShopifyEnrichmentTarget(ATC1000_PILOT_PRODUCT_ID);
    if (liveProduct.id !== ATC1000_PILOT_PRODUCT_ID || liveProduct.handle !== ATC1000_PILOT_HANDLE) {
      throw new Error('Live Shopify product failed the ATC1000 pilot guard');
    }

    const collectionIds = await resolveShopifyCollectionIds(draft.industryHandles);
    const finalDraft = addIndustryCollectionReferences(draft, collectionIds);
    const result = await setShopifyProductMetafieldsOnly(finalDraft.productId, finalDraft.metafields);

    return NextResponse.json({
      product: {
        id: liveProduct.id,
        title: liveProduct.title,
        handle: liveProduct.handle,
      },
      savedKeys: result.metafields.map(item => item.key),
      productUrl: result.productUrl,
      message: 'ATC1000 pilot metafields were saved to Shopify',
    });
  } catch (error) {
    console.error('Apply ATC1000 pilot error:', error);
    const message = error instanceof Error ? error.message : 'Unable to apply the ATC1000 pilot';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
