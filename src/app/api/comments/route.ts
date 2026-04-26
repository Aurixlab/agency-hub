import { NextResponse } from 'next/server';
import { getSessionFromRequest, getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/activity';
import { createNotification } from '@/lib/notifications';

export async function POST(request: Request) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { taskId, body } = await request.json();

    if (!taskId || !body?.trim()) {
      return NextResponse.json({ error: 'Task ID and comment body are required' }, { status: 400 });
    }

    const comment = await prisma.comment.create({
      data: {
        taskId,
        authorId: session.id,
        body: body.trim(),
      },
      include: {
        author: { select: { id: true, name: true } },
      },
    });

    await logActivity({
      actorId: session.id,
      entityType: 'comment',
      entityId: comment.id,
      action: 'created',
      after: { taskId, body: body.trim().substring(0, 100) },
    });

    // Notify task assignees (except the commenter)
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { title: true, assigneeId: true, assigneeIds: true },
    });
    if (task) {
      const ids = Array.isArray(task.assigneeIds) ? task.assigneeIds as string[] : [];
      if (task.assigneeId && !ids.includes(task.assigneeId)) ids.push(task.assigneeId);
      const uniqueIds = Array.from(new Set(ids)).filter((uid: string) => uid !== session.id);
      await Promise.all(
        uniqueIds.map(uid => createNotification({
          userId: uid,
          type: 'comment_added',
          taskId,
          actorName: session.name,
          taskTitle: task.title,
        }))
      );
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error('Create comment error:', error);
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
  }
}
