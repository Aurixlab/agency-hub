import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { composeShopifyPayload } from '@/lib/product-automation/payload';
import type { AiProductCopy, DecorationType, ScrapedProductData } from '@/lib/product-automation/types';

const colorsFrom = (value: unknown) =>
  (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === 'string' && item.trim().length > 0);

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const run = await prisma.productAutomationRun.findUnique({ where: { id: params.id } });
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  try {
    const body = await request.json().catch(() => ({}));
    const scrapedData = (body.scrapedData || run.scrapedData) as ScrapedProductData | null;
    const aiCopy = (body.aiCopy || run.aiCopy) as AiProductCopy | null;
    const colors = colorsFrom(body.colors || run.colors);

    if (!scrapedData) return NextResponse.json({ error: 'Scraped data is required before preview' }, { status: 400 });
    if (!aiCopy) return NextResponse.json({ error: 'AI copy is required before preview' }, { status: 400 });
    if (!colors.length) return NextResponse.json({ error: 'At least one color is required before preview' }, { status: 400 });

    const { pricing, payload } = composeShopifyPayload({
      scrapedData,
      aiCopy,
      basePrice: Number(run.basePrice),
      decorationType: run.decorationType as DecorationType,
      colors,
    });

    const updated = await prisma.productAutomationRun.update({
      where: { id: run.id },
      data: {
        colors: colors as any,
        scrapedData: scrapedData as any,
        aiCopy: aiCopy as any,
        pricing: pricing as any,
        variants: payload.variants as any,
        shopifyPayload: payload as any,
        status: 'previewed',
        errorMessage: null,
      },
    });

    return NextResponse.json({ run: updated, pricing, variants: payload.variants, shopifyPayload: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to preview product';
    const updated = await prisma.productAutomationRun.update({
      where: { id: run.id },
      data: { status: 'failed', errorMessage: message },
    });
    return NextResponse.json({ error: message, run: updated }, { status: 500 });
  }
}
