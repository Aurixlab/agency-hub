'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Info, ChevronRight } from 'lucide-react';

interface QueryItem {
  query: string;
  clicks: number;
  previousClicks: number;
  trend: number;
  isNew: boolean;
}

export default function QueriesSection({ slug }: { slug: string }) {
  const [activeTab, setActiveTab] = useState<'top' | 'up' | 'down'>('top');
  const [data, setData] = useState<{ top: QueryItem[], up: QueryItem[], down: QueryItem[] }>({
    top: [],
    up: [],
    down: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchQueries() {
      if (slug === 'overview') {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/seo/queries/${slug}`);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        }
      } catch (error) {
        console.error('Failed to fetch queries:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchQueries();
  }, [slug]);

  if (slug === 'overview') return null;

  const currentList = data[activeTab];

  return (
    <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="px-6 py-5 border-b border-surface-50 dark:border-surface-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-surface-900 dark:text-white">Queries leading to your site</h3>
          <Info className="w-4 h-4 text-surface-400 cursor-help" />
        </div>
        <button className="text-brand-600 dark:text-brand-400 text-sm font-medium hover:underline flex items-center gap-1">
          View more <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="px-6 py-2 border-b border-surface-50 dark:border-surface-800 flex items-center justify-between bg-surface-50/30 dark:bg-surface-800/30">
        <div className="flex gap-6">
          {(['top', 'up', 'down'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 text-sm font-medium border-b-2 transition-all capitalize ${
                activeTab === tab 
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400' 
                  : 'border-transparent text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'
              }`}
            >
              {tab === 'top' ? 'Top' : tab === 'up' ? 'Trending up' : 'Trending down'}
            </button>
          ))}
        </div>
        <div className="text-[10px] font-bold text-surface-400 uppercase tracking-widest">
          Clicks
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-[300px]">
        {loading ? (
          <div className="space-y-4 p-6">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-10 bg-surface-50 dark:bg-surface-800 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : currentList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-surface-400">
            <p className="text-sm">No data available for this period.</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-50 dark:divide-surface-800">
            {currentList.map((item, idx) => (
              <div key={idx} className="px-6 py-4 flex items-center justify-between hover:bg-surface-50/50 dark:hover:bg-surface-800/50 transition-colors group">
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-sm font-medium text-surface-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {item.query}
                  </p>
                </div>

                <div className="flex items-center gap-6">
                  <div className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full ${
                    item.isNew ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' :
                    item.trend > 0 ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 
                    item.trend < 0 ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400' : 
                    'bg-surface-50 dark:bg-surface-800 text-surface-500 dark:text-surface-400'
                  }`}>
                    {item.isNew ? (
                      <>Previously 0</>
                    ) : (
                      <>
                        {item.trend > 0 ? <TrendingUp className="w-3 h-3" /> : item.trend < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                        {Math.abs(item.trend)}%
                      </>
                    )}
                  </div>
                  <div className="text-sm font-bold text-surface-900 dark:text-white w-8 text-right">
                    {item.clicks}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
