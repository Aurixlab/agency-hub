import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/activity';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const assigneeId = searchParams.get('assigneeId');
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');
  const dueBefore = searchParams.get('dueBefore');
  const myTasks = searchParams.get('myTasks') === 'true';

  const where: any = { deletedAt: null };

  if (projectId) where.projectId = projectId;
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (dueBefore) where.dueDate = { lte: new Date(dueBefore) };

  if (myTasks) {
    // Check BOTH assigneeId (legacy single) AND assigneeIds (multi-assign JSON array)
    where.OR = [
      { assigneeId: session.id },
      { assigneeIds: { array_contains: [session.id] } },
    ];
  } else if (assigneeId) {
    where.OR = [
      { assigneeId: assigneeId },
      { assigneeIds: { array_contains: [assigneeId] } },
    ];
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true, username: true } },
      project: { select: { id: true, name: true, statuses: true } },
      _count: { select: { comments: true } },
    },
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'desc' }],
  });

  // Resolve assigneeIds to user objects
  const allAssigneeIds = Array.from(new Set(tasks.flatMap((t: any) => {
    const ids = t.assigneeIds as string[] | undefined;
    return Array.isArray(ids) ? ids : [];
  })));

  const assigneeUsers = allAssigneeIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: allAssigneeIds } },
        select: { id: true, name: true, username: true },
      })
    : [];
  const userMap = new Map(assigneeUsers.map(u => [u.id, u]));

  const enriched = tasks.map((t: any) => {
    const ids = Array.isArray(t.assigneeIds) ? t.assigneeIds as string[] : [];
    return {
      ...t,
      assignees: ids.map((id: string) => userMap.get(id)).filter(Boolean),
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { projectId, title, description, status, priority, assigneeIds, dueDate, tags } = body;

    if (!projectId || !title?.trim()) {
      return NextResponse.json({ error: 'Project ID and title are required' }, { status: 400 });
    }

    const resolvedIds: string[] = Array.isArray(assigneeIds) ? assigneeIds : [];

    const maxOrder = await prisma.task.findFirst({
      where: { projectId, status: status || 'Backlog', deletedAt: null },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });

    const task = await prisma.task.create({
      data: {
        projectId,
        title: title.trim(),
        description: description?.trim() || null,
        status: status || 'Backlog',
        priority: priority || 'NONE',
        assigneeId: resolvedIds[0] || null,
        assigneeIds: resolvedIds,
        dueDate: dueDate ? new Date(dueDate) : null,
        tags: tags || [],
        orderIndex: (maxOrder?.orderIndex ?? 0) + 1000,
      },
      include: {
        assignee: { select: { id: true, name: true, username: true } },
      },
    });

    await logActivity({
      actorId: session.id,
      entityType: 'task',
      entityId: task.id,
      action: 'created',
      after: { title: task.title, status: task.status, priority: task.priority },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('Create task error:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
