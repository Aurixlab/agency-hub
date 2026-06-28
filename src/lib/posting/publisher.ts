import { randomUUID } from 'crypto';
import { PostingLogStatus, PostingPostStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { decryptToken } from './crypto';
import { publishToMeta } from './meta';
import { isFinalFailure, nextRetryAt, normalizeMediaUrls } from './status';

const BATCH_SIZE = 10;

export async function runPostingPublishCycle(now = new Date()) {
  const duePosts = await prisma.scheduledPost.findMany({
    where: {
      status: PostingPostStatus.SCHEDULED,
      scheduledTime: { lte: now },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    include: { account: true },
    orderBy: { scheduledTime: 'asc' },
    take: BATCH_SIZE,
  });

  const results = [];
  for (const post of duePosts) {
    const lockToken = randomUUID();
    const locked = await prisma.scheduledPost.updateMany({
      where: { id: post.id, status: PostingPostStatus.SCHEDULED },
      data: {
        status: PostingPostStatus.POSTING,
        lockToken,
        lockedAt: now,
      },
    });

    if (locked.count !== 1) continue;

    const claimed = await prisma.scheduledPost.findUnique({
      where: { id: post.id },
      include: { account: true },
    });
    if (!claimed) continue;
    results.push(await publishClaimedPost({ ...claimed, lockToken }, now));
  }

  return { processed: results.length, results };
}

async function publishClaimedPost(
  post: Awaited<ReturnType<typeof prisma.scheduledPost.findUnique>> & { account: NonNullable<unknown>; lockToken: string },
  now: Date
) {
  if (!post) return null;
  const account = post.account as {
    pageId: string;
    tokenExpiresAt: Date | null;
    accessTokenCiphertext: string;
    accessTokenIv: string;
    accessTokenTag: string;
  };
  const attemptNumber = post.attemptCount + 1;

  try {
    if (account.tokenExpiresAt && account.tokenExpiresAt <= now) {
      throw new Error('Meta page access token is expired');
    }

    const accessToken = decryptToken(
      account.accessTokenCiphertext,
      account.accessTokenIv,
      account.accessTokenTag
    );

    const response = await publishToMeta({
      pageId: account.pageId,
      accessToken,
      content: post.content,
      mediaUrls: normalizeMediaUrls(post.mediaUrls),
    });

    await prisma.scheduledPost.updateMany({
      where: { id: post.id, lockToken: post.lockToken },
      data: {
        status: PostingPostStatus.POSTED,
        postedAt: now,
        failureReason: null,
        attemptCount: attemptNumber,
        lockToken: null,
        lockedAt: null,
        nextRetryAt: null,
      },
    });

    await prisma.postExecutionLog.create({
      data: {
        postId: post.id,
        attemptNumber,
        status: PostingLogStatus.POSTED,
        responsePayload: response,
      },
    });

    return { postId: post.id, status: PostingPostStatus.POSTED };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown publish failure';
    const finalFailure = isFinalFailure(attemptNumber);
    const nextStatus = finalFailure ? PostingPostStatus.FAILED : PostingPostStatus.SCHEDULED;

    await prisma.scheduledPost.updateMany({
      where: { id: post.id, lockToken: post.lockToken },
      data: {
        status: nextStatus,
        failureReason: message,
        attemptCount: attemptNumber,
        lockToken: null,
        lockedAt: null,
        nextRetryAt: finalFailure ? null : nextRetryAt(attemptNumber, now),
      },
    });

    await prisma.postExecutionLog.create({
      data: {
        postId: post.id,
        attemptNumber,
        status: finalFailure ? PostingLogStatus.FAILED : PostingLogStatus.RETRY,
        errorMessage: message,
      },
    });

    return { postId: post.id, status: nextStatus, error: message };
  }
}
