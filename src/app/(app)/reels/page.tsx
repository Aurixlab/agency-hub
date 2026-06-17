'use client';

import { useCallback, useState } from 'react';
import {
  Flame, Search, Loader2, Eye, Heart, MessageCircle, MapPin,
  TrendingUp, BarChart3, AlertCircle, ExternalLink,
} from 'lucide-react';

interface Reel {
  id: string;
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

const compact = (n: number) =>
  new Intl.NumberFormat('en-CA', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n) || 0);
const score = (n: number) =>
  new Intl.NumberFormat('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

export default function ReelsPage() {
  const [topic, setTopic] = useState('');
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async (raw: string) => {
    const cleaned = raw.trim();
    if (!cleaned) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await fetch('/api/reels/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: cleaned }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) throw new Error(payload?.error || `Request failed (${res.status}).`);
      setReels(Array.isArray(payload.reels) ? payload.reels : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setReels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Flame className="w-6 h-6 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Viral Reels 🇨🇦</h1>
          <p className="text-surface-500 dark:text-surface-400 text-sm">
            Scrapes live Instagram Reels for a topic, isolates Canadian content, and ranks the top performers by
            viral score — views + likes×2 + comments×5.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="card p-5">
        <form
          onSubmit={(e) => { e.preventDefault(); if (!loading) handleSearch(topic); }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={topic}
              disabled={loading}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. torontofood, hiking, realestate"
              className="input pl-9"
            />
          </div>
          <button type="submit" disabled={loading || !topic.trim()} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Scraping…</> : <><Search className="w-4 h-4" /> Search Reels</>}
          </button>
        </form>
        {loading && (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm font-medium text-amber-800 dark:text-amber-300">
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
            Scraping live data — this can take up to 2 minutes. Please don&rsquo;t refresh.
          </p>
        )}
      </div>

      {/* Error */}
      {error && !loading && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Could not complete the search</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Metrics */}
      {!loading && reels.length > 0 && <MetricSummary reels={reels} />}

      {/* Results */}
      {!loading && reels.length > 0 && (
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Top {reels.length} reels</h2>
            {topic.trim() && (
              <p className="text-sm text-surface-400">
                for <span className="font-medium text-surface-600 dark:text-surface-300">#{topic.trim().replace(/^#+/, '').toLowerCase()}</span>
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {reels.map((reel, i) => <ReelCard key={reel.instagramId ?? i} reel={reel} rank={i + 1} />)}
          </div>
        </div>
      )}

      {/* Empty states */}
      {!loading && searched && !error && reels.length === 0 && (
        <div className="card p-10 text-center border-dashed">
          <p className="font-semibold text-surface-700 dark:text-surface-200">No Canadian reels found for this topic.</p>
          <p className="text-sm text-surface-500 mt-1">Try a broader or more location-specific keyword (e.g. torontofood, vancouverlife).</p>
        </div>
      )}
      {!loading && !searched && (
        <div className="card p-10 text-center border-dashed">
          <Flame className="w-8 h-8 mx-auto mb-2 text-surface-300" />
          <p className="font-semibold text-surface-700 dark:text-surface-200">Start by searching a topic above</p>
          <p className="text-sm text-surface-500 mt-1">We&rsquo;ll pull live Reels and surface the top Canadian performers.</p>
        </div>
      )}
    </div>
  );
}

// ==================== METRIC SUMMARY ====================
function MetricSummary({ reels }: { reels: Reel[] }) {
  const totalReach = reels.reduce((s, r) => s + (Number(r.playCount) || 0), 0);
  const avgScore = reels.reduce((s, r) => s + (Number(r.viralScore) || 0), 0) / reels.length;
  const peakPlays = reels.reduce((m, r) => Math.max(m, Number(r.playCount) || 0), 0);

  const Stat = ({ label, value, sub, icon, accent }: { label: string; value: string; sub: string; icon: React.ReactNode; accent: string }) => (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-surface-500">{label}</p>
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${accent}`}>{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-bold text-surface-900 dark:text-white tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-surface-400">{sub}</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Stat label="Total Reach" value={compact(totalReach)} sub={`Sum of views across ${reels.length} reels`}
        icon={<Eye className="w-5 h-5" />} accent="bg-brand-50 text-brand-600 dark:bg-brand-950/40" />
      <Stat label="Avg Viral Score" value={score(avgScore)} sub="Mean viral score of results"
        icon={<BarChart3 className="w-5 h-5" />} accent="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40" />
      <Stat label="Peak Performer" value={compact(peakPlays)} sub="Highest single-reel play count"
        icon={<TrendingUp className="w-5 h-5" />} accent="bg-amber-50 text-amber-600 dark:bg-amber-950/40" />
    </div>
  );
}

// ==================== REEL CARD ====================
function ReelCard({ reel, rank }: { reel: Reel; rank: number }) {
  const username = reel.authorUsername || 'unknown';
  const safeUrl = typeof reel.url === 'string' && /^https?:\/\//i.test(reel.url) ? reel.url : undefined;

  return (
    <article className="card p-5 flex flex-col h-full">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="w-6 h-6 flex-shrink-0 rounded-full bg-surface-100 dark:bg-surface-800 text-xs font-bold text-surface-500 flex items-center justify-center tabular-nums">{rank}</span>
          <p className="truncate text-sm font-semibold text-surface-900 dark:text-white">
            <span className="text-surface-400">@</span>{username}
          </p>
        </div>
        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
          <Flame className="w-3.5 h-3.5" /> <span className="tabular-nums">{score(reel.viralScore)}</span>
        </span>
      </header>

      {reel.locationName && (
        <p className="mt-2 flex items-center gap-1 text-xs text-surface-400">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0" /> <span className="truncate">{reel.locationName}</span>
        </p>
      )}

      <p className="mt-3 line-clamp-3 text-sm text-surface-600 dark:text-surface-400">
        {reel.caption?.trim() ? reel.caption : <span className="italic text-surface-400">No caption provided.</span>}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-surface-100 dark:border-surface-800 pt-4">
        <Metric icon={<Eye className="w-4 h-4" />} value={compact(reel.playCount)} label="Views" />
        <Metric icon={<Heart className="w-4 h-4" />} value={compact(reel.likeCount)} label="Likes" />
        <Metric icon={<MessageCircle className="w-4 h-4" />} value={compact(reel.commentCount)} label="Comments" />
      </div>

      <div className="mt-4">
        {safeUrl ? (
          <a href={safeUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-md bg-surface-900 dark:bg-surface-700 py-2 text-sm text-white transition-colors hover:bg-surface-800 dark:hover:bg-surface-600">
            <ExternalLink className="w-3.5 h-3.5" /> View on Instagram
          </a>
        ) : (
          <span className="block cursor-not-allowed rounded-md bg-surface-100 dark:bg-surface-800 py-2 text-center text-sm text-surface-400">Link unavailable</span>
        )}
      </div>
    </article>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-surface-600 dark:text-surface-400" title={`${label}: ${value}`}>
      <span className="text-surface-400">{icon}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}
