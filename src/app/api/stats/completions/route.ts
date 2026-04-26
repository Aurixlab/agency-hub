import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { format, subMonths, startOfMonth } from 'date-fns';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const since = startOfMonth(subMonths(new Date(), 5));

  const logs = await prisma.activityLog.findMany({
    where: { action: 'completed', createdAt: { gte: since } },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  // Group by userId + "YYYY-MM"
  const map = new Map<string, { userId: string; name: string; month: string; count: number }>();
  for (const log of logs) {
    const month = format(log.createdAt, 'yyyy-MM');
    const key = `${log.actorId}__${month}`;
    if (!map.has(key)) {
      map.set(key, { userId: log.actorId, name: log.actor.name, month, count: 0 });
    }
    map.get(key)!.count++;
  }

  return NextResponse.json(Array.from(map.values()));
}
