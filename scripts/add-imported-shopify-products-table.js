// One-off additive migration for the Product Automation Shopify catalog cache.
// It intentionally stores only Shopify JSON data and media references, never files.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe([
    'CREATE TABLE IF NOT EXISTS "imported_shopify_products" (',
    '  "id" TEXT PRIMARY KEY,',
    '  "shopify_product_id" TEXT NOT NULL UNIQUE,',
    '  "legacy_resource_id" TEXT,',
    '  "handle" TEXT,',
    '  "title" TEXT NOT NULL,',
    '  "vendor" TEXT,',
    '  "product_type" TEXT,',
    '  "shopify_status" TEXT,',
    '  "template_suffix" TEXT,',
    "  \"tags\" JSONB NOT NULL DEFAULT '[]',",
    "  \"description_html\" TEXT NOT NULL DEFAULT '',",
    '  "seo_title" TEXT,',
    '  "seo_description" TEXT,',
    '  "featured_image_url" TEXT,',
    '  "variant_count" INTEGER NOT NULL DEFAULT 0,',
    '  "image_count" INTEGER NOT NULL DEFAULT 0,',
    '  "metafield_count" INTEGER NOT NULL DEFAULT 0,',
    '  "snapshot" JSONB NOT NULL,',
    '  "snapshot_bytes" INTEGER NOT NULL,',
    '  "source_hash" TEXT NOT NULL,',
    '  "shopify_updated_at" TIMESTAMP(3),',
    '  "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
    '  "last_synced_by" TEXT,',
    '  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
    '  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
    '  CONSTRAINT "imported_shopify_products_last_synced_by_fkey"',
    '    FOREIGN KEY ("last_synced_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE',
    ');',
  ].join('\n'));

  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "imported_shopify_products_handle_idx" ON "imported_shopify_products" ("handle");');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "imported_shopify_products_title_idx" ON "imported_shopify_products" ("title");');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "imported_shopify_products_shopify_status_idx" ON "imported_shopify_products" ("shopify_status");');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "imported_shopify_products_last_synced_at_idx" ON "imported_shopify_products" ("last_synced_at");');

  console.log('Imported Shopify products table ready');
}

main()
  .catch(error => { console.error(error); process.exit(1); })
  .finally(() => prisma.$disconnect());
