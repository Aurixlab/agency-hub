import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hashPassword, validatePasswordStrength } from '@/lib/password';
import { logActivity } from '@/lib/activity';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      disabled: true,
      mustChangePassword: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  try {
    const { username, name, role, password } = await request.json();

    if (!username?.trim() || !name?.trim() || !password) {
      return NextResponse.json({ error: 'Username, name, and password are required' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { username: username.toLowerCase().trim() } });
    if (existing) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
    }

    const validation = validatePasswordStrength(password);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }

    const hash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase().trim(),
        name: name.trim(),
        role: role || 'MEMBER',
        passwordHash: hash,
        mustChangePassword: true,
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        disabled: true,
        mustChangePassword: true,
        createdAt: true,
      },
    });

    await logActivity({
      actorId: session.id,
      entityType: 'user',
      entityId: user.id,
      action: 'created',
      after: { username: user.username, name: user.name, role: user.role },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  try {
    const { userId, action, password } = await request.json();

    if (!userId || !action) {
      return NextResponse.json({ error: 'User ID and action are required' }, { status: 400 });
    }

    if (action === 'disable') {
      await prisma.user.update({ where: { id: userId }, data: { disabled: true } });
      // Clear their sessions
      await prisma.session.deleteMany({ where: { userId } });
    } else if (action === 'enable') {
      await prisma.user.update({ where: { id: userId }, data: { disabled: false } });
    } else if (action === 'resetPassword') {
      if (!password) {
        return NextResponse.json({ error: 'New password is required' }, { status: 400 });
      }
      const hash = await hashPassword(password);
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: hash, mustChangePassword: true },
      });
      await prisma.session.deleteMany({ where: { userId } });
    }

    await logActivity({
      actorId: session.id,
      entityType: 'user',
      entityId: userId,
      action: 'updated',
      after: { action },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin user action error:', error);
    return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 });
  }
}
