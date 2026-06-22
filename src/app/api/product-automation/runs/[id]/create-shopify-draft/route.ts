import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { composeShopifyPayload } from '@/lib/product-automation/payload';
import { createShopifyDraftProduct, updateShopifyProductMetafields } from '@/lib/product-automation/shopify';
import type { AiProductCopy, DecorationType, ScrapedProductData } from '@/lib/product-automation/types';

const colorsFrom = (value: unknown) =>
  (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === 'string' && item.trim().length > 0);

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const run = await prisma.productAutomationRun.findUnique({ where: { id: params.id } });
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  try {
    if (!run.scrapedData || !run.aiCopy) {
      return NextResponse.json({ error: 'Scraped data and AI copy are required before creating a Shopify draft' }, { status: 400 });
    }
    const composed = composeShopifyPayload({
      scrapedData: run.scrapedData as ScrapedProductData,
      aiCopy: run.aiCopy as AiProductCopy,
      basePrice: Number(run.basePrice),
      decorationType: run.decorationType as DecorationType,
      colors: colorsFrom(run.colors),
    });
    const payload = composed.payload;

    const shopify = run.shopifyProductId
      ? await updateShopifyProductMetafields(run.shopifyProductId, payload)
      : await createShopifyDraftProduct(payload);
    const updated = await prisma.productAutomationRun.update({
      where: { id: run.id },
      data: {
        pricing: composed.pricing as any,
        variants: payload.variants as any,
        shopifyPayload: payload as any,
        shopifyProductId: shopify.productId,
        shopifyProductUrl: shopify.productUrl,
        status: 'created',
        errorMessage: null,
      },
    });

    return NextResponse.json({ run: updated, shopify });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create Shopify draft';
    const updated = await prisma.productAutomationRun.update({
      where: { id: run.id },
      data: { status: 'failed', errorMessage: message },
    });
    return NextResponse.json({ error: message, run: updated }, { status: 500 });
  }
}
