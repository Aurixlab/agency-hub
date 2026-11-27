// Adds the app_settings table (app-wide switches set from the Settings page).
// Additive only and safe to re-run. No row is inserted: a missing row means the setting is off.
// Row level security is enabled with no policies so Supabase's REST API cannot reach the table;
// Prisma connects as the table owner and is not affected.
const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS app_settings (
        "key"        TEXT NOT NULL,
        "value"      TEXT NOT NULL,
        "updated_at" TIMESTAMP(3) NOT NULL,
        "updated_by" TEXT,
        CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
      )
    `);
    await prisma.$executeRawUnsafe('ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY');

    // Read-only check: the app can still read the table, and RLS is on but does not apply to this connection.
    const [{ rows }] = await prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS rows FROM app_settings');
    const [rls] = await prisma.$queryRawUnsafe(
      "SELECT relrowsecurity AS enabled, row_security_active(oid) AS applies_to_app FROM pg_class WHERE oid = 'app_settings'::regclass"
    );
    console.log(`app_settings ready: ${rows} rows, row level security enabled: ${rls.enabled}, applies to this connection: ${rls.applies_to_app}`);
    if (!rls.enabled || rls.applies_to_app) throw new Error('Unexpected row level security state on app_settings');
  } finally {
    await prisma.$disconnect();
  }
})().catch(e => { console.error(e); process.exit(1); });
