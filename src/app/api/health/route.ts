import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Health check endpoint — hit by Vercel cron to keep functions warm
// Also warms the Prisma connection pool
export async function GET() {
  try {
    // Simple query to keep DB connection alive
    await prisma.user.count();
    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
