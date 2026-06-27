import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { expandTopic } from '@/lib/creative-intelligence/topic-expansion';
import { scoreCreativeItem, rankCreativeItems } from '@/lib/creative-intelligence/scoring';
import { generateInsights } from '@/lib/creative-intelligence/insights';
import { apifyInstagramHashtagProvider } from '@/lib/creative-intelligence/providers/apify-instagram-hashtag';
import type { CreativeItemDto, CreativeProviderName, ExpandedTopic, RawCreativeItem } from '@/lib/creative-intelligence/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CACHE_TTL_MS = 8 * 60 * 60 * 1_000;
const CACHE_MIN_ITEMS = 5;
const TOP_RESULTS = 30;
const DEFAULT_SOURCES: CreativeProviderName[] = ['apify-instagram-hashtag'];

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toBigInt(value: unknown): bigint {
  const n = Math.max(0, Math.round(toNumber(value)));
  return BigInt(n);
}

function creativeItemToDto(item: any): CreativeItemDto {
  return {
    id: item.id,
    source: item.source,
    sourceItemId: item.sourceItemId,
    type: item.type,
    platform: item.platform,
    url: item.url,
    thumbnailUrl: item.thumbnailUrl ?? null,
    videoUrl: item.videoUrl ?? null,
    caption: item.caption ?? null,
    adCopy: item.adCopy ?? null,
    creatorName: item.creatorName ?? null,
    creatorHandle: item.creatorHandle ?? null,
    topic: item.topic,
    eventName: item.eventName ?? null,
    viewCount: Number(item.viewCount ?? 0),
    likeCount: Number(item.likeCount ?? 0),
    commentCount: Number(item.commentCount ?? 0),
    shareCount: Number(item.shareCount ?? 0),
    relevanceScore: Number(item.relevanceScore ?? 0),
    viralScore: Number(item.viralScore ?? 0),
    recencyScore: Number(item.recencyScore ?? 0),
    localityScore: Number(item.localityScore ?? 0),
    businessScore: Number(item.businessScore ?? 0),
    creativeScore: Number(item.creativeScore ?? 0),
    finalScore: Number(item.finalScore ?? 0),
    hook: item.hook ?? null,
    visualStyle: item.visualStyle ?? null,
    contentAngle: item.contentAngle ?? null,
    productFit: item.productFit ?? null,
    targetAudience: item.targetAudience ?? null,
    aiSummary: item.aiSummary ?? null,
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt),
  };
}

async function recentCreativeItems(normalizedTopic: string) {
  return prisma.creativeItem.findMany({
    where: {
      topic: normalizedTopic,
      lastSeenAt: { gte: new Date(Date.now() - CACHE_TTL_MS) },
    },
    orderBy: { finalScore: 'desc' },
    take: TOP_RESULTS,
  });
}

async function saveCreativeItems(items: RawCreativeItem[], expandedTopic: ExpandedTopic) {
  if (items.length === 0) return [];

  await prisma.$transaction(
    items.map((item) => {
      const scored = scoreCreativeItem(item, expandedTopic);
      const data = {
        source: item.source,
        sourceItemId: item.sourceItemId,
        type: item.type,
        url: item.url,
        thumbnailUrl: item.thumbnailUrl ?? null,
        videoUrl: item.videoUrl ?? null,
        caption: item.caption ?? null,
        adCopy: item.adCopy ?? null,
        creatorName: item.creatorName ?? null,
        creatorHandle: item.creatorHandle ?? null,
        platform: item.platform,
        country: item.country ?? null,
        city: item.city ?? null,
        topic: expandedTopic.normalizedTopic,
        eventName: expandedTopic.primaryTopic,
        publishedAt: item.publishedAt ?? null,
        lastSeenAt: new Date(),
        viewCount: toBigInt(item.viewCount),
        likeCount: toBigInt(item.likeCount),
        commentCount: toBigInt(item.commentCount),
        shareCount: toBigInt(item.shareCount),
        relevanceScore: scored.relevanceScore,
        viralScore: scored.viralScore,
        recencyScore: scored.recencyScore,
        localityScore: scored.localityScore,
        businessScore: scored.businessScore,
        creativeScore: scored.creativeScore,
        finalScore: scored.finalScore,
        hook: scored.hook,
        visualStyle: scored.visualStyle,
        contentAngle: scored.contentAngle,
        productFit: scored.productFit,
        targetAudience: scored.targetAudience,
        aiSummary: scored.aiSummary,
        metadata: item.metadata ?? {},
      };

      return prisma.creativeItem.upsert({
        where: { sourceItemId: item.sourceItemId },
        create: data,
        update: data,
      });
    })
  );

  return recentCreativeItems(expandedTopic.normalizedTopic);
}

function responseWithItems(status: 'cached' | 'success', expandedTopic: ExpandedTopic, items: any[], jobId?: string) {
  const dtos = rankCreativeItems(items.map(creativeItemToDto));
  return NextResponse.json({
    ok: true,
    status,
    jobId,
    topic: expandedTopic.originalTopic,
    normalizedTopic: expandedTopic.normalizedTopic,
    expandedTopic,
    items: dtos,
    insights: generateInsights(dtos, expandedTopic),
  });
}

function parseSources(input: unknown): CreativeProviderName[] {
  if (!Array.isArray(input)) return DEFAULT_SOURCES;
  const allowed = new Set<CreativeProviderName>(DEFAULT_SOURCES);
  const sources = input.filter((source): source is CreativeProviderName => allowed.has(source as CreativeProviderName));
  return sources.length > 0 ? sources : DEFAULT_SOURCES;
}

function jobExpandedTopic(job: any): ExpandedTopic {
  const keywords = job.keywords as any;
  if (keywords?.normalizedTopic && keywords?.hashtags) return keywords as ExpandedTopic;
  return expandTopic(job.topic);
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, status: 'error', error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, status: 'error', error: 'Invalid JSON body.' }, { status: 400 });
  }

  const topic = typeof body?.topic === 'string' ? body.topic.trim() : '';
  if (!topic) return NextResponse.json({ ok: false, status: 'error', error: 'A non-empty topic is required.' }, { status: 400 });

  const sources = parseSources(body?.sources);
  const expandedTopic = expandTopic(topic);

  const cached = await recentCreativeItems(expandedTopic.normalizedTopic);
  if (cached.length >= CACHE_MIN_ITEMS) return responseWithItems('cached', expandedTopic, cached);

  const apifyToken = process.env.APIFY_API_TOKEN;
  if (sources.includes('apify-instagram-hashtag') && !apifyToken) {
    return NextResponse.json({ ok: false, status: 'error', error: 'APIFY_API_TOKEN is not configured on the server.' }, { status: 500 });
  }

  const job = await prisma.creativeSearchJob.create({
    data: {
      topic,
      normalizedTopic: expandedTopic.normalizedTopic,
      status: 'running',
      keywords: expandedTopic as any,
      hashtags: expandedTopic.hashtags as any,
      sources: sources as any,
    },
  });

  try {
    const result = await apifyInstagramHashtagProvider.startCollection({ topic: expandedTopic, token: apifyToken! });
    await prisma.creativeSearchJob.update({
      where: { id: job.id },
      data: {
        providerRuns: { [apifyInstagramHashtagProvider.name]: { runId: result.providerRunId, status: result.status } } as any,
      },
    });

    if (result.status === 'pending') {
      return NextResponse.json({
        ok: true,
        status: 'pending',
        jobId: job.id,
        topic,
        normalizedTopic: expandedTopic.normalizedTopic,
        expandedTopic,
        providerRuns: { [apifyInstagramHashtagProvider.name]: { runId: result.providerRunId, status: result.providerStatus } },
      }, { status: 202 });
    }

    const saved = await saveCreativeItems(result.items, expandedTopic);
    await prisma.creativeSearchJob.update({
      where: { id: job.id },
      data: { status: 'completed', completedAt: new Date() },
    });
    return responseWithItems('success', expandedTopic, saved, job.id);
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to start creative search.';
    await prisma.creativeSearchJob.update({ where: { id: job.id }, data: { status: 'failed', error } });
    return NextResponse.json({ ok: false, status: 'error', error }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, status: 'error', error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ ok: false, status: 'error', error: 'jobId is required.' }, { status: 400 });

  const job = await prisma.creativeSearchJob.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ ok: false, status: 'error', error: 'Search job not found.' }, { status: 404 });

  const expandedTopic = jobExpandedTopic(job);
  if (job.status === 'completed') {
    const cached = await recentCreativeItems(job.normalizedTopic);
    return responseWithItems('success', expandedTopic, cached, job.id);
  }
  if (job.status === 'failed') {
    return NextResponse.json({ ok: false, status: 'error', error: job.error || 'Search job failed.' }, { status: 502 });
  }

  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    return NextResponse.json({ ok: false, status: 'error', error: 'APIFY_API_TOKEN is not configured on the server.' }, { status: 500 });
  }

  const providerRuns = (job.providerRuns as any) ?? {};
  const runId = providerRuns?.[apifyInstagramHashtagProvider.name]?.runId;
  if (!runId) {
    await prisma.creativeSearchJob.update({ where: { id: job.id }, data: { status: 'failed', error: 'Provider run ID missing.' } });
    return NextResponse.json({ ok: false, status: 'error', error: 'Provider run ID missing.' }, { status: 500 });
  }

  try {
    const result = await apifyInstagramHashtagProvider.checkStatus({ providerRunId: runId, topic: expandedTopic, token: apifyToken });
    if (result.status === 'pending') {
      await prisma.creativeSearchJob.update({
        where: { id: job.id },
        data: { providerRuns: { [apifyInstagramHashtagProvider.name]: { runId, status: result.providerStatus } } as any },
      });
      return NextResponse.json({
        ok: true,
        status: 'pending',
        jobId: job.id,
        topic: job.topic,
        normalizedTopic: job.normalizedTopic,
        expandedTopic,
        providerRuns: { [apifyInstagramHashtagProvider.name]: { runId, status: result.providerStatus } },
      }, { status: 202 });
    }

    if (result.status === 'failed') {
      await prisma.creativeSearchJob.update({ where: { id: job.id }, data: { status: 'failed', error: result.error } });
      return NextResponse.json({ ok: false, status: 'error', error: result.error }, { status: 502 });
    }

    const saved = await saveCreativeItems(result.items, expandedTopic);
    await prisma.creativeSearchJob.update({
      where: { id: job.id },
      data: { status: 'completed', completedAt: new Date(), providerRuns: { [apifyInstagramHashtagProvider.name]: { runId, status: result.providerStatus } } as any },
    });
    return responseWithItems('success', expandedTopic, saved, job.id);
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to check creative search status.';
    await prisma.creativeSearchJob.update({ where: { id: job.id }, data: { status: 'failed', error } });
    return NextResponse.json({ ok: false, status: 'error', error }, { status: 502 });
  }
}
