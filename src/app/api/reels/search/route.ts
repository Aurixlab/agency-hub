import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Performs network I/O (Apify) + DB writes — force Node runtime, allow 120s.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const APIFY_ENDPOINT =
  'https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items';
const APIFY_TIMEOUT_MS = 120_000;
const APIFY_RESULTS_LIMIT = 300;
const TOP_RESULTS = 30;

const CANADIAN_TOKENS: readonly string[] = [
  // Cities
  'toronto', 'vancouver', 'montreal', 'calgary', 'edmonton', 'ottawa',
  'winnipeg', 'quebec', 'halifax', 'mississauga', 'brampton', 'hamilton',
  // Provinces / identifiers / airport codes / flag
  'canada', 'ontario', 'alberta', 'british columbia', 'manitoba',
  'nova scotia', 'saskatchewan', 'yyz', 'yvr', 'yul', 'yyc', '🇨🇦',
];

interface InstagramReelRaw {
  id: string;
  url: string;
  caption?: string;
  playCount?: number;
  videoPlayCount?: number;
  likesCount?: number;
  commentsCount?: number;
  ownerUsername?: string;
  ownerProfile?: { followersCount?: number };
  locationName?: string;
  locationId?: string;
}

function safeNumber(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function normalizeTopic(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/^#+/, '').trim().toLowerCase();
}

function isCanadianContent(reel: InstagramReelRaw): boolean {
  const haystack = [reel.locationName, reel.caption, reel.ownerUsername]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase();
  if (!haystack) return false;
  return CANADIAN_TOKENS.some((token) => haystack.includes(token));
}

// Viral Score = (play + likes*2 + comments*5) / max(1, followers)
function computeViralScore(play: number, likes: number, comments: number, followers: number): number {
  const score = (play + likes * 2 + comments * 5) / Math.max(1, followers);
  if (!Number.isFinite(score)) return 0;
  return Math.round(score * 10_000) / 10_000;
}

interface ReelRow {
  instagramId: string;
  url: string;
  caption: string | null;
  playCount: number;
  likeCount: number;
  commentCount: number;
  authorUsername: string;
  authorFollowers: number;
  locationName: string | null;
  locationId: string | null;
  viralScore: number;
  searchTopic: string;
}

function mapReelToRow(reel: InstagramReelRaw, searchTopic: string): ReelRow {
  const play = safeNumber(reel.playCount ?? reel.videoPlayCount);
  const likes = safeNumber(reel.likesCount);
  const comments = safeNumber(reel.commentsCount);
  const followers = safeNumber(reel.ownerProfile?.followersCount) || 1;
  return {
    instagramId: String(reel.id),
    url: String(reel.url),
    caption: typeof reel.caption === 'string' ? reel.caption : null,
    playCount: play,
    likeCount: likes,
    commentCount: comments,
    authorUsername: String(reel.ownerUsername ?? 'unknown'),
    authorFollowers: followers,
    locationName: typeof reel.locationName === 'string' ? reel.locationName : null,
    locationId: typeof reel.locationId === 'string' ? reel.locationId : null,
    viralScore: computeViralScore(play, likes, comments, followers),
    searchTopic,
  };
}

function dedupeByInstagramId(rows: ReelRow[]): ReelRow[] {
  const map = new Map<string, ReelRow>();
  for (const row of rows) if (row.instagramId) map.set(row.instagramId, row);
  return Array.from(map.values());
}

// BigInt columns can't be JSON-serialized directly — convert to Number for the client.
function serializeReel(r: any) {
  return {
    id: r.id,
    instagramId: r.instagramId,
    url: r.url,
    caption: r.caption,
    playCount: Number(r.playCount),
    likeCount: Number(r.likeCount),
    commentCount: Number(r.commentCount),
    authorUsername: r.authorUsername,
    authorFollowers: Number(r.authorFollowers),
    locationName: r.locationName,
    locationId: r.locationId,
    viralScore: Number(r.viralScore),
    searchTopic: r.searchTopic,
  };
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    return NextResponse.json(
      { ok: false, error: 'APIFY_API_TOKEN is not configured on the server.' },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const topic = normalizeTopic((body as any)?.topic);
  if (!topic) {
    return NextResponse.json({ ok: false, error: "A non-empty 'topic' is required." }, { status: 400 });
  }

  // --- Apify synchronous scrape ---
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), APIFY_TIMEOUT_MS);
  let datasetItems: InstagramReelRaw[];
  try {
    const apifyResponse = await fetch(`${APIFY_ENDPOINT}?token=${encodeURIComponent(apifyToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ search: topic, searchType: 'hashtag', resultsLimit: APIFY_RESULTS_LIMIT }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!apifyResponse.ok) {
      const detail = await apifyResponse.text().catch(() => '');
      return NextResponse.json(
        { ok: false, error: `Apify request failed (${apifyResponse.status}). ${detail.slice(0, 300)}` },
        { status: 502 }
      );
    }
    const parsed: unknown = await apifyResponse.json();
    datasetItems = Array.isArray(parsed) ? (parsed as InstagramReelRaw[]) : [];
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json(
        { ok: false, error: 'Scraping timed out after 120 seconds. Try a more specific topic.' },
        { status: 504 }
      );
    }
    console.error('[reels/search] Apify error:', err);
    return NextResponse.json({ ok: false, error: 'Failed to reach the scraper.' }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  const scanned = datasetItems.length;

  // --- Canadian filter + scoring ---
  const rows = dedupeByInstagramId(
    datasetItems
      .filter((item): item is InstagramReelRaw => !!item && typeof item === 'object' && !!item.id)
      .filter(isCanadianContent)
      .map((item) => mapReelToRow(item, topic))
  );
  const matched = rows.length;

  // --- Upsert (update volatile metrics on conflict) in one transaction ---
  if (rows.length > 0) {
    try {
      await prisma.$transaction(
        rows.map((r) =>
          prisma.scrapedReel.upsert({
            where: { instagramId: r.instagramId },
            create: r,
            update: {
              url: r.url,
              caption: r.caption,
              playCount: r.playCount,
              likeCount: r.likeCount,
              commentCount: r.commentCount,
              authorUsername: r.authorUsername,
              authorFollowers: r.authorFollowers,
              locationName: r.locationName,
              locationId: r.locationId,
              viralScore: r.viralScore,
              searchTopic: r.searchTopic,
            },
          })
        )
      );
    } catch (err) {
      console.error('[reels/search] Upsert error:', err);
      return NextResponse.json({ ok: false, error: 'Failed to save scraped reels.' }, { status: 500 });
    }
  }

  // --- Re-query top performers for this topic ---
  const top = await prisma.scrapedReel.findMany({
    where: { searchTopic: topic },
    orderBy: { viralScore: 'desc' },
    take: TOP_RESULTS,
  });

  return NextResponse.json({
    ok: true,
    topic,
    scanned,
    matched,
    count: top.length,
    reels: top.map(serializeReel),
  });
}
