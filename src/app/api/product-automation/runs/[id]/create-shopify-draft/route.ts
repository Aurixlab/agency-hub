import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { composeShopifyPayload } from '@/lib/product-automation/payload';
import { createShopifyDraftProduct } from '@/lib/product-automation/shopify';
import type { AiProductCopy, DecorationType, ScrapedProductData, ShopifyPayload } from '@/lib/product-automation/types';

const colorsFrom = (value: unknown) =>
  (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === 'string' && item.trim().length > 0);

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const run = await prisma.productAutomationRun.findUnique({ where: { id: params.id } });
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  try {
    let payload = run.shopifyPayload as ShopifyPayload | null;
    let pricing = run.pricing;
    let variants = run.variants;

    if (!payload) {
      if (!run.scrapedData || !run.aiCopy) {
        return NextResponse.json({ error: 'Preview is required before creating a Shopify draft' }, { status: 400 });
      }
      const composed = composeShopifyPayload({
        scrapedData: run.scrapedData as ScrapedProductData,
        aiCopy: run.aiCopy as AiProductCopy,
        basePrice: Number(run.basePrice),
        decorationType: run.decorationType as DecorationType,
        colors: colorsFrom(run.colors),
      });
      payload = composed.payload;
      pricing = composed.pricing as any;
      variants = composed.payload.variants as any;
    }

    const shopify = await createShopifyDraftProduct(payload);
    const updated = await prisma.productAutomationRun.update({
      where: { id: run.id },
      data: {
        pricing: pricing as any,
        variants: variants as any,
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
