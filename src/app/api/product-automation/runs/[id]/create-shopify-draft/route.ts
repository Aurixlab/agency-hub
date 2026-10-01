import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { assertAiCopyReady, validateAiCopy } from '@/lib/product-automation/gemini-copy';
import { composeShopifyPayload } from '@/lib/product-automation/payload';
import { createShopifyDraftProduct, resolveShopifyCollectionIds, updateShopifyProductMetafields } from '@/lib/product-automation/shopify';
import type { AiProductCopy, DecorationType, ScrapedProductData } from '@/lib/product-automation/types';

const colorsFrom = (value: unknown) =>
  (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === 'string' && item.trim().length > 0);

const productIsMissing = (error: unknown) =>
  error instanceof Error && error.message.toLowerCase().includes('product does not exist');

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const run = await prisma.productAutomationRun.findUnique({ where: { id: params.id } });
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  try {
    if (!run.scrapedData || !run.aiCopy) {
      return NextResponse.json({ error: 'Scraped data and AI copy are required before creating a Shopify draft' }, { status: 400 });
    }
    const scrapedData = run.scrapedData as ScrapedProductData;
    const rawAiCopy = run.aiCopy as AiProductCopy;
    const decorationType = run.decorationType as DecorationType;
    const aiCopy = validateAiCopy(rawAiCopy, scrapedData, {
      pricingDecoration: decorationType,
      availableDecorationMethods: rawAiCopy.available_decoration_methods,
      preferredIndustryHandles: rawAiCopy.industry_handles,
      colors: colorsFrom(run.colors),
    });
    assertAiCopyReady(aiCopy);
    const collectionIdsByHandle = await resolveShopifyCollectionIds(aiCopy.industry_handles);
    const industryCollectionIds = aiCopy.industry_handles.map(handle => collectionIdsByHandle[handle]);

    const composed = composeShopifyPayload({
      scrapedData,
      aiCopy,
      basePrice: Number(run.basePrice),
      decorationType,
      colors: colorsFrom(run.colors),
      productLink: run.productLink,
      industryCollectionIds,
    });
    const payload = composed.payload;

    let shopify;
    if (run.shopifyProductId) {
      try {
        shopify = await updateShopifyProductMetafields(run.shopifyProductId, payload);
      } catch (error) {
        if (!productIsMissing(error)) throw error;
        shopify = await createShopifyDraftProduct(payload);
      }
    } else {
      shopify = await createShopifyDraftProduct(payload);
    }
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
      data: {
        status: 'failed',
        errorMessage: message,
        ...(productIsMissing(error) ? { shopifyProductId: null, shopifyProductUrl: null } : {}),
      },
    });
    return NextResponse.json({ error: message, run: updated }, { status: 500 });
  }
}
