import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { scrapeProductPage } from '@/lib/product-automation/scraper';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const run = await prisma.productAutomationRun.findUnique({ where: { id: params.id } });
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  try {
    const scrapedData = await scrapeProductPage(run.productLink);
    const updated = await prisma.productAutomationRun.update({
      where: { id: run.id },
      data: {
        scrapedData: scrapedData as any,
        status: 'scraped',
        errorMessage: null,
      },
    });
    return NextResponse.json({ run: updated, scrapedData });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to scrape product page';
    const updated = await prisma.productAutomationRun.update({
      where: { id: run.id },
      data: { status: 'failed', errorMessage: message },
    });
    return NextResponse.json({ error: message, run: updated }, { status: 500 });
  }
}
