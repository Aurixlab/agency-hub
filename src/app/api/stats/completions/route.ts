import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { format, subMonths, startOfMonth } from 'date-fns';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const since = startOfMonth(subMonths(new Date(), 5));

  const tasks = await prisma.task.findMany({
    where: {
      doneDate: { gte: since },
      deletedAt: null,
    },
    select: {
      doneDate: true,
      assigneeId: true,
      assigneeIds: true,
    },
  }) as any[];

  // Also get user info for all assignees
  const allAssigneeIds = Array.from(new Set(
    tasks.flatMap((t: any) => {
      const ids: string[] = Array.isArray(t.assigneeIds) ? (t.assigneeIds as string[]) : [];
      if (t.assigneeId) ids.push(t.assigneeId);
      return ids;
    })
  ));

  const users = await prisma.user.findMany({
    where: { id: { in: allAssigneeIds } },
    select: { id: true, name: true },
  });
  const userMap = new Map(users.map((u: any) => [u.id, u.name]));

  // Group by userId + "YYYY-MM"
  const map = new Map<string, { userId: string; name: string; month: string; count: number }>();
  for (const task of tasks) {
    if (!task.doneDate) continue;
    const month = format(task.doneDate as Date, 'yyyy-MM');
    const assigneeIds: string[] = Array.isArray(task.assigneeIds) ? (task.assigneeIds as string[]) : [];
    if (task.assigneeId && !assigneeIds.includes(task.assigneeId)) assigneeIds.push(task.assigneeId);

    // Count for each assignee
    for (const uid of assigneeIds) {
      const name = userMap.get(uid);
      if (!name) continue;
      const key = `${uid}__${month}`;
      if (!map.has(key)) {
        map.set(key, { userId: uid, name: name as string, month, count: 0 });
      }
      map.get(key)!.count++;
    }
  }

  return NextResponse.json(Array.from(map.values()));
}
