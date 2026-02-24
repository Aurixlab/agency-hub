import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { verifyPassword } from './password';
import { redirect } from 'next/navigation';

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || 'fallback-secret-change-me');
const SESSION_COOKIE = 'agency-hub-session';
const SESSION_DURATION = 30 * 24 * 60 * 60; // 30 days in seconds

// Rate limiting constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: 'ADMIN' | 'MEMBER' | 'GUEST';
  mustChangePassword: boolean;
}

export async function createSession(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION * 1000);

  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiresAt)
    .setIssuedAt()
    .sign(SECRET);

  // Store session in DB for server-side validation
  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });

  return token;
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;

    if (!token) return null;

    // Verify JWT
    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.userId as string;

    if (!userId) return null;

    // Check session exists in DB
    const session = await prisma.session.findFirst({
      where: {
        token,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) return null;

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        mustChangePassword: true,
        disabled: true,
      },
    });

    if (!user || user.disabled) return null;

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  } catch {
    return null;
  }
}

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  if (session.mustChangePassword) {
    redirect('/change-password');
  }
  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireAuth();
  if (session.role !== 'ADMIN') {
    redirect('/dashboard');
  }
  return session;
}

export async function login(
  username: string,
  password: string
): Promise<{ success: boolean; error?: string; mustChangePassword?: boolean }> {
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user) {
    return { success: false, error: 'Invalid username or password' };
  }

  if (user.disabled) {
    return { success: false, error: 'This account has been disabled' };
  }

  // Check lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return { success: false, error: `Account locked. Try again in ${minutesLeft} minutes` };
  }

  // Verify password
  const valid = await verifyPassword(user.passwordHash, password);

  if (!valid) {
    const attempts = user.loginAttempts + 1;
    const updates: any = { loginAttempts: attempts };

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      updates.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION);
      updates.loginAttempts = 0;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updates,
    });

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      return { success: false, error: 'Too many failed attempts. Account locked for 15 minutes' };
    }

    return { success: false, error: 'Invalid username or password' };
  }

  // Reset login attempts on success
  await prisma.user.update({
    where: { id: user.id },
    data: { loginAttempts: 0, lockedUntil: null },
  });

  await createSession(user.id);

  return { success: true, mustChangePassword: user.mustChangePassword };
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }

  cookieStore.delete(SESSION_COOKIE);
}

// Get session from token string (for API routes)
export async function getSessionFromRequest(request: Request): Promise<SessionUser | null> {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const tokenMatch = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
    const token = tokenMatch?.[1];

    if (!token) return null;

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.userId as string;
    if (!userId) return null;

    const session = await prisma.session.findFirst({
      where: { token, expiresAt: { gt: new Date() } },
    });
    if (!session) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, name: true, role: true, mustChangePassword: true, disabled: true },
    });

    if (!user || user.disabled) return null;

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  } catch {
    return null;
  }
}
