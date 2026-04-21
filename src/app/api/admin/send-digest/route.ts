import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { buildDigestData } from '@/lib/digest';
import { generateDigestEmail } from '@/lib/claude';
import { sendDigestEmail } from '@/lib/email';

export async function POST(request: Request) {
  const session = await getSessionFromRequestFull(request);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json({ error: 'ADMIN_EMAIL not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const dayRange: number = typeof body.dayRange === 'number' ? body.dayRange : 4;

  const digest = await buildDigestData(dayRange);

  if (digest.users.length === 0) {
    return NextResponse.json({ success: true, message: `No activity in the last ${dayRange} days.` });
  }

  const emailBody = await generateDigestEmail(digest);

  const from = digest.period.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const to = digest.period.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const subject = `Agency Hub Activity Digest — ${from} to ${to}`;

  await sendDigestEmail(adminEmail, subject, emailBody);

  return NextResponse.json({
    success: true,
    period: { from: digest.period.from, to: digest.period.to },
    usersIncluded: digest.users.length,
  });
}
