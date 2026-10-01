import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateProductCopy } from '@/lib/product-automation/gemini-copy';
import { FIXED_SIZES } from '@/lib/product-automation/variants';
import type { AiProductCopy, DecorationType, ScrapedProductData } from '@/lib/product-automation/types';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const run = await prisma.productAutomationRun.findUnique({ where: { id: params.id } });
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  try {
    const body = await request.json().catch(() => ({}));
    const scrapedData = (body.scrapedData || run.scrapedData) as ScrapedProductData | null;
    if (!scrapedData) return NextResponse.json({ error: 'Scraped data is required before generating copy' }, { status: 400 });

    const seed = (run.aiCopy || {}) as Partial<AiProductCopy>;
    const aiCopy = await generateProductCopy(scrapedData, {
      pricingDecoration: run.decorationType as DecorationType,
      availableDecorationMethods: seed.available_decoration_methods,
      preferredIndustryHandles: seed.industry_handles,
      colors: Array.isArray(run.colors) ? run.colors.filter((item: unknown): item is string => typeof item === 'string') : [],
      sizes: [...FIXED_SIZES],
    });
    const updated = await prisma.productAutomationRun.update({
      where: { id: run.id },
      data: {
        scrapedData: scrapedData as any,
        aiCopy: aiCopy as any,
        status: 'generated',
        errorMessage: null,
      },
    });

    return NextResponse.json({ run: updated, aiCopy });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate product copy';
    const updated = await prisma.productAutomationRun.update({
      where: { id: run.id },
      data: { status: 'failed', errorMessage: message },
    });
    return NextResponse.json({ error: message, run: updated }, { status: 500 });
  }
}
