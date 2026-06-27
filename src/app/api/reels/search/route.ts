import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Performs network I/O (Apify) + DB writes — force Node runtime.
// vercel.json caps API functions at 30s, so keep internal timeouts below that.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const APIFY_BASE = 'https://api.apify.com/v2/acts';
const APIFY_HASHTAG_ENDPOINT = `${APIFY_BASE}/apify~instagram-hashtag-scraper/run-sync-get-dataset-items`;
const APIFY_HASHTAG_RUN_ENDPOINT = `${APIFY_BASE}/apify~instagram-hashtag-scraper/runs`;
const APIFY_PROFILE_ENDPOINT = `${APIFY_BASE}/apify~instagram-profile-scraper/run-sync-get-dataset-items`;
const APIFY_RUN_STATUS_ENDPOINT = 'https://api.apify.com/v2/actor-runs';
const APIFY_DATASETS_ENDPOINT = 'https://api.apify.com/v2/datasets';
const APIFY_WAIT_FOR_FINISH_SECONDS = 18;
const APIFY_ACTOR_TIMEOUT_SECONDS = 180;
const APIFY_RESULTS_LIMIT = 30;
const TOP_RESULTS = 30;
const PROFILE_BATCH_SIZE = 20;
const PROFILE_TIMEOUT_MS = 4_000;
const MAX_PROFILE_LOOKUPS = 20;
const MAX_HASHTAGS_PER_SEARCH = 4;

// Re-scrape if the topic was last scraped more than 8 hours ago.
const CACHE_TTL_MS = 8 * 60 * 60 * 1_000;

// ─── Canadian signals ────────────────────────────────────────────────────────

const CANADIAN_TOKENS: readonly string[] = [
  // Cities
  'toronto', 'vancouver', 'montreal', 'calgary', 'edmonton', 'ottawa',
  'winnipeg', 'quebec', 'halifax', 'mississauga', 'brampton', 'hamilton',
  // Provinces / identifiers / airport codes / flag
  'canada', 'ontario', 'alberta', 'british columbia', 'manitoba',
  'nova scotia', 'saskatchewan', 'yyz', 'yvr', 'yul', 'yyc', '🇨🇦',
];

const CANADIAN_CITIES: readonly string[] = [
  'toronto', 'vancouver', 'montreal', 'calgary', 'edmonton', 'ottawa',
  'winnipeg', 'halifax',
];

// High-confidence Canadian location IDs from Instagram's location graph.
// A reel tagged with one of these is definitively Canadian regardless of caption.
const CANADIAN_LOCATION_IDS = new Set<string>([
  // Toronto & surroundings
  '213385402', '107722612590762', '358999078', '6201788428', '1043698662',
  // Vancouver
  '220837164', '107822009243387', '383576', '8500609',
  // Montreal
  '111765898845946', '106376786063146', '507525', '2409012',
  // Calgary
  '107979535892626', '2362463', '8207898',
  // Edmonton
  '227739307', '108164852543706',
  // Ottawa
  '108124929213254', '213325798',
  // Winnipeg
  '107686735922484', '213706895',
  // Halifax
  '108262232541936', '213460587',
  // Québec City
  '107894875892432', '213480580',
  // Mississauga / Brampton / Hamilton
  '107875285892626', '108271392540927', '107904625892453',
]);

function getCanadianConfidence(reel: InstagramReelRaw): number {
  // High-confidence: tagged location is a known Canadian place.
  if (reel.locationId && CANADIAN_LOCATION_IDS.has(String(reel.locationId))) return 3;
  // Fallback: text-match against caption, location name, and username.
  const haystack = [reel.locationName, reel.caption, reel.ownerUsername]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase();
  if (!haystack) return 0;

  const matches = CANADIAN_TOKENS.filter((token) => haystack.includes(token)).length;
  if (matches >= 2) return 2;
  if (matches === 1) return 1;
  return 0;
}

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId?: string;
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
  scrapedAt: Date;
  canadianConfidence: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeNumber(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function normalizeTopic(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function toHashtag(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^#+/, '')
    .replace(/[^a-zA-Z0-9_]+/g, '')
    .toLowerCase();
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function buildHashtagCandidates(topic: string): string[] {
  const base = toHashtag(topic);
  if (!base) return [];

  const topicWords = topic.split(/\s+/).map(toHashtag).filter(Boolean);
  const compactTopic = toHashtag(topicWords.join(''));
  const hasCanadaSignal = ['canada', ...CANADIAN_CITIES].some((signal) => base.includes(signal));

  // If the user already entered a specific hashtag-like Canadian term, keep it exact.
  // Expanding #canadagolf into #torontocanadagolf makes Apify slower and less useful.
  if (hasCanadaSignal && topicWords.length === 1) return [base];

  const candidates = [
    base,
    compactTopic,
    `${base}canada`,
    `canada${base}`,
    ...CANADIAN_CITIES.flatMap((city) => [`${city}${base}`, `${base}${city}`]),
  ];

  return uniq(candidates.filter(Boolean)).slice(0, MAX_HASHTAGS_PER_SEARCH);
}

// Viral Score = (plays + likes*2 + comments*5) / followers
// Normalising by followers separates genuinely viral content from big-account posts.
function computeViralScore(play: number, likes: number, comments: number, followers: number): number {
  const score = (play + likes * 2 + comments * 5) / Math.max(1, followers);
  if (!Number.isFinite(score)) return 0;
  return Math.round(score * 10_000) / 10_000;
}

function mapReelToRow(reel: InstagramReelRaw, searchTopic: string, scrapedAt: Date): ReelRow {
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
    viralScore: 0,
    searchTopic,
    scrapedAt,
    canadianConfidence: getCanadianConfidence(reel),
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
    scrapedAt: r.scrapedAt,
  };
}

// ─── Follower lookup (batched, no hard cap) ──────────────────────────────────

async function fetchFollowerCounts(
  usernames: string[],
  token: string,
): Promise<Map<string, number>> {
  if (usernames.length === 0) return new Map();

  const map = new Map<string, number>();
  const limitedUsernames = usernames.slice(0, MAX_PROFILE_LOOKUPS);

  // Fire batches sequentially to stay within Apify's per-request payload limits.
  for (let i = 0; i < limitedUsernames.length; i += PROFILE_BATCH_SIZE) {
    const batch = limitedUsernames.slice(i, i + PROFILE_BATCH_SIZE);
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), PROFILE_TIMEOUT_MS);
    try {
      const res = await fetch(`${APIFY_PROFILE_ENDPOINT}?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: batch }),
        signal: ac.signal,
        cache: 'no-store',
      });
      if (!res.ok) continue;
      const profiles: any[] = await res.json();
      for (const p of Array.isArray(profiles) ? profiles : []) {
        const u = typeof p.username === 'string' ? p.username.toLowerCase() : null;
        const f = typeof p.followersCount === 'number' ? p.followersCount : 0;
        if (u && f > 0) map.set(u, f);
      }
    } catch {
      // Partial failure: skip this batch, keep results from previous batches.
    } finally {
      clearTimeout(t);
    }
  }

  return map;
}

async function startHashtagRun(hashtags: string[], token: string): Promise<ApifyRun> {
  const params = new URLSearchParams({
    token,
    waitForFinish: String(APIFY_WAIT_FOR_FINISH_SECONDS),
    timeout: String(APIFY_ACTOR_TIMEOUT_SECONDS),
    maxItems: String(APIFY_RESULTS_LIMIT),
  });

  const res = await fetch(`${APIFY_HASHTAG_RUN_ENDPOINT}?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hashtags, resultsType: 'reels', resultsLimit: APIFY_RESULTS_LIMIT }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Apify request failed (${res.status}). ${detail.slice(0, 300)}`);
  }

  const parsed: unknown = await res.json();
  const run = (parsed as any)?.data ?? parsed;
  if (!run?.id || !run?.status) throw new Error('Apify did not return a valid run.');
  return run as ApifyRun;
}

async function getHashtagRun(runId: string, token: string): Promise<ApifyRun> {
  const res = await fetch(`${APIFY_RUN_STATUS_ENDPOINT}/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Apify run status failed (${res.status}). ${detail.slice(0, 300)}`);
  }
  const parsed: unknown = await res.json();
  const run = (parsed as any)?.data ?? parsed;
  if (!run?.id || !run?.status) throw new Error('Apify did not return a valid run status.');
  return run as ApifyRun;
}

async function getDatasetItems(datasetId: string, token: string): Promise<InstagramReelRaw[]> {
  const params = new URLSearchParams({
    token,
    format: 'json',
    clean: 'true',
    limit: String(APIFY_RESULTS_LIMIT),
  });
  const res = await fetch(`${APIFY_DATASETS_ENDPOINT}/${encodeURIComponent(datasetId)}/items?${params.toString()}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Apify dataset fetch failed (${res.status}). ${detail.slice(0, 300)}`);
  }
  const parsed: unknown = await res.json();
  return Array.isArray(parsed) ? (parsed as InstagramReelRaw[]) : [];
}

async function saveAndReturnResults(datasetItems: InstagramReelRaw[], topic: string, hashtags: string[]) {
  const scanned = datasetItems.length;
  const scrapedAt = new Date();

  // ── Geo confidence ─────────────────────────────────────────────────────────
  const allRows = dedupeByInstagramId(
    datasetItems
      .filter((item): item is InstagramReelRaw => !!item && typeof item === 'object' && !!item.id)
      .map((item) => mapReelToRow(item, topic, scrapedAt))
  );
  const confidentRows = allRows.filter((row) => row.canadianConfidence > 0);
  const rawRows = confidentRows.length >= 5 ? confidentRows : allRows;
  const matched = rawRows.length;
  const canadianMatched = confidentRows.length;

  const rows = rawRows.map((r) => ({
    ...r,
    authorFollowers: 1,
    viralScore: computeViralScore(r.playCount, r.likeCount, r.commentCount, 1),
  }));

  // ── Upsert ────────────────────────────────────────────────────────────────
  if (rows.length > 0) {
    try {
      await prisma.$transaction(
        rows.map((r) =>
          prisma.scrapedReel.upsert({
            where: { instagramId: r.instagramId },
            create: {
              instagramId: r.instagramId,
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
              scrapedAt: r.scrapedAt,
            },
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
              scrapedAt: r.scrapedAt,
            },
          })
        )
      );
    } catch (err) {
      console.error('[reels/search] Upsert error:', err);
      return NextResponse.json({ ok: false, error: 'Failed to save scraped reels.' }, { status: 500 });
    }
  }

  // ── Return top performers ─────────────────────────────────────────────────
  const top = await prisma.scrapedReel.findMany({
    where: { searchTopic: topic },
    orderBy: { viralScore: 'desc' },
    take: TOP_RESULTS,
  });

  return NextResponse.json({
    ok: true,
    topic,
    cached: false,
    pending: false,
    hashtags,
    scanned,
    matched,
    canadianMatched,
    count: top.length,
    reels: top.map(serializeReel),
  });
}

// ─── Handler ─────────────────────────────────────────────────────────────────

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

  // ── Cache check ────────────────────────────────────────────────────────────
  // If this topic was scraped within the TTL window, skip Apify and return
  // cached results from the DB immediately.
  const mostRecent = await prisma.scrapedReel.findFirst({
    where: { searchTopic: topic },
    orderBy: { scrapedAt: 'desc' },
    select: { scrapedAt: true },
  });

  const cacheAge = mostRecent ? Date.now() - new Date(mostRecent.scrapedAt).getTime() : Infinity;
  const cached = cacheAge < CACHE_TTL_MS;

  if (cached) {
    const top = await prisma.scrapedReel.findMany({
      where: { searchTopic: topic },
      orderBy: { viralScore: 'desc' },
      take: TOP_RESULTS,
    });
    return NextResponse.json({
      ok: true,
      topic,
      cached: true,
      cacheAgeMinutes: Math.round(cacheAge / 60_000),
      count: top.length,
      reels: top.map(serializeReel),
    });
  }

  // ── Live scrape ────────────────────────────────────────────────────────────
  const hashtags = buildHashtagCandidates(topic);
  if (hashtags.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'Topic must include at least one letter or number that can be searched as a hashtag.' },
      { status: 400 }
    );
  }

  try {
    const run = await startHashtagRun(hashtags, apifyToken);
    if (run.status !== 'SUCCEEDED') {
      if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
        return NextResponse.json(
          { ok: false, error: `Apify scrape ended with status ${run.status}.` },
          { status: 502 }
        );
      }
      return NextResponse.json({
        ok: true,
        pending: true,
        topic,
        hashtags,
        runId: run.id,
        status: run.status,
        message: 'Scrape is still running. Results will load automatically.',
      }, { status: 202 });
    }
    if (!run.defaultDatasetId) {
      return NextResponse.json({ ok: false, error: 'Apify finished without a dataset.' }, { status: 502 });
    }
    const datasetItems = await getDatasetItems(run.defaultDatasetId, apifyToken);
    return saveAndReturnResults(datasetItems, topic, hashtags);
  } catch (err) {
    console.error('[reels/search] Apify error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to start the scraper.' },
      { status: 502 }
    );
  }
}

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    return NextResponse.json(
      { ok: false, error: 'APIFY_API_TOKEN is not configured on the server.' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('runId') || '';
  const topic = normalizeTopic(searchParams.get('topic'));
  const hashtags = (searchParams.get('hashtags') || '').split(',').map(toHashtag).filter(Boolean);

  if (!runId || !topic) {
    return NextResponse.json({ ok: false, error: 'runId and topic are required.' }, { status: 400 });
  }

  try {
    const run = await getHashtagRun(runId, apifyToken);
    if (run.status !== 'SUCCEEDED') {
      if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
        return NextResponse.json(
          { ok: false, error: `Apify scrape ended with status ${run.status}.` },
          { status: 502 }
        );
      }
      return NextResponse.json({
        ok: true,
        pending: true,
        topic,
        hashtags,
        runId,
        status: run.status,
        message: `Scrape status: ${run.status}`,
      }, { status: 202 });
    }
    if (!run.defaultDatasetId) {
      return NextResponse.json({ ok: false, error: 'Apify finished without a dataset.' }, { status: 502 });
    }
    const datasetItems = await getDatasetItems(run.defaultDatasetId, apifyToken);
    return saveAndReturnResults(datasetItems, topic, hashtags);
  } catch (err) {
    console.error('[reels/search] Poll error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to check scraper status.' },
      { status: 502 }
    );
  }
}
