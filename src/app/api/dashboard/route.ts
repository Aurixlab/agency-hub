import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Consolidated endpoint: returns everything the dashboard needs in ONE request
// Instead of 3 separate calls (/api/tasks?myTasks=true + /api/projects + /api/auth/me)
export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Run both queries in parallel — single cold start, parallel DB execution
  const [myTasks, projects] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: session.id, deletedAt: null },
      include: {
        assignee: { select: { id: true, name: true, username: true } },
        project: { select: { id: true, name: true, statuses: true } },
        _count: { select: { comments: true } },
      },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.project.findMany({
      where: { deletedAt: null },
      include: {
        _count: { select: { tasks: { where: { deletedAt: null } } } },
        template: { select: { name: true, icon: true, color: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  return NextResponse.json({
    user: session,
    myTasks,
    projects,
  });
}
