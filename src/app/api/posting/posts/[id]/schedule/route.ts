import { NextResponse } from 'next/server';
import { PostingPostStatus } from '@prisma/client';
import { getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const scheduledTime = body.scheduled_time ? new Date(body.scheduled_time) : null;
    if (!scheduledTime || Number.isNaN(scheduledTime.getTime())) {
      return NextResponse.json({ error: 'Schedule time is required' }, { status: 400 });
    }

    const existing = await prisma.scheduledPost.findFirst({
      where: {
        id: params.id,
        ...(session.role === 'ADMIN' ? {} : { createdBy: session.id }),
      },
    });
    if (!existing) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    if (existing.status === PostingPostStatus.POSTING || existing.status === PostingPostStatus.POSTED) {
      return NextResponse.json({ error: 'This post can no longer be rescheduled' }, { status: 400 });
    }

    const post = await prisma.scheduledPost.update({
      where: { id: params.id },
      data: {
        status: PostingPostStatus.SCHEDULED,
        scheduledTime,
        approvedAt: new Date(),
        failureReason: null,
        nextRetryAt: null,
      },
      include: { account: { select: { id: true, name: true, pageId: true, platform: true } } },
    });

    return NextResponse.json({ post });
  } catch (error) {
    console.error('Schedule post error:', error);
    return NextResponse.json({ error: 'Failed to schedule post' }, { status: 500 });
  }
}
