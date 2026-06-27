// One-off migration: create creative intelligence tables.
// Requires DATABASE_URL or DIRECT_URL to be set in the environment.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "creative_items" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "source" TEXT NOT NULL,
      "source_item_id" TEXT NOT NULL UNIQUE,
      "type" TEXT NOT NULL,
      "url" TEXT NOT NULL,
      "thumbnail_url" TEXT,
      "video_url" TEXT,
      "caption" TEXT,
      "ad_copy" TEXT,
      "creator_name" TEXT,
      "creator_handle" TEXT,
      "platform" TEXT NOT NULL,
      "country" TEXT,
      "city" TEXT,
      "topic" TEXT NOT NULL,
      "event_name" TEXT,
      "published_at" TIMESTAMP(3),
      "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "view_count" BIGINT NOT NULL DEFAULT 0,
      "like_count" BIGINT NOT NULL DEFAULT 0,
      "comment_count" BIGINT NOT NULL DEFAULT 0,
      "share_count" BIGINT NOT NULL DEFAULT 0,
      "relevance_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "viral_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "recency_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "locality_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "business_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "creative_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "final_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "hook" TEXT,
      "visual_style" TEXT,
      "content_angle" TEXT,
      "product_fit" TEXT,
      "target_audience" TEXT,
      "ai_summary" TEXT,
      "metadata" JSONB,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "creative_search_jobs" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "topic" TEXT NOT NULL,
      "normalized_topic" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "keywords" JSONB NOT NULL,
      "hashtags" JSONB,
      "sources" JSONB NOT NULL,
      "provider_runs" JSONB,
      "error" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completed_at" TIMESTAMP(3)
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "trend_events" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "country" TEXT NOT NULL,
      "city" TEXT,
      "starts_at" TIMESTAMP(3),
      "ends_at" TIMESTAMP(3),
      "category" TEXT NOT NULL,
      "keywords" JSONB NOT NULL,
      "products" JSONB NOT NULL,
      "priority" INTEGER NOT NULL DEFAULT 0,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "creative_items_topic_final_score_idx" ON "creative_items" ("topic", "final_score");');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "creative_items_source_topic_idx" ON "creative_items" ("source", "topic");');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "creative_items_platform_topic_idx" ON "creative_items" ("platform", "topic");');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "creative_items_event_name_idx" ON "creative_items" ("event_name");');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "creative_search_jobs_normalized_topic_status_idx" ON "creative_search_jobs" ("normalized_topic", "status");');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "trend_events_country_city_idx" ON "trend_events" ("country", "city");');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "trend_events_category_idx" ON "trend_events" ("category");');

  console.log('✓ creative intelligence tables ready');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
