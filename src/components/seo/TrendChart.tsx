'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';

export default function TrendChart({ snapshots }: { snapshots: any[] }) {
  if (!snapshots?.length) return (
    <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-100 dark:border-surface-800 p-8 text-center text-surface-400 h-[400px] flex items-center justify-center">
      No chart data available. Click &quot;Sync Now&quot; to load data.
    </div>
  );

  // Aggregate by date (sums clicks/impressions if multiple clients share a date)
  const byDate = snapshots.reduce((acc: Record<string, any>, cur: any) => {
    const d = cur.date;
    if (acc[d]) {
      acc[d].clicks += cur.clicks || 0;
      acc[d].impressions += cur.impressions || 0;
      acc[d].posSum += cur.avg_position || 0;
      acc[d].count += 1;
    } else {
      acc[d] = {
        date: d,
        clicks: cur.clicks || 0,
        impressions: cur.impressions || 0,
        posSum: cur.avg_position || 0,
        count: 1,
      };
    }
    return acc;
  }, {});

  const data = Object.values(byDate)
    .sort((a: any, b: any) => a.date.localeCompare(b.date))
    .map((s: any) => ({
      ...s,
      formattedDate: format(parseISO(s.date), 'MMM dd'),
    }));

  return (
    <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm p-6 h-[400px]">
      <h3 className="font-bold text-surface-900 dark:text-white mb-4">Performance Trend</h3>
      <ResponsiveContainer width="100%" height="88%">
        <AreaChart data={data} margin={{ top: 10, right: 40, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#d4952a" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#d4952a" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorImpressions" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-surface-100 dark:text-surface-800" />

          <XAxis
            dataKey="formattedDate"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'currentColor' }}
            className="text-surface-400 dark:text-surface-500"
            minTickGap={30}
          />

          {/* Left axis — Clicks */}
          <YAxis
            yAxisId="clicks"
            orientation="left"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#d4952a' }}
            width={40}
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
          />

          {/* Right axis — Impressions */}
          <YAxis
            yAxisId="impressions"
            orientation="right"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#6366f1' }}
            width={45}
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
          />

          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--tooltip-bg, #fff)',
              borderRadius: '12px',
              border: 'none',
              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
            }}
            itemStyle={{ fontSize: '12px' }}
            labelStyle={{ fontWeight: 'bold', marginBottom: '4px', color: 'inherit' }}
            formatter={(value: any) => Number(value).toLocaleString()}
          />

          <Legend iconType="circle" />

          <Area
            yAxisId="clicks"
            name="Clicks"
            type="monotone"
            dataKey="clicks"
            stroke="#d4952a"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#colorClicks)"
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Area
            yAxisId="impressions"
            name="Impressions"
            type="monotone"
            dataKey="impressions"
            stroke="#6366f1"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#colorImpressions)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <style jsx global>{`
        .dark .recharts-tooltip-wrapper { --tooltip-bg: #1a1a1a; color: #fff; }
      `}</style>
    </div>
  );
}
