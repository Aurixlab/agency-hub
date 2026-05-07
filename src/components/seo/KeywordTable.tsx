import React from 'react';
import { ExternalLink } from 'lucide-react';

export default function KeywordTable({ keywords }: { keywords: any[] }) {
  const [search, setSearch] = React.useState('');

  const filteredKeywords = React.useMemo(() => {
    if (!keywords) return [];
    return keywords.filter(k => 
      k.keyword.toLowerCase().includes(search.toLowerCase())
    );
  }, [keywords, search]);

  if (!keywords?.length) return (
    <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-500">
      No keyword data available for this period.
    </div>
  );

  return (
    <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-surface-100 dark:border-surface-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h3 className="font-bold text-surface-900 dark:text-white">Top Performing Keywords</h3>
        <div className="relative">
          <input 
            type="text"
            placeholder="Search keywords..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-4 pr-10 py-2 text-sm border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent w-full md:w-64"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-surface-50 dark:bg-surface-800/50 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">
            <tr>
              <th className="px-6 py-3">Keyword</th>
              <th className="px-6 py-3">Clicks</th>
              <th className="px-6 py-3">Impressions</th>
              <th className="px-6 py-3">CTR</th>
              <th className="px-6 py-3">Position</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
            {filteredKeywords.map((kw, i) => (
              <tr key={i} className="hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-surface-900 dark:text-white">{kw.keyword}</span>
                    <a 
                      href={`https://www.google.com/search?q=${encodeURIComponent(kw.keyword)}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-surface-400 hover:text-brand-600 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </td>
                <td className="px-6 py-4 text-surface-600 dark:text-surface-400">{kw.clicks.toLocaleString()}</td>
                <td className="px-6 py-4 text-surface-600 dark:text-surface-400">{kw.impressions.toLocaleString()}</td>
                <td className="px-6 py-4 text-surface-600 dark:text-surface-400">{(kw.ctr * 100).toFixed(2)}%</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                    kw.position <= 3 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                    kw.position <= 10 ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400' :
                    'bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-400'
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
