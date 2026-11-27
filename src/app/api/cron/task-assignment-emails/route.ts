import { NextResponse } from 'next/server';
import { matches } from '@/lib/mcp-auth';
import { runAssignmentEmails } from '@/lib/task-emails';

export const dynamic = 'force-dynamic';

// Cron secret only: unlike other cron routes, a signed-in member must not be able to trigger sends.
// Query params: dryRun=1 (build, send nothing) and sample=<username> (made-up content, sent to that user only).
// The response ends up in public CI logs: counts and generic errors only.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !matches(request.headers.get('authorization') || '', `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, errors: ['unauthorized'] }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const dryRun = params.get('dryRun') === '1';
  // An empty `sample=` stays in sample mode, so it can never fall through to a real send.
  const sample = params.get('sample')?.trim();

  try {
    const result = await runAssignmentEmails({ dryRun, sample });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Task assignment emails error:', error);
    return NextResponse.json({ ok: false, errors: ['internal error'] }, { status: 500 });
  }
}
