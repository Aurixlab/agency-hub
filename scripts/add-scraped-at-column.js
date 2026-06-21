// One-off migration: add scraped_at column to scraped_reels table.
// Additive only — safe to run multiple times.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "scraped_reels"
    ADD COLUMN IF NOT EXISTS "scraped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "scraped_reels_topic_scraped_idx"
      ON "scraped_reels" ("search_topic", "scraped_at" DESC);
  `);

  console.log('✓ scraped_at column and index added');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
