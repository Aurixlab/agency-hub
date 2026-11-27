import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { getEmailsEnabled, setEmailsEnabled } from '@/lib/email-settings';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Returns the admin's session, or the response that turns everyone else away. */
async function requireAdminRequest(request: Request) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (session.role !== 'ADMIN' || session.mustChangePassword) {
    return { denied: NextResponse.json({ error: 'Admin only' }, { status: 403 }) };
  }
  return { session };
}

export async function GET(request: Request) {
  const { denied } = await requireAdminRequest(request);
  if (denied) return denied;

  try {
    return NextResponse.json({ enabled: await getEmailsEnabled(prisma) });
  } catch (error) {
    console.error('Read email setting error:', error);
    return NextResponse.json({ error: 'Failed to load the email setting' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { session, denied } = await requireAdminRequest(request);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const enabled = body?.enabled;
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 });
  }

  try {
    await setEmailsEnabled(prisma, enabled, session.id);
    return NextResponse.json({ enabled });
  } catch (error) {
    console.error('Save email setting error:', error);
    return NextResponse.json({ error: 'Failed to save the email setting' }, { status: 500 });
  }
}
