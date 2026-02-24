import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/activity';

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
  const session = await getSessionFromRequest(request);
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
    if (updates.dueDate !== undefined) data.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
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
  const session = await getSessionFromRequest(request);
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
