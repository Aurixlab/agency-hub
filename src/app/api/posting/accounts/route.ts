import { NextResponse } from 'next/server';
import { PostingPlatform } from '@prisma/client';
import { getSessionFromRequest, getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encryptToken } from '@/lib/posting/crypto';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accounts = await prisma.postingAccount.findMany({
    where: session.role === 'ADMIN' ? {} : { createdBy: session.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      platform: true,
      pageId: true,
      tokenExpiresAt: true,
      createdAt: true,
      updatedAt: true,
      creator: { select: { id: true, name: true, username: true } },
    },
  });

  return NextResponse.json({ accounts });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequestFull(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const pageId = typeof body.page_id === 'string' ? body.page_id.trim() : '';
    const accessToken = typeof body.access_token === 'string' ? body.access_token.trim() : '';
    const tokenExpiresAt = body.token_expires_at ? new Date(body.token_expires_at) : null;

    if (!name) return NextResponse.json({ error: 'Account name is required' }, { status: 400 });
    if (!pageId) return NextResponse.json({ error: 'Meta page ID is required' }, { status: 400 });
    if (!accessToken) return NextResponse.json({ error: 'Meta page access token is required' }, { status: 400 });
    if (tokenExpiresAt && Number.isNaN(tokenExpiresAt.getTime())) {
      return NextResponse.json({ error: 'Token expiry must be a valid date' }, { status: 400 });
    }

    const encrypted = encryptToken(accessToken);
    const account = await prisma.postingAccount.create({
      data: {
        createdBy: session.id,
        name,
        platform: PostingPlatform.META,
        pageId,
        accessTokenCiphertext: encrypted.ciphertext,
        accessTokenIv: encrypted.iv,
        accessTokenTag: encrypted.tag,
        tokenExpiresAt,
      },
      select: {
        id: true,
        name: true,
        platform: true,
        pageId: true,
        tokenExpiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    console.error('Create posting account error:', error);
    return NextResponse.json({ error: 'Failed to create posting account' }, { status: 500 });
  }
}
