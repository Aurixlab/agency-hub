import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const MAX_SIZE = 500 * 1024;

export async function POST(request: Request) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('avatar') as File | null;
  const targetId = (formData.get('userId') as string | null) || session.id;

  // Only admins can upload for someone else
  if (targetId !== session.id && session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Image must be under 500 KB' }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const dataUrl = `data:${file.type};base64,${Buffer.from(bytes).toString('base64')}`;

  await prisma.user.update({ where: { id: targetId }, data: { avatarUrl: dataUrl } });

  return NextResponse.json({ avatarUrl: dataUrl });
}

export async function DELETE(request: Request) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const targetId = searchParams.get('userId') || session.id;

  if (targetId !== session.id && session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.user.update({ where: { id: targetId }, data: { avatarUrl: null } });

  return NextResponse.json({ success: true });
}
