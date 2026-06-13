import { NextResponse } from 'next/server';
import mammoth from 'mammoth';
import { getSessionFromRequest, getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { extractTasksFromTranscript } from '@/lib/gemini';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_FILES = 2;

async function fileToText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  if (name.endsWith('.txt')) {
    return await file.text();
  }
  throw new Error(`Unsupported file type: ${file.name}. Only .docx and .txt are allowed.`);
}

export async function POST(request: Request) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await request.formData();
    const files = formData.getAll('files').filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Upload at most ${MAX_FILES} files` }, { status: 400 });
    }
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `${file.name} is over the 5 MB limit` }, { status: 400 });
      }
      const lower = file.name.toLowerCase();
      if (!lower.endsWith('.docx') && !lower.endsWith('.txt')) {
        return NextResponse.json({ error: `${file.name} must be a .docx or .txt file` }, { status: 400 });
      }
    }

    // Extract + concatenate text from all files
    const parts: string[] = [];
    for (const file of files) {
      const text = (await fileToText(file)).trim();
      if (text) parts.push(text);
    }
    const transcript = parts.join('\n\n---\n\n').trim();

    if (!transcript) {
      return NextResponse.json({ error: 'Could not read any text from the uploaded file(s)' }, { status: 400 });
    }

    // Active team members + bios for AI matching
    const members = await prisma.user.findMany({
      where: { disabled: false },
      select: { id: true, name: true, bio: true },
    });

    const extracted = await extractTasksFromTranscript(transcript, members);

    const fileName = files.map(f => f.name).join(', ');

    const created = await prisma.transcriptImport.create({
      data: {
        uploadedBy: session.id,
        fileName,
        drafts: {
          create: extracted.map(t => ({
            title: t.title,
            description: t.description || null,
            priority: t.priority,
            suggestedAssigneeIds: t.assigneeIds,
            suggestedDueDate: t.dueDate ? new Date(t.dueDate) : null,
          })),
        },
      },
      include: { drafts: true },
    });

    return NextResponse.json(
      { import: created, taskCount: extracted.length },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Transcript import error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to process transcript' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Imports that still have at least one pending draft, newest first
  const imports = await prisma.transcriptImport.findMany({
    where: { drafts: { some: { status: 'pending' } } },
    include: {
      uploader: { select: { id: true, name: true, username: true } },
      drafts: {
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Resolve suggested assignee IDs to user objects
  const allIds = Array.from(
    new Set(
      imports.flatMap((imp: any) =>
        imp.drafts.flatMap((d: any) => (Array.isArray(d.suggestedAssigneeIds) ? (d.suggestedAssigneeIds as string[]) : []))
      )
    )
  );
  const users = allIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: allIds } },
        select: { id: true, name: true, username: true, avatarUrl: true },
      })
    : [];
  const userMap = new Map(users.map((u: any) => [u.id, u]));

  const enriched = imports.map((imp: any) => ({
    ...imp,
    drafts: imp.drafts.map((d: any) => {
      const ids = Array.isArray(d.suggestedAssigneeIds) ? (d.suggestedAssigneeIds as string[]) : [];
      return { ...d, suggestedAssignees: ids.map(id => userMap.get(id)).filter(Boolean) };
    }),
  }));

  return NextResponse.json(enriched);
}
