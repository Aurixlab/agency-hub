import React from 'react';
import { ArrowUpRight, ArrowDownRight, MousePointer2, Eye, Percent, Hash } from 'lucide-react';

export default function MetricCards({ data, latestMetrics }: { data: any, latestMetrics?: any[] }) {
  // If it's overview data, we might want to sum things up
  // If it's client data, we show that client's latest
  
  const metrics = latestMetrics || [];
  
  const totalClicks = metrics.reduce((acc: number, m: any) => acc + (m.clicks || 0), 0);
  const totalImpressions = metrics.reduce((acc: number, m: any) => acc + (m.impressions || 0), 0);
  const avgCtr = metrics.length ? (metrics.reduce((acc: number, m: any) => acc + (m.ctr || 0), 0) / metrics.length) * 100 : 0;
  const avgPos = metrics.length ? (metrics.reduce((acc: number, m: any) => acc + (Number(m.avg_position) || 0), 0) / metrics.length) : 0;

  const cards = [
    { label: 'Total Clicks', value: totalClicks.toLocaleString(), icon: MousePointer2, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Total Impressions', value: totalImpressions.toLocaleString(), icon: Eye, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Avg. CTR', value: `${avgCtr.toFixed(2)}%`, icon: Percent, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Avg. Position', value: `#${avgPos.toFixed(1)}`, icon: Hash, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className={`p-2 rounded-xl ${card.bg}`}>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">{card.label}</p>
            <h3 className="text-2xl font-bold text-gray-900 mt-1">{card.value}</h3>
          </div>
        </div>
      ))}
    </div>
  );
}
