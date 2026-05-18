import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionFromRequestFull } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { nodes } = await request.json();
  if (!Array.isArray(nodes)) return NextResponse.json({ error: 'Invalid nodes' }, { status: 400 });

  // Full replace — delete all existing nodes then recreate
  await prisma.pipelineNode.deleteMany({ where: { pipelineId: params.id } });

  if (nodes.length > 0) {
    await prisma.pipelineNode.createMany({
      data: nodes.map((n: any) => ({
        id: n.id,
        pipelineId: params.id,
        label: n.label || 'Untitled',
        description: n.description || null,
        assigneeIds: n.assigneeIds || [],
        positionX: n.position?.x ?? 0,
        positionY: n.position?.y ?? 0,
        edges: n.edges || [],
        done: n.done ?? false,
      })),
    });
  }

  await prisma.pipeline.update({
    where: { id: params.id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
