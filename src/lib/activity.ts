import { prisma } from './prisma';

export async function logActivity(params: {
  actorId: string;
  entityType: 'project' | 'task' | 'comment' | 'user';
  entityId: string;
  action: 'created' | 'updated' | 'deleted' | 'restored';
  before?: any;
  after?: any;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        actorId: params.actorId,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        before: params.before || undefined,
        after: params.after || undefined,
      },
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
    // Don't throw — activity logging should never break the main operation
  }
}
