import { NextResponse } from 'next/server';
import { runPostingPublishCycle } from '@/lib/posting/publisher';

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runPostingPublishCycle();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Posting publish cron error:', error);
    return NextResponse.json({ error: 'Failed to publish due posts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
