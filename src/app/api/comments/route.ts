import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/activity';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
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

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error('Create comment error:', error);
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
  }
}
