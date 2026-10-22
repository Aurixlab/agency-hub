import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseCapturedPage } from '@/lib/product-automation/browser-capture';

// Receives supplier HTML captured in the user's browser (Send to Aurix or Paste page source).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const run = await prisma.productAutomationRun.findUnique({ where: { id: params.id } });
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  let body: { url?: unknown; html?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Captured page could not be read' }, { status: 400 });
  }

  try {
    const scrapedData = parseCapturedPage(run.productLink, body.url, body.html);
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
    // A bad capture leaves the run as it was, so a retry or manual entry can continue from there.
    const message = error instanceof Error ? error.message : 'Failed to read captured page';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
