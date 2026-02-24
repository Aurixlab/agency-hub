import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const templates = await prisma.template.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(templates);
}
