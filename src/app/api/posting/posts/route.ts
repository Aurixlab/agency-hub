import { NextResponse } from 'next/server';
import { PostingPostStatus } from '@prisma/client';
import { getSessionFromRequest, getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeMediaUrls } from '@/lib/posting/status';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const posts = await prisma.scheduledPost.findMany({
    where: session.role === 'ADMIN' ? {} : { createdBy: session.id },
    include: {
      account: { select: { id: true, name: true, pageId: true, platform: true } },
      creator: { select: { id: true, name: true, username: true } },
      logs: { orderBy: { createdAt: 'desc' }, take: 3 },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ posts });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const accountId = typeof body.account_id === 'string' ? body.account_id.trim() : '';
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const mediaUrls = normalizeMediaUrls(body.media_urls);
    const scheduledTime = body.scheduled_time ? new Date(body.scheduled_time) : null;

    if (!accountId) return NextResponse.json({ error: 'Account is required' }, { status: 400 });
    if (!content) return NextResponse.json({ error: 'Post content is required' }, { status: 400 });
    if (scheduledTime && Number.isNaN(scheduledTime.getTime())) {
      return NextResponse.json({ error: 'Schedule time must be a valid date' }, { status: 400 });
    }

    const account = await prisma.postingAccount.findFirst({
      where: {
        id: accountId,
        ...(session.role === 'ADMIN' ? {} : { createdBy: session.id }),
      },
    });
    if (!account) return NextResponse.json({ error: 'Posting account not found' }, { status: 404 });

    const post = await prisma.scheduledPost.create({
      data: {
        accountId,
        createdBy: session.id,
        content,
        mediaUrls,
        scheduledTime,
        status: scheduledTime ? PostingPostStatus.SCHEDULED : PostingPostStatus.DRAFT,
        approvedAt: scheduledTime ? new Date() : null,
      },
      include: { account: { select: { id: true, name: true, pageId: true, platform: true } } },
    });

    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    console.error('Create scheduled post error:', error);
    return NextResponse.json({ error: 'Failed to create scheduled post' }, { status: 500 });
  }
}
