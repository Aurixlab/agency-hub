'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, HelpCircle, FileText } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

export default function IndexingStatus({ slug }: { slug: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchIndexing() {
      if (slug === 'overview') return;
      setLoading(true);
      try {
        const res = await fetch(`/api/seo/indexing/${slug}`);
        const json = await res.json();
        // Take the latest record
        if (json && json.length > 0) {
          setData(json[0]);
        }
      } catch (err) {
        console.error('Failed to fetch indexing:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchIndexing();
  }, [slug]);

  if (slug === 'overview') return null;
  if (loading) return <div className="h-64 bg-gray-50 animate-pulse rounded-2xl" />;

  const chartData = [
    { name: 'Indexed', value: data?.indexed_pages || 0, color: '#10b981' },
    { name: 'Not Indexed', value: data?.not_indexed_pages || 0, color: '#ef4444' },
  ];

  const total = (data?.indexed_pages || 0) + (data?.not_indexed_pages || 0);
  const indexedPercent = total > 0 ? ((data.indexed_pages / total) * 100).toFixed(1) : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
        <FileText className="w-5 h-5 text-gray-400" />
        Indexing Coverage
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-900">Indexed Pages</span>
            </div>
            <span className="font-bold text-emerald-900">{data?.indexed_pages || 0}</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-rose-50 rounded-xl">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <span className="text-sm font-medium text-rose-900">Not Indexed</span>
            </div>
            <span className="font-bold text-rose-900">{data?.not_indexed_pages || 0}</span>
          </div>

          <div className="pt-2">
            <p className="text-xs text-gray-500 mb-1">Overall Health</p>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-1000" 
                style={{ width: `${indexedPercent}%` }}
              />
            </div>
            <p className="text-right text-xs font-bold text-gray-900 mt-1">{indexedPercent}% Indexed</p>
          </div>
        </div>
      </div>
      
      {data?.coverage_issues && (
        <div className="mt-6 pt-6 border-t border-gray-100">
          <p className="text-sm font-bold text-gray-900 mb-3">Coverage Issues</p>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3">
            <HelpCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              Google has identified some pages as "Discovered - currently not indexed". Check your GSC console for specific URL issues.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
