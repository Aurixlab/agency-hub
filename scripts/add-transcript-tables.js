// One-off migration: create transcript_imports + task_drafts tables via raw SQL.
// Additive only — does NOT touch the undeclared SEO tables. Do NOT use `prisma db push`.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "transcript_imports" (
      "id"          TEXT PRIMARY KEY,
      "uploaded_by" TEXT NOT NULL,
      "file_name"   TEXT NOT NULL,
      "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "transcript_imports_uploaded_by_fkey"
        FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "task_drafts" (
      "id"                     TEXT PRIMARY KEY,
      "import_id"              TEXT NOT NULL,
      "title"                  TEXT NOT NULL,
      "description"            TEXT,
      "priority"               "Priority" NOT NULL DEFAULT 'NONE',
      "suggested_assignee_ids" JSONB NOT NULL DEFAULT '[]',
      "suggested_due_date"     TIMESTAMP(3),
      "status"                 TEXT NOT NULL DEFAULT 'pending',
      "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "task_drafts_import_id_fkey"
        FOREIGN KEY ("import_id") REFERENCES "transcript_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "task_drafts_import_id_status_idx"
      ON "task_drafts" ("import_id", "status");
  `);

  console.log('✓ transcript_imports + task_drafts tables ready');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
