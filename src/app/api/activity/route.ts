import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entityId = searchParams.get('entityId');
  const entityType = searchParams.get('entityType');
  const limit = parseInt(searchParams.get('limit') || '50');

  const where: any = {};
  if (entityId) where.entityId = entityId;
  if (entityType) where.entityType = entityType;

  const logs = await prisma.activityLog.findMany({
    where,
    include: {
      actor: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
  });

  return NextResponse.json(logs);
}
