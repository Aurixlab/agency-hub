import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/activity';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      template: { select: { name: true, icon: true, color: true } },
      tasks: {
        where: { deletedAt: null },
        include: {
          assignee: { select: { id: true, name: true, username: true } },
          _count: { select: { comments: true } },
        },
        orderBy: { orderIndex: 'asc' },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  return NextResponse.json(project);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { version, ...updates } = body;

    // Fetch current state
    const current = await prisma.project.findUnique({ where: { id: params.id } });
    if (!current) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Version conflict check
    if (version !== undefined && version !== current.version) {
      return NextResponse.json(
        {
          error: 'CONFLICT',
          message: 'This project was updated by someone else. Please reload before saving.',
          currentVersion: current.version,
          currentData: current,
        },
        { status: 409 }
      );
    }

    const before = { name: current.name, clientName: current.clientName, status: current.status };

    const updated = await prisma.project.update({
      where: { id: params.id },
      data: {
        ...updates,
        version: { increment: 1 },
      },
    });

    await logActivity({
      actorId: session.id,
      entityType: 'project',
      entityId: params.id,
      action: 'updated',
      before,
      after: { name: updated.name, clientName: updated.clientName, status: updated.status },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Update project error:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const restore = searchParams.get('restore') === 'true';

  if (restore) {
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }
    await prisma.project.update({
      where: { id: params.id },
      data: { deletedAt: null },
    });
    await logActivity({
      actorId: session.id,
      entityType: 'project',
      entityId: params.id,
      action: 'restored',
    });
    return NextResponse.json({ success: true });
  }

  // Soft delete
  await prisma.project.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  });

  await logActivity({
    actorId: session.id,
    entityType: 'project',
    entityId: params.id,
    action: 'deleted',
  });

  return NextResponse.json({ success: true });
}
