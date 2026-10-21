import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { analyticsSchema } from '@/lib/gsc-query';
import { queryAnalytics } from '@/lib/gsc-service';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequestFull(req);
  if (!session || session.role !== 'ADMIN' || session.mustChangePassword) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const args = analyticsSchema.parse(await req.json());
    return NextResponse.json(await queryAnalytics(args), { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Invalid GSC request or Google data unavailable' }, { status: 400 }); }
}
