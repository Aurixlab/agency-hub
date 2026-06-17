// One-off migration: create the scraped_reels table via raw SQL.
// Additive only (CREATE IF NOT EXISTS) — does NOT touch any other table.
// Do NOT use `prisma db push`.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "scraped_reels" (
      "id"               TEXT PRIMARY KEY,
      "instagram_id"     TEXT UNIQUE NOT NULL,
      "url"              TEXT NOT NULL,
      "caption"          TEXT,
      "play_count"       BIGINT NOT NULL DEFAULT 0,
      "like_count"       BIGINT NOT NULL DEFAULT 0,
      "comment_count"    BIGINT NOT NULL DEFAULT 0,
      "author_username"  TEXT NOT NULL,
      "author_followers" BIGINT NOT NULL DEFAULT 1,
      "location_name"    TEXT,
      "location_id"      TEXT,
      "viral_score"      DOUBLE PRECISION NOT NULL DEFAULT 0,
      "search_topic"     TEXT NOT NULL,
      "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "scraped_reels_topic_score_idx"
      ON "scraped_reels" ("search_topic", "viral_score" DESC);
  `);

  console.log('✓ scraped_reels table ready');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
