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

  // Group by date if it's overview (multiple clients)
  // Or just use as is if it's single client
  const data = snapshots.map(s => ({
    ...s,
    formattedDate: format(parseISO(s.date), 'MMM dd'),
  }));

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 h-[400px]">
      <h3 className="font-bold text-gray-900 mb-6">Performance Trend</h3>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorImpressions" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1}/>
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
          <XAxis 
            dataKey="formattedDate" 
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: '#9ca3af' }}
            minTickGap={30}
          />
          <YAxis 
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: '#9ca3af' }}
          />
          <Tooltip 
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
          />
          <Legend iconType="circle" />
          <Area 
            name="Clicks"
            type="monotone" 
            dataKey="clicks" 
            stroke="#3b82f6" 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorClicks)" 
          />
          <Area 
            name="Impressions"
            type="monotone" 
            dataKey="impressions" 
            stroke="#8b5cf6" 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorImpressions)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
