import type {
  CreativeProvider,
  ProviderInput,
  ProviderStartResult,
  ProviderStatusInput,
  ProviderStatusResult,
  RawCreativeItem,
} from '../types';

const APIFY_BASE = 'https://api.apify.com/v2';
const ACTOR_RUN_ENDPOINT = `${APIFY_BASE}/acts/apify~instagram-hashtag-scraper/runs`;
const RUN_STATUS_ENDPOINT = `${APIFY_BASE}/actor-runs`;
const DATASETS_ENDPOINT = `${APIFY_BASE}/datasets`;
const WAIT_FOR_FINISH_SECONDS = 18;
const ACTOR_TIMEOUT_SECONDS = 180;
const RESULTS_LIMIT = 40;

type ApifyRun = {
  id: string;
  status: string;
  defaultDatasetId?: string;
};

type InstagramItem = {
  id?: string | number;
  shortCode?: string;
  url?: string;
  caption?: string;
  videoPlayCount?: number;
  igPlayCount?: number;
  likesCount?: number;
  commentsCount?: number;
  ownerUsername?: string;
  ownerFullName?: string;
  locationName?: string;
  timestamp?: string;
  takenAtTimestamp?: string | number;
  displayUrl?: string;
  videoUrl?: string;
};

function runFromPayload(payload: unknown): ApifyRun {
  const run = (payload as any)?.data ?? payload;
  if (!run?.id || !run?.status) throw new Error('Apify did not return a valid run.');
  return run as ApifyRun;
}

function safeNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseDate(item: InstagramItem): Date | null {
  if (typeof item.timestamp === 'string') {
    const d = new Date(item.timestamp);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (item.takenAtTimestamp) {
    const n = Number(item.takenAtTimestamp);
    const d = new Date(n > 9_999_999_999 ? n : n * 1000);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function detectCity(item: InstagramItem): string | null {
  const text = [item.locationName, item.caption, item.ownerUsername].filter(Boolean).join(' ').toLowerCase();
  for (const city of ['calgary', 'toronto', 'vancouver', 'montreal', 'ottawa', 'edmonton', 'winnipeg', 'halifax']) {
    if (text.includes(city)) return city[0].toUpperCase() + city.slice(1);
  }
  return null;
}

function mapItem(item: InstagramItem, topic: string): RawCreativeItem | null {
  const sourceId = item.id ?? item.shortCode;
  const url = item.url ?? (item.shortCode ? `https://www.instagram.com/reel/${item.shortCode}/` : null);
  if (!sourceId || !url) return null;

  return {
    source: 'apify-instagram-hashtag',
    sourceItemId: `apify-instagram-hashtag:${sourceId}`,
    type: 'organic_reel',
    platform: 'instagram',
    url,
    thumbnailUrl: item.displayUrl ?? null,
    videoUrl: item.videoUrl ?? null,
    caption: typeof item.caption === 'string' ? item.caption : null,
    creatorName: typeof item.ownerFullName === 'string' ? item.ownerFullName : null,
    creatorHandle: typeof item.ownerUsername === 'string' ? item.ownerUsername : null,
    country: 'Canada',
    city: detectCity(item),
    topic,
    publishedAt: parseDate(item),
    viewCount: safeNumber(item.videoPlayCount ?? item.igPlayCount),
    likeCount: safeNumber(item.likesCount),
    commentCount: safeNumber(item.commentsCount),
    shareCount: 0,
    metadata: item as Record<string, unknown>,
  };
}

async function getDatasetItems(datasetId: string, token: string, topic: string): Promise<RawCreativeItem[]> {
  const params = new URLSearchParams({
    token,
    format: 'json',
    clean: 'true',
    limit: String(RESULTS_LIMIT),
  });
  const res = await fetch(`${DATASETS_ENDPOINT}/${encodeURIComponent(datasetId)}/items?${params.toString()}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Apify dataset fetch failed (${res.status}). ${detail.slice(0, 300)}`);
  }
  const payload: unknown = await res.json();
  if (!Array.isArray(payload)) return [];
  return payload
    .map((item) => mapItem(item as InstagramItem, topic))
    .filter((item): item is RawCreativeItem => !!item);
}

export const apifyInstagramHashtagProvider: CreativeProvider = {
  name: 'apify-instagram-hashtag',

  async startCollection(input: ProviderInput): Promise<ProviderStartResult> {
    const params = new URLSearchParams({
      token: input.token,
      waitForFinish: String(WAIT_FOR_FINISH_SECONDS),
      timeout: String(ACTOR_TIMEOUT_SECONDS),
      maxItems: String(RESULTS_LIMIT),
    });

    const hashtags = input.topic.hashtags.slice(0, 8);
    const res = await fetch(`${ACTOR_RUN_ENDPOINT}?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashtags, resultsType: 'reels', resultsLimit: RESULTS_LIMIT }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Apify start failed (${res.status}). ${detail.slice(0, 300)}`);
    }

    const run = runFromPayload(await res.json());
    if (run.status !== 'SUCCEEDED') {
      return { status: 'pending', providerRunId: run.id, providerStatus: run.status };
    }
    if (!run.defaultDatasetId) throw new Error('Apify finished without a dataset.');
    const items = await getDatasetItems(run.defaultDatasetId, input.token, input.topic.normalizedTopic);
    return { status: 'success', providerRunId: run.id, defaultDatasetId: run.defaultDatasetId, items };
  },

  async checkStatus(input: ProviderStatusInput): Promise<ProviderStatusResult> {
    const res = await fetch(`${RUN_STATUS_ENDPOINT}/${encodeURIComponent(input.providerRunId)}?token=${encodeURIComponent(input.token)}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Apify status failed (${res.status}). ${detail.slice(0, 300)}`);
    }

    const run = runFromPayload(await res.json());
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
      return {
        status: 'failed',
        providerRunId: run.id,
        providerStatus: run.status,
        error: `Apify scrape ended with status ${run.status}.`,
      };
    }
    if (run.status !== 'SUCCEEDED') {
      return { status: 'pending', providerRunId: run.id, providerStatus: run.status };
    }
    if (!run.defaultDatasetId) {
      return {
        status: 'failed',
        providerRunId: run.id,
        providerStatus: run.status,
        error: 'Apify finished without a dataset.',
      };
    }
    const items = await getDatasetItems(run.defaultDatasetId, input.token, input.topic.normalizedTopic);
    return { status: 'success', providerRunId: run.id, providerStatus: run.status, items };
  },
};
