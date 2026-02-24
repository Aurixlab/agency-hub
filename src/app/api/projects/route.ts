import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/activity';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const includeDeleted = searchParams.get('includeDeleted') === 'true' && session.role === 'ADMIN';

  const projects = await prisma.project.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    include: {
      _count: { select: { tasks: { where: { deletedAt: null } } } },
      template: { select: { name: true, icon: true, color: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, clientName, templateId } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    let statuses = ['Backlog', 'Ready', 'In Progress', 'Review', 'Done'];
    let priorities = ['Urgent', 'High', 'Medium', 'Low'];
    let tags: string[] = [];
    let seedTasks: any[] = [];

    // If creating from template, use template config
    if (templateId) {
      const template = await prisma.template.findUnique({ where: { id: templateId } });
      if (template) {
        const config = template.seedConfig as any;
        statuses = config.statuses || statuses;
        priorities = config.priorities || priorities;
        tags = config.tags || [];
        seedTasks = config.sampleTasks || [];
      }
    }

    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        clientName: clientName?.trim() || null,
        templateId: templateId || null,
        statuses,
        priorities,
        tags,
      },
    });

    // Create seed tasks from template
    if (seedTasks.length > 0) {
      const users = await prisma.user.findMany({
        where: { disabled: false, role: { not: 'GUEST' } },
        select: { id: true },
      });

      for (let i = 0; i < seedTasks.length; i++) {
        const task = seedTasks[i];
        const assignee = users.length > 0 ? users[i % users.length] : null;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 21) + 3);

        await prisma.task.create({
          data: {
            projectId: project.id,
            title: task.title,
            status: task.status,
            priority: task.priority || 'NONE',
            tags: task.tags || [],
            assigneeId: assignee?.id || null,
            dueDate,
            orderIndex: i * 1000,
          },
        });
      }
    }

    await logActivity({
      actorId: session.id,
      entityType: 'project',
      entityId: project.id,
      action: 'created',
      after: { name: project.name, clientName: project.clientName },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error('Create project error:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
