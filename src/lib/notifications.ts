import { prisma } from '@/lib/prisma';

interface CreateNotificationInput {
  userId: string;
  type: 'task_assigned' | 'comment_added';
  taskId?: string;
  actorName: string;
  taskTitle: string;
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        taskId: input.taskId ?? null,
        actorName: input.actorName,
        taskTitle: input.taskTitle,
      },
    });
  } catch {
    // Never break the main operation
  }
}
