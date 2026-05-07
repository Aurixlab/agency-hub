import { NextResponse } from 'next/server';
import { getSessionFromRequest, getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const notifications = await prisma.notification.findMany({
    where: { userId: session.id },
    orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
    take: 30,
  });

  const unreadCount = notifications.filter((n: { read: boolean }) => !n.read).length;

  return NextResponse.json({ notifications, unreadCount });
}

export async function PATCH(request: Request) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await prisma.notification.updateMany({
    where: { userId: session.id, read: false },
    data: { read: true },
  });

  return NextResponse.json({ success: true });
}
