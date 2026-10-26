import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from './auth';
import { matches } from './mcp-auth';

// Cron handlers must authenticate themselves: middleware alone is not a sufficient boundary.
// Accepts the Vercel cron bearer secret (or the legacy ?secret= query), or a signed-in ADMIN/MEMBER.
// Returns a 401 response when the caller is not authorized, otherwise null.
export async function requireCronOrSession(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const supplied = new URL(request.url).searchParams.get('secret') || '';
    if (matches(request.headers.get('authorization') || '', `Bearer ${secret}`) || (supplied && matches(supplied, secret))) return null;
  }
  const session = await getSessionFromRequestFull(request);
  if (session && ['ADMIN', 'MEMBER'].includes(session.role) && !session.mustChangePassword) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
