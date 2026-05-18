import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pipelines = await prisma.pipeline.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      creator: { select: { name: true } },
      _count: { select: { nodes: true } },
    },
  });

  return NextResponse.json(pipelines);
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const pipeline = await prisma.pipeline.create({
    data: { name: name.trim(), createdBy: session.id },
  });

  return NextResponse.json(pipeline, { status: 201 });
}
