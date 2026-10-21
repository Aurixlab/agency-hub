import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getSessionFromRequestFull(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json(session, { headers: { 'Cache-Control': 'no-store' } });
}
