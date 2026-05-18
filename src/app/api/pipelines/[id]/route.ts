import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pipeline = await prisma.pipeline.findUnique({
    where: { id: params.id },
    include: {
      nodes: { orderBy: { createdAt: 'asc' } },
      creator: { select: { name: true } },
    },
  });

  if (!pipeline) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(pipeline);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const pipeline = await prisma.pipeline.update({
    where: { id: params.id },
    data: { name: name.trim() },
  });

  return NextResponse.json(pipeline);
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await prisma.pipeline.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
