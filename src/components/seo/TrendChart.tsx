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
  Legend
} from 'recharts';
import { format, parseISO } from 'date-fns';

export default function TrendChart({ snapshots }: { snapshots: any[] }) {
  if (!snapshots?.length) return (
    <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-500 h-[400px] flex items-center justify-center">
      No chart data available for this period.
    </div>
  );

  // Aggregated data by date (sum clicks/impressions if multiple clients share a date)
  const aggregatedData = snapshots.reduce((acc: any[], current: any) => {
    const existing = acc.find(item => item.date === current.date);
    if (existing) {
      existing.clicks += (current.clicks || 0);
      existing.impressions += (current.impressions || 0);
    } else {
      acc.push({ 
        ...current, 
        clicks: current.clicks || 0,
        impressions: current.impressions || 0
      });
    }
    return acc;
  }, []);

  const data = aggregatedData.map(s => ({
    ...s,
    formattedDate: format(parseISO(s.date), 'MMM dd'),
  }));

  return (
    <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm p-6 h-[400px]">
      <h3 className="font-bold text-surface-900 dark:text-white mb-6">Performance Trend</h3>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#d4952a" stopOpacity={0.1}/>
              <stop offset="95%" stopColor="#d4952a" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorImpressions" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#9ca3af" stopOpacity={0.1}/>
              <stop offset="95%" stopColor="#9ca3af" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-surface-100 dark:text-surface-800" />
          <XAxis 
            dataKey="formattedDate" 
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: 'currentColor' }}
            className="text-surface-400 dark:text-surface-500"
            minTickGap={30}
          />
          <YAxis 
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: 'currentColor' }}
            className="text-surface-400 dark:text-surface-500"
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'var(--tooltip-bg, #fff)', 
              borderRadius: '12px', 
              border: 'none', 
              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' 
            }}
            itemStyle={{ fontSize: '12px' }}
            labelStyle={{ fontWeight: 'bold', marginBottom: '4px', color: 'inherit' }}
          />
          <Legend iconType="circle" />
          <Area 
            name="Clicks"
            type="monotone" 
            dataKey="clicks" 
            stroke="#d4952a" 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorClicks)" 
          />
          <Area 
            name="Impressions"
            type="monotone" 
            dataKey="impressions" 
            stroke="#9ca3af" 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorImpressions)" 
          />
        </AreaChart>
      </ResponsiveContainer>
      <style jsx global>{`
        .dark .recharts-tooltip-wrapper {
          --tooltip-bg: #1a1a1a;
          color: #fff;
        }
      `}</style>
    </div>
  );
}
