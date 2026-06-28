'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  TrendingUp, TrendingDown, Minus, Filter, GitCompare, X, ChevronDown,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueryItem {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  previousClicks: number;
  trend: number;
  isNew: boolean;
}

interface TimeSeriesPoint {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface CompareData {
  query1: { label: string; series: TimeSeriesPoint[] };
  query2?: { label: string; series: TimeSeriesPoint[] };
}

type TabMode = 'top' | 'up' | 'down';
type Metric = 'clicks' | 'impressions' | 'ctr' | 'position';

const METRIC_LABELS: Record<Metric, string> = {
  clicks: 'Clicks',
  impressions: 'Impressions',
  ctr: 'CTR (%)',
  position: 'Position',
};

const Q1_COLOR = '#d4952a';
const Q2_COLOR = '#6366f1';

// ─── Sub-components ───────────────────────────────────────────────────────────

function TrendBadge({ item }: { item: QueryItem }) {
  if (item.isNew) {
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400">
        New
      </span>
    );
  }
  if (item.trend > 0) {
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
        <TrendingUp className="w-3 h-3" />+{item.trend}%
      </span>
    );
  }
  if (item.trend < 0) {
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
        <TrendingDown className="w-3 h-3" />{item.trend}%
      </span>
    );
  }
  return <span className="text-[10px] text-surface-400"><Minus className="w-3 h-3" /></span>;
}

function QueryTable({ items }: { items: QueryItem[] }) {
  return (
    <div>
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 sm:px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-surface-400 border-b border-surface-50 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-800/30">
        <span>Query</span>
        <span className="text-right w-14">Clicks</span>
        <span className="text-right w-16">Impr.</span>
        <span className="text-right w-12">CTR</span>
        <span className="text-right w-12">Pos.</span>
      </div>
      <div className="divide-y divide-surface-50 dark:divide-surface-800">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center px-4 sm:px-6 py-3 hover:bg-surface-50/50 dark:hover:bg-surface-800/50 transition-colors group"
          >
            <div className="min-w-0 flex items-center gap-2">
              <p className="text-sm font-medium text-surface-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                {item.query}
              </p>
              <TrendBadge item={item} />
            </div>
            <span className="text-sm font-semibold text-surface-900 dark:text-white text-right w-14">{item.clicks.toLocaleString()}</span>
            <span className="text-sm text-surface-600 dark:text-surface-400 text-right w-16">{item.impressions.toLocaleString()}</span>
            <span className="text-sm text-surface-600 dark:text-surface-400 text-right w-12">{item.ctr}%</span>
            <span className="text-sm text-surface-600 dark:text-surface-400 text-right w-12">#{item.position}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompareChart({
  compareData,
  metric,
  onMetricChange,
}: {
  compareData: CompareData;
  metric: Metric;
  onMetricChange: (m: Metric) => void;
}) {
  const allDates = new Set([
    ...compareData.query1.series.map(p => p.date),
    ...(compareData.query2?.series.map(p => p.date) || []),
  ]);

  const chartData = Array.from(allDates)
    .sort()
    .map(date => {
      const p1 = compareData.query1.series.find(p => p.date === date);
      const p2 = compareData.query2?.series.find(p => p.date === date);
      return {
        date,
        label: format(parseISO(date), 'MMM dd'),
        q1: p1?.[metric] ?? null,
        q2: p2?.[metric] ?? null,
      };
    });

  const q1Label = compareData.query1.label;
  const q2Label = compareData.query2?.label;

  return (
    <div className="px-4 sm:px-6 pb-4">
      {/* Metric selector */}
      <div className="flex items-center gap-2 mb-3 mt-2">
        {(Object.keys(METRIC_LABELS) as Metric[]).map(m => (
          <button
            key={m}
            onClick={() => onMetricChange(m)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
              metric === m
                ? 'bg-brand-500 text-white'
                : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700'
            }`}
          >
            {METRIC_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-surface-100 dark:text-surface-800" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-surface-400"
              minTickGap={40}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-surface-400"
              width={36}
              tickFormatter={v => metric === 'ctr' ? `${v}%` : metric === 'position' ? `#${v}` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
              reversed={metric === 'position'}
            />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--tooltip-bg,#fff)', borderRadius: '10px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', fontSize: 12 }}
              formatter={(value: any) => metric === 'ctr' ? `${value}%` : metric === 'position' ? `#${value}` : Number(value).toLocaleString()}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
            <Line
              type="monotone"
              dataKey="q1"
              name={q1Label}
              stroke={Q1_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              connectNulls
            />
            {q2Label && (
              <Line
                type="monotone"
                dataKey="q2"
                name={q2Label}
                stroke={Q2_COLOR}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Summary stats */}
      <div className={`grid gap-3 mt-3 ${q2Label ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {[compareData.query1, compareData.query2].filter(Boolean).map((q, i) => {
          if (!q) return null;
          const series = q.series;
          const total = series.reduce((s, p) => s + p[metric], 0);
          const avg = series.length ? total / series.length : 0;
          const display = metric === 'clicks' || metric === 'impressions'
            ? total.toLocaleString()
            : metric === 'ctr'
            ? `${avg.toFixed(2)}%`
            : `#${avg.toFixed(1)}`;
          const label = metric === 'clicks' || metric === 'impressions' ? 'Total' : 'Avg.';
          return (
            <div key={i} className={`rounded-xl p-3 border ${i === 0 ? 'border-[#d4952a]/30 bg-[#d4952a]/5' : 'border-indigo-300/30 bg-indigo-500/5'}`}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: i === 0 ? Q1_COLOR : Q2_COLOR }}>
                {q.label}
              </p>
              <p className="text-lg font-bold text-surface-900 dark:text-white">{display}</p>
              <p className="text-[10px] text-surface-400">{label} {METRIC_LABELS[metric]}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Filter Modal ─────────────────────────────────────────────────────────────

function FilterModal({
  onClose,
  onApply,
  initialValue,
}: {
  onClose: () => void;
  onApply: (filter: string) => void;
  initialValue: string;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-surface-900 rounded-2xl shadow-2xl w-full max-w-sm border border-surface-200 dark:border-surface-700 overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <h3 className="text-base font-bold text-surface-900 dark:text-white mb-4">Query</h3>

          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1.5 px-3 py-2 border border-blue-500 rounded-lg bg-white dark:bg-surface-800 text-sm font-medium text-blue-600 dark:text-blue-400">
              Queries containing
              <ChevronDown className="w-3.5 h-3.5" />
            </div>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && value.trim() && onApply(value.trim())}
            placeholder="Keyword"
            className="w-full px-3 py-2.5 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-sm text-surface-900 dark:text-white placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-100 dark:border-surface-800">
          <button onClick={onClose} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
            Cancel
          </button>
          <button
            onClick={() => value.trim() && onApply(value.trim())}
            disabled={!value.trim()}
            className="px-4 py-1.5 text-sm font-medium rounded-lg bg-surface-100 dark:bg-surface-700 text-surface-400 dark:text-surface-400 disabled:opacity-50 hover:bg-surface-200 dark:hover:bg-surface-600 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Compare Modal ────────────────────────────────────────────────────────────

function CompareModal({
  onClose,
  onApply,
  initialQ1,
  initialQ2,
}: {
  onClose: () => void;
  onApply: (q1: string, q2: string) => void;
  initialQ1: string;
  initialQ2: string;
}) {
  const [q1, setQ1] = useState(initialQ1);
  const [q2, setQ2] = useState(initialQ2);
  const q1Ref = useRef<HTMLInputElement>(null);

  useEffect(() => { q1Ref.current?.focus(); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-surface-900 rounded-2xl shadow-2xl w-full max-w-sm border border-surface-200 dark:border-surface-700 overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <h3 className="text-base font-bold text-surface-900 dark:text-white mb-4">Compare Queries</h3>

          {/* Query 1 */}
          <div className="mb-3">
            <div className="flex items-center gap-1.5 px-3 py-2 border border-blue-500 rounded-lg bg-white dark:bg-surface-800 text-sm font-medium text-blue-600 dark:text-blue-400 mb-2 w-fit">
              Queries containing <ChevronDown className="w-3.5 h-3.5" />
            </div>
            <input
              ref={q1Ref}
              type="text"
              value={q1}
              onChange={e => setQ1(e.target.value)}
              placeholder="Keyword"
              className="w-full px-3 py-2.5 rounded-lg border-2 border-blue-500 bg-white dark:bg-surface-800 text-sm text-surface-900 dark:text-white placeholder-surface-400 focus:outline-none"
            />
          </div>

          <div className="text-xs font-bold text-surface-400 mb-3 pl-1">vs.</div>

          {/* Query 2 */}
          <div className="mb-2">
            <div className="flex items-center gap-1.5 px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-800 text-sm text-surface-600 dark:text-surface-400 mb-2 w-fit">
              Queries containing <ChevronDown className="w-3.5 h-3.5" />
            </div>
            <input
              type="text"
              value={q2}
              onChange={e => setQ2(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && q1.trim() && onApply(q1.trim(), q2.trim())}
              placeholder="Keyword"
              className="w-full px-3 py-2.5 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-sm text-surface-900 dark:text-white placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-100 dark:border-surface-800">
          <button onClick={onClose} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
            Cancel
          </button>
          <button
            onClick={() => q1.trim() && onApply(q1.trim(), q2.trim())}
            disabled={!q1.trim()}
            className="px-4 py-1.5 text-sm font-medium rounded-lg bg-surface-100 dark:bg-surface-700 text-surface-400 disabled:opacity-50 hover:bg-surface-200 dark:hover:bg-surface-600 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function QueriesSection({ slug, period = '7' }: { slug: string; period?: string }) {
  const [activeTab, setActiveTab] = useState<TabMode>('top');
  const [data, setData] = useState<{ top: QueryItem[]; up: QueryItem[]; down: QueryItem[] }>({ top: [], up: [], down: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState('');
  const [filteredData, setFilteredData] = useState<QueryItem[]>([]);
  const [filterLoading, setFilterLoading] = useState(false);

  // Compare state
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareInputQ1, setCompareInputQ1] = useState('');
  const [compareInputQ2, setCompareInputQ2] = useState('');
  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareMetric, setCompareMetric] = useState<Metric>('clicks');
  const [isCompareMode, setIsCompareMode] = useState(false);

  // Fetch base data
  useEffect(() => {
    if (slug === 'overview') { setLoading(false); return; }
    setLoading(true);
    setError(null);
    setActiveFilter('');
    setIsCompareMode(false);
    setCompareData(null);

    fetch(`/api/seo/queries/${slug}?period=${period}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setData(json.data);
        else setError(json.error || 'Failed to load from Google Search Console.');
      })
      .catch(() => setError('Network error — could not reach the queries API.'))
      .finally(() => setLoading(false));
  }, [slug, period]);

  async function applyFilter(filter: string) {
    setShowFilterModal(false);
    setActiveFilter(filter);
    setIsCompareMode(false);
    setCompareData(null);
    setFilterLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/seo/queries/${slug}/search?period=${period}&filter=${encodeURIComponent(filter)}`);
      const json = await res.json();
      if (json.success) setFilteredData(json.data);
      else setError(json.error || 'Filter failed.');
    } catch {
      setError('Filter request failed.');
    } finally {
      setFilterLoading(false);
    }
  }

  async function applyCompare(q1: string, q2: string) {
    setShowCompareModal(false);
    setCompareInputQ1(q1);
    setCompareInputQ2(q2);
    setIsCompareMode(true);
    setActiveFilter('');
    setCompareLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period, query1: q1 });
      if (q2) params.set('query2', q2);
      const res = await fetch(`/api/seo/queries/${slug}/compare?${params}`);
      const json = await res.json();
      if (json.success) setCompareData(json.data);
      else setError(json.error || 'Compare failed.');
    } catch {
      setError('Compare request failed.');
    } finally {
      setCompareLoading(false);
    }
  }

  function clearFilter() {
    setActiveFilter('');
    setFilteredData([]);
  }

  function clearCompare() {
    setIsCompareMode(false);
    setCompareData(null);
    setCompareInputQ1('');
    setCompareInputQ2('');
  }

  if (slug === 'overview') return null;

  const busy = loading || filterLoading || compareLoading;
  const currentList = activeFilter ? filteredData : data[activeTab];

  return (
    <>
      <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm overflow-hidden flex flex-col max-w-full">

        {/* ── Header ── */}
        <div className="px-4 sm:px-6 py-4 border-b border-surface-50 dark:border-surface-800 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-surface-900 dark:text-white text-sm">Queries leading to your site</h3>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Active filter pill */}
            {activeFilter && (
              <span className="flex items-center gap-1 px-2 py-1 text-xs bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-full border border-brand-200 dark:border-brand-800">
                Contains: <strong>{activeFilter}</strong>
                <button onClick={clearFilter} className="ml-0.5 hover:text-brand-800">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Compare mode pill */}
            {isCompareMode && (
              <span className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-200 dark:border-indigo-800">
                <strong>{compareInputQ1}</strong>
                {compareInputQ2 && <> vs. <strong>{compareInputQ2}</strong></>}
                <button onClick={clearCompare} className="ml-0.5 hover:text-indigo-800">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            <button
              onClick={() => setShowFilterModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
            >
              <Filter className="w-3.5 h-3.5" /> Filter
            </button>
            <button
              onClick={() => setShowCompareModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
            >
              <GitCompare className="w-3.5 h-3.5" /> Compare
            </button>
          </div>
        </div>

        {/* ── Tabs (hidden in compare/filter mode) ── */}
        {!isCompareMode && !activeFilter && (
          <div className="px-4 sm:px-6 border-b border-surface-50 dark:border-surface-800 flex items-center justify-between bg-surface-50/30 dark:bg-surface-800/30">
            <div className="flex gap-6 overflow-x-auto">
              {(['top', 'up', 'down'] as TabMode[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                    activeTab === tab
                      ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                      : 'border-transparent text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'
                  }`}
                >
                  {tab === 'top' ? 'Top' : tab === 'up' ? 'Trending Up' : 'Trending Down'}
                </button>
              ))}
            </div>
            <span className="text-[10px] font-bold text-surface-400 uppercase tracking-widest shrink-0 pl-4">Clicks</span>
          </div>
        )}

        {/* ── Content ── */}
        <div className="flex-1 min-h-[300px] overflow-y-auto">
          {busy ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-10 bg-surface-50 dark:bg-surface-800 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <p className="text-sm font-medium text-rose-500 dark:text-rose-400 mb-1">GSC connection error</p>
              <p className="text-xs text-surface-400 dark:text-surface-500">{error}</p>
            </div>
          ) : isCompareMode ? (
            compareData ? (
              <CompareChart
                compareData={compareData}
                metric={compareMetric}
                onMetricChange={setCompareMetric}
              />
            ) : (
              <div className="flex items-center justify-center py-12 text-surface-400 text-sm">
                No data found for the given queries.
              </div>
            )
          ) : currentList.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-surface-400">
              <p className="text-sm">No data available for this period.</p>
            </div>
          ) : (
            <QueryTable items={currentList} />
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showFilterModal && (
        <FilterModal
          onClose={() => setShowFilterModal(false)}
          onApply={applyFilter}
          initialValue={activeFilter}
        />
      )}
      {showCompareModal && (
        <CompareModal
          onClose={() => setShowCompareModal(false)}
          onApply={applyCompare}
          initialQ1={compareInputQ1}
          initialQ2={compareInputQ2}
        />
      )}
    </>
  );
}
