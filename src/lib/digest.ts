import { prisma } from '@/lib/prisma';
import type { DigestData, DigestUserActivity } from '@/lib/claude';

export async function buildDigestData(dayRange: number = 4): Promise<DigestData> {
  const to = new Date();
  const from = new Date(to.getTime() - dayRange * 24 * 60 * 60 * 1000);

  const logs = await prisma.activityLog.findMany({
    where: { createdAt: { gte: from } },
    include: { actor: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const byActor = new Map<string, DigestUserActivity>();

  for (const log of logs) {
    const actorId = log.actorId;
    if (!byActor.has(actorId)) {
      byActor.set(actorId, {
        name: log.actor.name,
        actionsCount: 0,
        actions: [],
      });
    }

    const entry = byActor.get(actorId)!;
    entry.actionsCount++;

    // Extract a readable entity name from before/after JSON snapshots
    let entityName = log.entityId;
    const snapshot = (log.after ?? log.before) as Record<string, unknown> | null;
    if (snapshot && typeof snapshot === 'object') {
      entityName =
        (snapshot.title as string) ||
        (snapshot.name as string) ||
        log.entityId;
    }

    entry.actions.push({
      action: log.action,
      entityType: log.entityType,
      entityName,
      at: log.createdAt,
    });
  }

  return {
    period: { from, to },
    users: Array.from(byActor.values()),
  };
}
