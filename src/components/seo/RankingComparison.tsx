'use client';

import React, { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

type ComparisonType = 'weekly' | 'monthly';

interface ComparisonItem {
  keyword: string;
  current_position: number;
  prev_position: number;
  position_delta: number;
  clicks: number;
}

interface ComparisonResponse {
  success: boolean;
  type: ComparisonType;
  periodLabel: string;
  prevPeriodLabel: string;
  data: ComparisonItem[];
}

export default function RankingComparison({ slug }: { slug: string }) {
  const [compType, setCompType] = useState<ComparisonType>('monthly');
  const [response, setResponse] = useState<ComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (slug === 'overview') return;
    async function fetchComparison() {
      setLoading(true);
      try {
        const res = await fetch(`/api/seo/comparison/${slug}?type=${compType}`);
        const json = await res.json();
        setResponse(json);
      } catch (err) {
        console.error('Failed to fetch comparison:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchComparison();
  }, [slug, compType]);

  if (slug === 'overview') return null;

  const data = response?.data ?? [];

  return (
    <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-bold text-surface-900 dark:text-white">Ranking Comparison</h3>
          {response && (
            <p className="text-xs text-surface-400 dark:text-surface-500 mt-0.5">
              {response.prevPeriodLabel} → {response.periodLabel}
            </p>
          )}
        </div>
        {/* Weekly / Monthly toggle */}
        <div className="flex items-center gap-1 p-0.5 bg-surface-100 dark:bg-surface-800 rounded-lg text-xs font-medium">
          {(['weekly', 'monthly'] as ComparisonType[]).map((t) => (
            <button
              key={t}
              onClick={() => setCompType(t)}
              className={`px-3 py-1 rounded-md capitalize transition-all ${
                compType === t
                  ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm'
                  : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="text-[10px] font-bold text-surface-400 dark:text-surface-500 uppercase tracking-widest mb-3">
        Top Improved Keywords
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 bg-surface-50 dark:bg-surface-800 animate-pulse rounded-lg" />
          ))
        ) : data.length === 0 ? (
          <p className="text-center text-surface-400 dark:text-surface-500 py-8 text-sm">
            No comparison data yet. Need at least 2 {compType === 'weekly' ? 'weeks' : 'months'} of history.
          </p>
        ) : (
          data.map((item, i) => (
            <div key={i} className="flex items-center justify-between group">
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-sm font-medium text-surface-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                  {item.keyword}
                </p>
                <p className="text-xs text-surface-500 dark:text-surface-400">
                  #{Number(item.prev_position).toFixed(1)} → #{Number(item.current_position).toFixed(1)}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-1 text-sm font-bold ${
                  item.position_delta > 0 ? 'text-emerald-600 dark:text-emerald-400' :
                  item.position_delta < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-surface-400'
                }`}>
                  {item.position_delta > 0 && <ArrowUp className="w-3 h-3" />}
                  {item.position_delta < 0 && <ArrowDown className="w-3 h-3" />}
                  {item.position_delta === 0 && <Minus className="w-3 h-3" />}
                  {Math.abs(Number(item.position_delta)).toFixed(1)}
                </div>

                <div className="w-12 h-1.5 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${item.position_delta > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.min(100, Math.abs(item.position_delta) * 10)}%` }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
