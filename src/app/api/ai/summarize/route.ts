import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { summarizeTaskActivity } from '@/lib/claude';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { taskId } = body as { taskId?: string };

  if (!taskId) return NextResponse.json({ error: 'taskId is required' }, { status: 400 });

  const [task, activities] = await Promise.all([
    prisma.task.findUnique({
      where: { id: taskId },
      include: { project: { select: { name: true } } },
    }),
    prisma.activityLog.findMany({
      where: { entityType: 'task', entityId: taskId },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const summary = await summarizeTaskActivity({
    taskTitle: task.title,
    projectName: task.project?.name ?? 'Unknown Project',
    activities: activities.map((a: any) => ({
      actor: a.actor.name,
      action: a.action,
      before: a.before,
      after: a.after,
      at: a.createdAt.toISOString(),
    })),
  });

  return NextResponse.json({ summary });
}
