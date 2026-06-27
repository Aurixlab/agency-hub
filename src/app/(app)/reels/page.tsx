'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Box,
  ExternalLink,
  Eye,
  Flame,
  Lightbulb,
  Loader2,
  Megaphone,
  Search,
  Sparkles,
  Tag,
} from 'lucide-react';

type ExpandedTopic = {
  originalTopic: string;
  normalizedTopic: string;
  primaryTopic: string;
  relatedKeywords: string[];
  hashtags: string[];
  locations: string[];
  productKeywords: string[];
  audienceKeywords: string[];
  eventKeywords: string[];
  negativeKeywords: string[];
};

type CreativeItem = {
  id: string;
  source: string;
  type: string;
  platform: string;
  url: string;
  thumbnailUrl: string | null;
  caption: string | null;
  creatorHandle: string | null;
  creatorName: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  finalScore: number;
  relevanceScore: number;
  businessScore: number;
  creativeScore: number;
  hook: string | null;
  visualStyle: string | null;
  contentAngle: string | null;
  productFit: string | null;
  targetAudience: string | null;
  aiSummary: string | null;
};

type CreativeInsights = {
  topHooks: string[];
  visualPatterns: string[];
  productOpportunities: string[];
  campaignIdeas: {
    title: string;
    hook: string;
    products: string[];
    visualDirection: string;
    targetAudience: string;
    cta: string;
  }[];
  contentBuckets: {
    label: string;
    description: string;
    itemIds: string[];
  }[];
};

type CreativeResponse = {
  ok: boolean;
  status: 'cached' | 'success' | 'pending' | 'error';
  error?: string;
  jobId?: string;
  topic?: string;
  normalizedTopic?: string;
  expandedTopic?: ExpandedTopic;
  items?: CreativeItem[];
  insights?: CreativeInsights;
  providerRuns?: Record<string, unknown>;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const compact = (n: number) => new Intl.NumberFormat('en-CA', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n) || 0);
const score = (n: number) => new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 }).format(Number(n) || 0);

async function readPayload(res: Response): Promise<CreativeResponse> {
  const text = await res.text();
  let payload: CreativeResponse | null = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!payload) {
    throw new Error(res.ok ? 'The search returned an empty response.' : `The search returned a non-JSON response (${res.status}).`);
  }
  if (!payload.ok) throw new Error(payload.error || `Request failed (${res.status}).`);
  return payload;
}

export default function ReelsPage() {
  const [topic, setTopic] = useState('');
  const [items, setItems] = useState<CreativeItem[]>([]);
  const [expandedTopic, setExpandedTopic] = useState<ExpandedTopic | null>(null);
  const [insights, setInsights] = useState<CreativeInsights | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'pending' | 'success' | 'cached' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const organicReels = useMemo(() => items.filter((item) => item.type.includes('reel')), [items]);

  const handleSearch = useCallback(async (raw: string) => {
    const cleaned = raw.trim();
    if (!cleaned) return;
    setStatus('loading');
    setError(null);
    setItems([]);
    setInsights(null);

    try {
      const res = await fetch('/api/creative/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: cleaned, sources: ['apify-instagram-hashtag'] }),
      });
      let payload = await readPayload(res);
      if (payload.expandedTopic) setExpandedTopic(payload.expandedTopic);

      for (let attempt = 0; payload.status === 'pending' && payload.jobId && attempt < 24; attempt += 1) {
        setStatus('pending');
        await wait(5000);
        const pollUrl = new URL('/api/creative/search', window.location.origin);
        pollUrl.searchParams.set('jobId', payload.jobId);
        payload = await readPayload(await fetch(pollUrl.toString(), { cache: 'no-store' }));
        if (payload.expandedTopic) setExpandedTopic(payload.expandedTopic);
      }

      if (payload.status === 'pending') throw new Error('The collection job is still running. Try again in a minute.');
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setInsights(payload.insights ?? null);
      setStatus(payload.status === 'cached' ? 'cached' : 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Sparkles className="w-6 h-6 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Creative Intelligence</h1>
          <p className="text-surface-500 dark:text-surface-400 text-sm">
            Find likely high-performing reels around a topic, then extract reusable creative patterns and campaign ideas.
          </p>
        </div>
      </div>

      <div className="card p-5">
        <form
          onSubmit={(e) => { e.preventDefault(); if (status !== 'loading' && status !== 'pending') handleSearch(topic); }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={topic}
              disabled={status === 'loading' || status === 'pending'}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. football, Stampede, golf events, Canada Day"
              className="input pl-9"
            />
          </div>
          <button type="submit" disabled={status === 'loading' || status === 'pending' || !topic.trim()} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
            {status === 'loading' || status === 'pending' ? <><Loader2 className="w-4 h-4 animate-spin" /> Collecting</> : <><Search className="w-4 h-4" /> Research Topic</>}
          </button>
        </form>
        {(status === 'loading' || status === 'pending') && (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm font-medium text-amber-800 dark:text-amber-300">
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
            Collecting organic content signals. Apify may keep running in the background while this page polls for results.
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Could not complete the research</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {expandedTopic && <ExpandedTopicPanel topic={expandedTopic} status={status} />}

      {items.length > 0 && (
        <>
          <MetricSummary items={items} status={status} />
          <Section title="Top Organic Reels" icon={<Flame className="w-5 h-5" />}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {organicReels.slice(0, 30).map((item, index) => <CreativeCard key={item.id} item={item} rank={index + 1} />)}
            </div>
          </Section>
        </>
      )}

      {(status === 'success' || status === 'cached') && items.length === 0 && (
        <div className="card p-8 text-center border-dashed">
          <p className="font-semibold text-surface-700 dark:text-surface-200">No reels came back from the current source.</p>
          <p className="mt-1 text-sm text-surface-500">
            Try a shorter Instagram-style topic like nonprofit, fundraising, charity event, custom shirts, or volunteer shirts.
          </p>
        </div>
      )}

      <Section title="Ad Inspiration" icon={<Megaphone className="w-5 h-5" />}>
        <div className="rounded-lg border border-dashed border-surface-200 dark:border-surface-800 p-5 text-sm text-surface-500 dark:text-surface-400">
          Paid ad providers are ready to plug in next. Planned sources include Meta Ad Library, TikTok Creative Center, YouTube Shorts, and Google Ads Transparency Center.
        </div>
      </Section>

      {insights && (
        <>
          <Section title="Creative Patterns" icon={<Lightbulb className="w-5 h-5" />}>
            <InsightList items={[...insights.topHooks, ...insights.visualPatterns].slice(0, 10)} />
          </Section>

          <Section title="Campaign Ideas" icon={<Box className="w-5 h-5" />}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {insights.campaignIdeas.map((idea) => <CampaignCard key={idea.title} idea={idea} />)}
            </div>
          </Section>
        </>
      )}

      {status === 'idle' && (
        <div className="card p-10 text-center border-dashed">
          <Sparkles className="w-8 h-8 mx-auto mb-2 text-surface-300" />
          <p className="font-semibold text-surface-700 dark:text-surface-200">Start with a seasonal moment</p>
          <p className="text-sm text-surface-500 mt-1">Try football, Stampede, golf events, Canada Day, or trade shows.</p>
        </div>
      )}
    </div>
  );
}

function ExpandedTopicPanel({ topic, status }: { topic: ExpandedTopic; status: string }) {
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-surface-400">Expanded Topic</p>
          <h2 className="text-xl font-bold text-surface-900 dark:text-white">{topic.primaryTopic}</h2>
        </div>
        <span className="rounded-full border border-surface-200 dark:border-surface-800 px-3 py-1 text-xs font-medium text-surface-500 capitalize">
          {status}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
        <TokenGroup label="Search Hashtags" icon={<Tag className="w-4 h-4" />} items={topic.hashtags.map((tag) => `#${tag}`)} />
        <TokenGroup label="Related Terms" icon={<Flame className="w-4 h-4" />} items={topic.relatedKeywords.slice(0, 8)} />
        <TokenGroup label="Context Signals" icon={<BarChart3 className="w-4 h-4" />} items={[...topic.locations, ...topic.eventKeywords].slice(0, 8)} />
      </div>
    </div>
  );
}

function TokenGroup({ label, icon, items }: { label: string; icon: React.ReactNode; items: string[] }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 font-medium text-surface-700 dark:text-surface-200">{icon}{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-full bg-surface-100 dark:bg-surface-800 px-2.5 py-1 text-xs text-surface-600 dark:text-surface-300">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function MetricSummary({ items, status }: { items: CreativeItem[]; status: string }) {
  const avgScore = items.reduce((sum, item) => sum + item.finalScore, 0) / items.length;
  const views = items.reduce((sum, item) => sum + item.viewCount, 0);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Stat label="Creative Items" value={String(items.length)} sub={status === 'cached' ? 'Returned from cache' : 'Collected and scored'} icon={<Sparkles className="w-5 h-5" />} />
      <Stat label="Organic Reach Signals" value={compact(views)} sub="Total public views found" icon={<Eye className="w-5 h-5" />} />
      <Stat label="Avg Viral Fit" value={score(avgScore)} sub="Topic relevance plus viral signals" icon={<BarChart3 className="w-5 h-5" />} />
    </div>
  );
}

function Stat({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-surface-500">{label}</p>
        <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-brand-50 text-brand-600 dark:bg-brand-950/40">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-bold text-surface-900 dark:text-white tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-surface-400">{sub}</p>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-surface-900 dark:text-white">
        <span className="text-brand-600">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function CreativeCard({ item, rank }: { item: CreativeItem; rank: number }) {
  return (
    <article className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase text-surface-400">{item.platform} · {item.source}</p>
          <h3 className="truncate text-sm font-semibold text-surface-900 dark:text-white">
            <span className="text-surface-400">#{rank}</span> {item.creatorHandle ? `@${item.creatorHandle}` : item.creatorName || 'Unknown creator'}
          </h3>
        </div>
        <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
          {score(item.finalScore)}
        </span>
      </div>
      <p className="mt-3 line-clamp-3 text-sm text-surface-600 dark:text-surface-400">{item.caption || 'No caption provided.'}</p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-surface-500">
        <Metric label="Views" value={compact(item.viewCount)} />
        <Metric label="Likes" value={compact(item.likeCount)} />
        <Metric label="Comments" value={compact(item.commentCount)} />
      </div>
      <div className="mt-4 space-y-2 text-sm">
        <Usefulness label="Viral signal" value={item.aiSummary} />
        <Usefulness label="Hook" value={item.hook} />
      </div>
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-surface-900 dark:bg-surface-700 px-3 py-2 text-sm text-white hover:bg-surface-800 dark:hover:bg-surface-600">
        <ExternalLink className="w-3.5 h-3.5" /> Open source
      </a>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-50 dark:bg-surface-900 px-2 py-1">
      <p className="font-semibold text-surface-800 dark:text-surface-100">{value}</p>
      <p className="text-surface-400">{label}</p>
    </div>
  );
}

function Usefulness({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <p className="text-surface-600 dark:text-surface-300">
      <span className="font-medium text-surface-900 dark:text-white">{label}:</span> {value}
    </p>
  );
}

function InsightList({ items }: { items: string[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map((item) => (
        <div key={item} className="rounded-lg border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 text-sm text-surface-700 dark:text-surface-200">
          {item}
        </div>
      ))}
    </div>
  );
}

function CampaignCard({ idea }: { idea: CreativeInsights['campaignIdeas'][number] }) {
  return (
    <article className="card p-5">
      <h3 className="font-bold text-surface-900 dark:text-white">{idea.title}</h3>
      <p className="mt-2 text-sm text-surface-600 dark:text-surface-300">{idea.hook}</p>
      <p className="mt-3 text-xs font-medium uppercase text-surface-400">Products</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {idea.products.map((product) => (
          <span key={product} className="rounded-full bg-surface-100 dark:bg-surface-800 px-2.5 py-1 text-xs text-surface-600 dark:text-surface-300">{product}</span>
        ))}
      </div>
      <p className="mt-3 text-sm text-surface-600 dark:text-surface-300">{idea.visualDirection}</p>
      <p className="mt-3 text-sm font-medium text-brand-600 dark:text-brand-400">{idea.cta}</p>
    </article>
  );
}
