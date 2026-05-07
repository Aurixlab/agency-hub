import React from 'react';
import { ExternalLink } from 'lucide-react';

export default function KeywordTable({ keywords }: { keywords: any[] }) {
  if (!keywords?.length) return (
    <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-500">
      No keyword data available for this period.
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="font-bold text-gray-900">Top Performing Keywords</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-6 py-3">Keyword</th>
              <th className="px-6 py-3">Clicks</th>
              <th className="px-6 py-3">Impressions</th>
              <th className="px-6 py-3">CTR</th>
              <th className="px-6 py-3">Position</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {keywords.map((kw, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{kw.keyword}</span>
                    <a 
                      href={`https://www.google.com/search?q=${encodeURIComponent(kw.keyword)}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-blue-600 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-600">{kw.clicks.toLocaleString()}</td>
                <td className="px-6 py-4 text-gray-600">{kw.impressions.toLocaleString()}</td>
                <td className="px-6 py-4 text-gray-600">{(kw.ctr * 100).toFixed(2)}%</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                    kw.position <= 3 ? 'bg-emerald-100 text-emerald-700' :
                    kw.position <= 10 ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    #{Number(kw.position).toFixed(1)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
