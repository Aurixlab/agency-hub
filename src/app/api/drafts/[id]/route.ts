import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draft = await prisma.taskDraft.findUnique({ where: { id: params.id } });
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

  await prisma.taskDraft.delete({ where: { id: params.id } });

  // Clean up the parent import if it has no remaining drafts
  const remaining = await prisma.taskDraft.count({ where: { importId: draft.importId } });
  if (remaining === 0) {
    await prisma.transcriptImport.delete({ where: { id: draft.importId } });
  }

  return NextResponse.json({ success: true });
}
