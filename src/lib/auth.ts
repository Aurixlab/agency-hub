import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { redirect } from 'next/navigation';

// No public fallback in production: with AUTH_SECRET unset, jose rejects the empty key, so signing and
// verification fail closed instead of accepting tokens forged with a key published in this repository.
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'fallback-secret-change-me'));
const SESSION_COOKIE = 'agency-hub-session';
const SESSION_DURATION = 30 * 24 * 60 * 60;

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: 'ADMIN' | 'MEMBER' | 'GUEST';
}

export async function createSession(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION * 1000);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, name: true, role: true },
  });
  if (!user) throw new Error('User not found');

  // Embed user data in JWT — read-path never needs DB
  const token = await new SignJWT({
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiresAt)
    .setIssuedAt()
    .sign(SECRET);

  await prisma.session.create({ data: { userId, token, expiresAt } });

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

// ============================================================
// FAST AUTH — JWT + one indexed session-row lookup (no user query)
// Used for ALL GET/read API routes
// ============================================================
function extractToken(request: Request): string | undefined {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1];
}

export async function getSessionFromRequest(request: Request): Promise<SessionUser | null> {
  try {
    const token = extractToken(request);
    if (!token) return null;
    const { payload } = await jwtVerify(token, SECRET);
    if (!payload.userId) return null;
    // Logout and disable delete the session row; a signed JWT alone must not outlive them.
    const session = await prisma.session.findUnique({ where: { token }, select: { expiresAt: true } });
    if (!session || session.expiresAt <= new Date()) return null;
    return {
      id: payload.userId as string,
      username: payload.username as string,
      name: payload.name as string,
      role: payload.role as 'ADMIN' | 'MEMBER' | 'GUEST',
    };
  } catch {
    return null;
  }
}

// ============================================================
// FULL AUTH — JWT + DB verification
// Used for write operations (POST/PATCH/DELETE) and admin actions
// ============================================================
export async function getSessionFromRequestFull(request: Request): Promise<SessionUser | null> {
  try {
    const token = extractToken(request);
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
      select: { id: true, username: true, name: true, role: true, disabled: true },
    });
    if (!user || user.disabled) return null;
    return { id: user.id, username: user.username, name: user.name, role: user.role };
  } catch {
    return null;
  }
}

// Server component auth (full DB check — used once on page load)
export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
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
      select: { id: true, username: true, name: true, role: true, disabled: true },
    });
    if (!user || user.disabled) return null;
    return { id: user.id, username: user.username, name: user.name, role: user.role };
  } catch {
    return null;
  }
}

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireAuth();
  if (session.role !== 'ADMIN') redirect('/dashboard');
  return session;
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { token } });
  cookieStore.delete(SESSION_COOKIE);
}
