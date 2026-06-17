import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Performs network I/O (Apify) + DB writes — force Node runtime, allow 120s.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const APIFY_BASE = 'https://api.apify.com/v2/acts';
const APIFY_HASHTAG_ENDPOINT = `${APIFY_BASE}/apify~instagram-hashtag-scraper/run-sync-get-dataset-items`;
const APIFY_PROFILE_ENDPOINT = `${APIFY_BASE}/apify~instagram-profile-scraper/run-sync-get-dataset-items`;
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
  shortCode?: string;
  url: string;
  caption?: string;
  videoPlayCount?: number;
  igPlayCount?: number;
  likesCount?: number;
  commentsCount?: number;
  ownerUsername?: string;
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

// Viral Score = (plays + likes*2 + comments*5) / followers
// Normalising by followers separates genuinely viral content from big-account posts.
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

// authorFollowers is left as 1 (placeholder) — will be patched after the profile lookup.
function mapReelToRow(reel: InstagramReelRaw, searchTopic: string): ReelRow {
  const play = safeNumber(reel.videoPlayCount ?? reel.igPlayCount);
  const likes = safeNumber(reel.likesCount);
  const comments = safeNumber(reel.commentsCount);
  return {
    instagramId: String(reel.id),
    url: String(reel.url),
    caption: typeof reel.caption === 'string' ? reel.caption : null,
    playCount: play,
    likeCount: likes,
    commentCount: comments,
    authorUsername: String(reel.ownerUsername ?? 'unknown'),
    authorFollowers: 1,
    locationName: typeof reel.locationName === 'string' ? reel.locationName : null,
    locationId: typeof reel.locationId === 'string' ? reel.locationId : null,
    viralScore: 0, // recalculated after follower lookup
    searchTopic,
  };
}

// Step 2: look up follower counts for the unique authors we found.
// Has its own 30s timeout — failures return an empty map (rows fall back to followers=1).
async function fetchFollowerCounts(
  usernames: string[],
  token: string,
): Promise<Map<string, number>> {
  if (usernames.length === 0) return new Map();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 30_000);
  try {
    const res = await fetch(`${APIFY_PROFILE_ENDPOINT}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Cap at 50 usernames to keep the profile call fast and cheap.
      body: JSON.stringify({ usernames: usernames.slice(0, 50) }),
      signal: ac.signal,
      cache: 'no-store',
    });
    if (!res.ok) return new Map();
    const profiles: any[] = await res.json();
    const map = new Map<string, number>();
    for (const p of Array.isArray(profiles) ? profiles : []) {
      const u = typeof p.username === 'string' ? p.username.toLowerCase() : null;
      const f = typeof p.followersCount === 'number' ? p.followersCount : 0;
      if (u && f > 0) map.set(u, f);
    }
    return map;
  } catch {
    return new Map();
  } finally {
    clearTimeout(t);
  }
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
    const apifyResponse = await fetch(`${APIFY_HASHTAG_ENDPOINT}?token=${encodeURIComponent(apifyToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashtags: [topic], resultsType: 'reels', resultsLimit: APIFY_RESULTS_LIMIT }),
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

  // --- Canadian filter (viral scores computed after follower lookup) ---
  const rawRows = dedupeByInstagramId(
    datasetItems
      .filter((item): item is InstagramReelRaw => !!item && typeof item === 'object' && !!item.id)
      .filter(isCanadianContent)
      .map((item) => mapReelToRow(item, topic))
  );
  const matched = rawRows.length;

  // --- Step 2: fetch follower counts for unique authors, then compute real viral scores ---
  const uniqueUsernames = [...new Set(rawRows.map((r) => r.authorUsername.toLowerCase()).filter((u) => u !== 'unknown'))];
  const followerMap = await fetchFollowerCounts(uniqueUsernames, apifyToken);

  const rows = rawRows.map((r) => {
    const followers = followerMap.get(r.authorUsername.toLowerCase()) ?? 1;
    return {
      ...r,
      authorFollowers: followers,
      viralScore: computeViralScore(r.playCount, r.likeCount, r.commentCount, followers),
    };
  });

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
