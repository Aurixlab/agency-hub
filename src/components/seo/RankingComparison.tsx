'use client';

import React, { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

export default function RankingComparison({ slug }: { slug: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchComparison() {
      if (slug === 'overview') return;
      setLoading(true);
      try {
        const res = await fetch(`/api/seo/comparison/${slug}`);
        const json = await res.json();
        setData(Array.isArray(json) ? json : []);
      } catch (err) {
        console.error('Failed to fetch comparison:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchComparison();
  }, [slug]);

  if (slug === 'overview') return null;
  if (loading) return <div className="h-64 bg-gray-50 animate-pulse rounded-2xl" />;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h3 className="font-bold text-gray-900 mb-6 flex items-center justify-between">
        Month-over-Month Delta
        <span className="text-xs font-normal text-gray-500 uppercase tracking-wider">Top Improved</span>
      </h3>
      
      <div className="space-y-4">
        {data.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">No comparison data yet. Need at least 2 months of history.</p>
        ) : (
          data.map((item, i) => (
            <div key={i} className="flex items-center justify-between group">
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-sm font-medium text-gray-900 truncate">{item.keyword}</p>
                <p className="text-xs text-gray-500">Pos: #{Number(item.current_position).toFixed(1)}</p>
              </div>
              
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-1 text-sm font-bold ${
                  item.position_delta > 0 ? 'text-emerald-600' : 
                  item.position_delta < 0 ? 'text-rose-600' : 'text-gray-400'
                }`}>
                  {item.position_delta > 0 && <ArrowUp className="w-3 h-3" />}
                  {item.position_delta < 0 && <ArrowDown className="w-3 h-3" />}
                  {item.position_delta === 0 && <Minus className="w-3 h-3" />}
                  {Math.abs(Number(item.position_delta)).toFixed(1)}
                </div>
                
                <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
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
