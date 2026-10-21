import { getSessionFromRequestFull } from './auth';
import { NextResponse } from 'next/server';

export async function requireSeoSession(request: Request) {
  const session = await getSessionFromRequestFull(request);
  if (!session || !['ADMIN', 'MEMBER'].includes(session.role) || session.mustChangePassword) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
