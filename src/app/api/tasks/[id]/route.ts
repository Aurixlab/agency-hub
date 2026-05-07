import { NextResponse } from 'next/server';
import { getSessionFromRequest, getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/activity';
import { createNotification } from '@/lib/notifications';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const task = await prisma.task.findUnique({
    where: { id: params.id },
    include: {
      assignee: { select: { id: true, name: true, username: true } },
      project: { select: { id: true, name: true, statuses: true, tags: true } },
      comments: {
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json(task);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { version, ...updates } = body;

    // Handle bulk order update for kanban drag-drop
    if (body.bulkOrder) {
      const { tasks: taskOrders } = body.bulkOrder;
      for (const item of taskOrders) {
        await prisma.task.update({
          where: { id: item.id },
          data: {
            status: item.status,
            orderIndex: item.orderIndex,
            version: { increment: 1 },
          },
        });
      }
      return NextResponse.json({ success: true });
    }

    const current = await prisma.task.findUnique({ where: { id: params.id } });
    if (!current) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Version conflict check
    if (version !== undefined && version !== current.version) {
      return NextResponse.json(
        {
          error: 'CONFLICT',
          message: 'This task was updated by someone else. Please reload before saving.',
          currentVersion: current.version,
          currentData: current,
        },
        { status: 409 }
      );
    }

    const prevAssigneeIds: string[] = Array.isArray(current.assigneeIds) ? current.assigneeIds as string[] : [];

    const before = {
      title: current.title,
      status: current.status,
      priority: current.priority,
      assigneeId: current.assigneeId,
      dueDate: current.dueDate,
    };

    // Process updates
    const data: any = { version: { increment: 1 } };
    if (updates.title !== undefined) data.title = updates.title.trim();
    if (updates.description !== undefined) data.description = updates.description?.trim() || null;
    if (updates.status !== undefined) data.status = updates.status;
    if (updates.priority !== undefined) data.priority = updates.priority;
    if (updates.assigneeId !== undefined) data.assigneeId = updates.assigneeId || null;
    if (updates.assigneeIds !== undefined) {
      const ids = Array.isArray(updates.assigneeIds) ? updates.assigneeIds : [];
      data.assigneeIds = ids;
      data.assigneeId = ids[0] || null;
    }
    if (updates.dueDate !== undefined) data.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
    if (updates.doneDate !== undefined) data.doneDate = updates.doneDate ? new Date(updates.doneDate) : null;
    if (updates.tags !== undefined) data.tags = updates.tags;
    if (updates.orderIndex !== undefined) data.orderIndex = updates.orderIndex;

    const updated = await prisma.task.update({
      where: { id: params.id },
      data,
      include: {
        assignee: { select: { id: true, name: true, username: true } },
      },
    });

    await logActivity({
      actorId: session.id,
      entityType: 'task',
      entityId: params.id,
      action: 'updated',
      before,
      after: {
        title: updated.title,
        status: updated.status,
        priority: updated.priority,
        assigneeId: updated.assigneeId,
        dueDate: updated.dueDate,
      },
    });

    // Notify newly added assignees
    const newAssigneeIds: string[] = Array.isArray(updated.assigneeIds) ? updated.assigneeIds as string[] : [];
    const addedIds = newAssigneeIds.filter(uid => !prevAssigneeIds.includes(uid) && uid !== session.id);
    if (addedIds.length > 0) {
      const actor = await prisma.user.findUnique({ where: { id: session.id }, select: { name: true } });
      await Promise.all(
        addedIds.map(uid => createNotification({
          userId: uid,
          type: 'task_assigned',
          taskId: params.id,
          actorName: actor?.name ?? 'Someone',
          taskTitle: updated.title,
        }))
      );
    }

    // Log 'completed' when task moves into the done status
    if (updates.status && current.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: current.projectId },
        select: { statuses: true },
      });
      const statuses = Array.isArray(project?.statuses) ? project!.statuses as string[] : [];
      const doneStatus = statuses.length > 0 ? statuses[statuses.length - 1] : null;
      if (doneStatus && updates.status === doneStatus && current.status !== doneStatus) {
        await logActivity({
          actorId: session.id,
          entityType: 'task',
          entityId: params.id,
          action: 'completed',
          after: { title: updated.title },
        });
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Update task error:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const restore = searchParams.get('restore') === 'true';

  if (restore) {
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }
    await prisma.task.update({
      where: { id: params.id },
      data: { deletedAt: null },
    });
    await logActivity({
      actorId: session.id,
      entityType: 'task',
      entityId: params.id,
      action: 'restored',
    });
    return NextResponse.json({ success: true });
  }

  await prisma.task.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  });

  await logActivity({
    actorId: session.id,
    entityType: 'task',
    entityId: params.id,
    action: 'deleted',
  });

  return NextResponse.json({ success: true });
}
