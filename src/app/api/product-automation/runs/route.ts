import { NextResponse } from 'next/server';
import { getSessionFromRequest, getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { DecorationType } from '@/lib/product-automation/types';

const validDecoration = (value: unknown): value is DecorationType =>
  value === 'print' || value === 'embroidery';

const normalizeColors = (value: unknown) =>
  Array.from(new Set((Array.isArray(value) ? value : [])
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)));

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const runs = await prisma.productAutomationRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 25,
    include: { creator: { select: { id: true, name: true, username: true } } },
  });

  return NextResponse.json({ runs });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const productLink = typeof body.product_link === 'string' ? body.product_link.trim() : '';
    const basePrice = Number(body.base_price);
    const decorationType = body.decoration_type;
    const colors = normalizeColors(body.colors);

    if (!productLink) return NextResponse.json({ error: 'Product link is required' }, { status: 400 });
    try { new URL(productLink); } catch { return NextResponse.json({ error: 'Product link must be a valid URL' }, { status: 400 }); }
    if (!Number.isFinite(basePrice) || basePrice <= 0) return NextResponse.json({ error: 'Base price must be greater than 0' }, { status: 400 });
    if (!validDecoration(decorationType)) return NextResponse.json({ error: 'Decoration type must be print or embroidery' }, { status: 400 });
    if (!colors.length) return NextResponse.json({ error: 'At least one color is required' }, { status: 400 });

    const run = await prisma.productAutomationRun.create({
      data: {
        createdBy: session.id,
        productLink,
        basePrice,
        decorationType,
        colors: colors as any,
        imagesReady: Boolean(body.images_ready),
        status: 'draft',
      },
    });

    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    console.error('Create product automation run error:', error);
    return NextResponse.json({ error: 'Failed to create product automation run' }, { status: 500 });
  }
}
