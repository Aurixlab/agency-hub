import { NextResponse } from 'next/server';
import { buildDigestData } from '@/lib/digest';
import { generateDigestEmail } from '@/lib/claude';
import { sendDigestEmail } from '@/lib/email';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json({ error: 'ADMIN_EMAIL not configured' }, { status: 500 });
  }

  const digest = await buildDigestData(4);

  if (digest.users.length === 0) {
    return NextResponse.json({ success: true, message: 'No activity in the last 4 days — digest skipped.' });
  }

  const body = await generateDigestEmail(digest);

  const from = digest.period.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const to = digest.period.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const subject = `Agency Hub Activity Digest — ${from} to ${to}`;

  await sendDigestEmail(adminEmail, subject, body);

  return NextResponse.json({
    success: true,
    period: { from: digest.period.from, to: digest.period.to },
    usersIncluded: digest.users.length,
  });
}
