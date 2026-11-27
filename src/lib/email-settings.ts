import type { PrismaClient } from '@prisma/client';

// The "Emails" switch on the Settings page. Task emails and the daily digest are only sent while it is on.
// The database is passed in so both functions can be tested without one.

export const EMAILS_ENABLED_KEY = 'task_emails_enabled';

/** No row means off. Only the exact string 'true' means on. */
export async function getEmailsEnabled(db: Pick<PrismaClient, 'appSetting'>): Promise<boolean> {
  const row = await db.appSetting.findUnique({ where: { key: EMAILS_ENABLED_KEY }, select: { value: true } });
  return row?.value === 'true';
}

/**
 * Switching from off to on first marks every pending assignment notification as handled, so only
 * assignments made from then on are emailed. Saving "on" while already on leaves notifications alone.
 */
export async function setEmailsEnabled(
  db: Pick<PrismaClient, '$transaction'>,
  enabled: boolean,
  userId: string,
): Promise<void> {
  await db.$transaction(async tx => {
    if (enabled && !(await getEmailsEnabled(tx))) {
      await tx.notification.updateMany({
        where: { type: 'task_assigned', emailedAt: null },
        data: { emailedAt: new Date() },
      });
    }
    const data = { value: String(enabled), updatedBy: userId };
    await tx.appSetting.upsert({
      where: { key: EMAILS_ENABLED_KEY },
      create: { key: EMAILS_ENABLED_KEY, ...data },
      update: data,
    });
  });
}
