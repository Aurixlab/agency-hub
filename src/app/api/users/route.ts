import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionFromRequest, getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/activity';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      role: true,
      disabled: true,
      avatarUrl: true,
      bio: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const session = await getSessionFromRequestFull(request);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  try {
    const { username, name, role, email } = await request.json();
    // Members sign in with Google, which matches this address in lowercase.
    const address = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!username?.trim() || !name?.trim() || !address) {
      return NextResponse.json({ error: 'Username, name, and email are required' }, { status: 400 });
    }

    if (!z.string().email().safeParse(address).success) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { username: username.toLowerCase().trim() } });
    if (existing) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
    }

    // Check both columns google-callback matches on. Stored addresses may be mixed case, so compare in lowercase.
    const accounts: { email: string | null; altEmail: string | null }[] = await prisma.user.findMany({ select: { email: true, altEmail: true } });
    if (accounts.some(a => [a.email, a.altEmail].some(e => e?.trim().toLowerCase() === address))) {
      return NextResponse.json({ error: 'Email already belongs to another user' }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase().trim(),
        name: name.trim(),
        email: address,
        role: role || 'MEMBER',
        // Sign-in is Google only. The column is still required, so store a value that is not a valid hash.
        passwordHash: '!',
        mustChangePassword: false,
      },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        disabled: true,
        avatarUrl: true,
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
  const session = await getSessionFromRequestFull(request);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  try {
    const { userId, action } = await request.json();

    if (!userId || !action) {
      return NextResponse.json({ error: 'User ID and action are required' }, { status: 400 });
    }

    if (action === 'disable') {
      await prisma.user.update({ where: { id: userId }, data: { disabled: true } });
      // Clear their sessions
      await prisma.session.deleteMany({ where: { userId } });
    } else if (action === 'enable') {
      await prisma.user.update({ where: { id: userId }, data: { disabled: false } });
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
