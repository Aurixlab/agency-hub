'use client';

import React, { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

type ComparisonType = 'weekly' | 'monthly';

interface ComparisonItem {
  keyword: string;
  currentPosition: number;
  previousPosition: number;
  delta: number;
  clicks: number;
  impressions: number;
}

interface ComparisonResponse {
  type: ComparisonType;
  periods: {
    current: { start: string; end: string };
    previous: { start: string; end: string };
  };
  improved: ComparisonItem[];
  declined: ComparisonItem[];
  unchanged: ComparisonItem[];
  total: number;
}

function KeywordRow({ item }: { item: ComparisonItem }) {
  const improved = item.delta > 0;
  const declined = item.delta < 0;

  return (
    <div className="flex items-center justify-between group">
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-medium text-surface-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
          {item.keyword}
        </p>
        <p className="text-xs text-surface-500 dark:text-surface-400">
          #{item.previousPosition} → #{item.currentPosition}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-1 text-sm font-bold ${
          improved ? 'text-emerald-600 dark:text-emerald-400' :
          declined ? 'text-rose-600 dark:text-rose-400' : 'text-surface-400'
        }`}>
          {improved && <ArrowUp className="w-3 h-3" />}
          {declined && <ArrowDown className="w-3 h-3" />}
          {!improved && !declined && <Minus className="w-3 h-3" />}
          {Math.abs(item.delta).toFixed(1)}
        </div>

        <div className="w-12 h-1.5 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${improved ? 'bg-emerald-500' : 'bg-rose-500'}`}
            style={{ width: `${Math.min(100, Math.abs(item.delta) * 10)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function RankingComparison({ slug }: { slug: string }) {
  const [mode, setMode] = useState<ComparisonType>('monthly');
  const [response, setResponse] = useState<ComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (slug === 'overview') return;
    async function fetchComparison() {
      setLoading(true);
      try {
        const res = await fetch(`/api/seo/comparison/${slug}?type=${mode}`);
        const json = await res.json();
        setResponse(json);
      } catch (err) {
        console.error('Failed to fetch comparison:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchComparison();
  }, [slug, mode]);

  if (slug === 'overview') return null;

  const skeletonRows = Array.from({ length: 6 }).map((_, i) => (
    <div key={i} className="h-8 bg-surface-50 dark:bg-surface-800 animate-pulse rounded-lg" />
  ));

  const periodLabel = response
    ? `${response.periods.previous.start} – ${response.periods.current.end}`
    : null;

  return (
    <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-bold text-surface-900 dark:text-white">Ranking Comparison</h3>
          {periodLabel && (
            <p className="text-xs text-surface-400 dark:text-surface-500 mt-0.5">{periodLabel}</p>
          )}
        </div>
        <div className="flex items-center gap-1 p-0.5 bg-surface-100 dark:bg-surface-800 rounded-lg text-xs font-medium">
          {(['weekly', 'monthly'] as ComparisonType[]).map((t) => (
            <button
              key={t}
              onClick={() => setMode(t)}
              className={`px-3 py-1 rounded-md capitalize transition-all ${
                mode === t
                  ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm'
                  : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5">
        {loading ? (
          <div className="space-y-3">{skeletonRows}</div>
        ) : !response || response.total === 0 ? (
          <p className="text-center text-surface-400 dark:text-surface-500 py-8 text-sm">
            No comparison data yet. Need at least 2 {mode === 'weekly' ? 'weeks' : 'months'} of history.
          </p>
        ) : (
          <>
            {response.improved.length > 0 && (
              <section>
                <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-3">
                  Top Improved ({response.improved.length})
                </div>
                <div className="space-y-3">
                  {response.improved.map((item, i) => (
                    <KeywordRow key={i} item={item} />
                  ))}
                </div>
              </section>
            )}

            {response.declined.length > 0 && (
              <section>
                <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-widest mb-3">
                  Declined ({response.declined.length})
                </div>
                <div className="space-y-3">
                  {response.declined.map((item, i) => (
                    <KeywordRow key={i} item={item} />
                  ))}
                </div>
              </section>
            )}

            {response.unchanged.length > 0 && (
              <section>
                <div className="text-[10px] font-bold text-surface-400 dark:text-surface-500 uppercase tracking-widest mb-3">
                  Unchanged ({response.unchanged.length})
                </div>
                <div className="space-y-3">
                  {response.unchanged.map((item, i) => (
                    <KeywordRow key={i} item={item} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
