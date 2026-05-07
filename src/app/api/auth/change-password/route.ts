import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { hashPassword, validatePasswordStrength } from '@/lib/password';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { newPassword } = await request.json();

    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }

    const hash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: session.id },
      data: {
        passwordHash: hash,
        mustChangePassword: false,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
