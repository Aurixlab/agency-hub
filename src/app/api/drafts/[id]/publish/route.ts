import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/activity';
import { createNotification } from '@/lib/notifications';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const draft = await prisma.taskDraft.findUnique({ where: { id: params.id } });
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    if (draft.status === 'published') {
      return NextResponse.json({ error: 'Draft already published' }, { status: 400 });
    }

    const body = await request.json();
    const { projectId, title, description, priority, assigneeIds, dueDate } = body;

    if (!projectId) return NextResponse.json({ error: 'Project is required' }, { status: 400 });
    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, statuses: true },
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Task lands in the project's first workflow stage
    const statuses = Array.isArray(project.statuses) ? (project.statuses as string[]) : [];
    const firstStatus = statuses[0] || 'Backlog';

    const resolvedIds: string[] = Array.isArray(assigneeIds) ? assigneeIds : [];

    const maxOrder = await prisma.task.findFirst({
      where: { projectId, status: firstStatus, deletedAt: null },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });

    const task = await prisma.task.create({
      data: {
        projectId,
        title: title.trim(),
        description: description?.trim() || null,
        status: firstStatus,
        priority: priority || draft.priority || 'NONE',
        assigneeId: resolvedIds[0] || null,
        assigneeIds: resolvedIds,
        dueDate: dueDate ? new Date(dueDate) : null,
        orderIndex: (maxOrder?.orderIndex ?? 0) + 1000,
      },
      include: { assignee: { select: { id: true, name: true, username: true } } },
    });

    // Mark the draft as published so it leaves the inbox
    await prisma.taskDraft.update({ where: { id: draft.id }, data: { status: 'published' } });

    await logActivity({
      actorId: session.id,
      entityType: 'task',
      entityId: task.id,
      action: 'created',
      after: { title: task.title, status: task.status, priority: task.priority },
    });

    // Notify assigned users (skip self)
    const actor = await prisma.user.findUnique({ where: { id: session.id }, select: { name: true } });
    await Promise.all(
      resolvedIds
        .filter(uid => uid !== session.id)
        .map(uid => createNotification({
          userId: uid,
          type: 'task_assigned',
          taskId: task.id,
          actorName: actor?.name ?? 'Someone',
          taskTitle: task.title,
        }))
    );

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('Publish draft error:', error);
    return NextResponse.json({ error: 'Failed to publish draft' }, { status: 500 });
  }
}
