// One-off migration: create product_automation_runs for SPAE.
// Additive only. Do NOT use `prisma db push` against production Supabase.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "product_automation_runs" (
      "id"                  TEXT PRIMARY KEY,
      "created_by"          TEXT NOT NULL,
      "product_link"        TEXT NOT NULL,
      "base_price"          DECIMAL(10, 2) NOT NULL,
      "decoration_type"     TEXT NOT NULL,
      "colors"              JSONB NOT NULL DEFAULT '[]',
      "images_ready"        BOOLEAN NOT NULL DEFAULT false,
      "scraped_data"        JSONB,
      "ai_copy"             JSONB,
      "pricing"             JSONB,
      "variants"            JSONB,
      "shopify_payload"     JSONB,
      "status"              TEXT NOT NULL DEFAULT 'draft',
      "shopify_product_id"  TEXT,
      "shopify_product_url" TEXT,
      "error_message"       TEXT,
      "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "product_automation_runs_created_by_fkey"
        FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "product_automation_runs_created_by_idx"
      ON "product_automation_runs" ("created_by");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "product_automation_runs_status_idx"
      ON "product_automation_runs" ("status");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "product_automation_runs_created_at_idx"
      ON "product_automation_runs" ("created_at");
  `);

  console.log('✓ product_automation_runs table ready');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
