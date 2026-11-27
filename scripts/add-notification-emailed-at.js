// Adds notifications.emailed_at (when a task-assignment email covering this notification was sent).
// Existing notifications are marked as already handled so the first email run does not send old tasks.
// Safe to re-run: the backfill only happens when the column is first created.
const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.$queryRawUnsafe(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'emailed_at'"
    );
    if (existing.length > 0) {
      console.log('notifications.emailed_at already exists, nothing to do');
      return;
    }
    await prisma.$executeRawUnsafe('ALTER TABLE notifications ADD COLUMN emailed_at TIMESTAMPTZ');
    const n = await prisma.$executeRawUnsafe('UPDATE notifications SET emailed_at = NOW() WHERE emailed_at IS NULL');
    console.log(`Added notifications.emailed_at and marked ${n} existing notifications as handled`);
  } finally {
    await prisma.$disconnect();
  }
})().catch(e => { console.error(e); process.exit(1); });
