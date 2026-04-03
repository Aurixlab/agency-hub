import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const templates = await prisma.template.findMany({
    orderBy: { createdAt: 'asc' },
  });

  // Templates rarely change — cache for 5 minutes, serve stale for 10 min while revalidating
  return NextResponse.json(templates, {
    headers: {
      'Cache-Control': 'private, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
