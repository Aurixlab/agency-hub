import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateProductCopy } from '@/lib/product-automation/deepseek';
import type { ScrapedProductData } from '@/lib/product-automation/types';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const run = await prisma.productAutomationRun.findUnique({ where: { id: params.id } });
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  try {
    const body = await request.json().catch(() => ({}));
    const scrapedData = (body.scrapedData || run.scrapedData) as ScrapedProductData | null;
    if (!scrapedData) return NextResponse.json({ error: 'Scraped data is required before generating copy' }, { status: 400 });

    const aiCopy = await generateProductCopy(scrapedData);
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
