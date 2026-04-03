import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

const globalForPrisma = globalThis as unknown as { prisma: any };

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  // If DATABASE_URL starts with prisma://, Accelerate is enabled
  // The extension works transparently — no code changes needed
  if (process.env.DATABASE_URL?.startsWith('prisma://')) {
    return client.$extends(withAccelerate()) as unknown as PrismaClient;
  }

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
