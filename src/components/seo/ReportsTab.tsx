'use client';

import React, { useEffect, useState } from 'react';
import { FileText, Download, Calendar, Clock, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function ReportsTab({ slug }: { slug: string }) {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchReports() {
      if (slug === 'overview') return;
      setLoading(true);
      try {
        const res = await fetch(`/api/seo/reports/${slug}`);
        const json = await res.json();
        setReports(Array.isArray(json) ? json : []);
      } catch (err) {
        console.error('Failed to fetch reports:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchReports();
  }, [slug]);

  const downloadPDF = async (month: string) => {
    // This calls the API we'll build to generate a printable window
    const res = await fetch(`/api/reports/monthly/${slug}?month=${month}`);
    const data = await res.json();

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>SEO Report — ${data.client} — ${month}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #111827; }
            h1 { font-size: 24px; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
            .grid { display: grid; grid-template-cols: repeat(3, 1fr); gap: 20px; margin: 30px 0; }
            .card { background: #f9fafb; padding: 20px; rounded: 12px; }
            .card h3 { font-size: 14px; color: #6b7280; margin: 0; }
            .card p { font-size: 24px; font-weight: bold; margin: 5px 0 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border-bottom: 1px solid #e5e7eb; padding: 12px 8px; text-align: left; }
            th { color: #6b7280; font-size: 12px; text-transform: uppercase; }
            .up { color: #059669; } .down { color: #dc2626; }
          </style>
        </head>
        <body>
          <h1>SEO Monthly Report — ${data.client}</h1>
          <p>Period: ${data.period.start} to ${data.period.end}</p>
          
          <div className="grid">
            <div className="card"><h3>Total Clicks</h3><p>${data.summary.totalClicks.toLocaleString()}</p></div>
            <div className="card"><h3>Total Impressions</h3><p>${data.summary.totalImpressions.toLocaleString()}</p></div>
            <div className="card"><h3>Avg Position</h3><p>#${data.summary.avgPosition}</p></div>
          </div>

          <h2>Top Performing Keywords</h2>
          <table>
            <thead><tr><th>Keyword</th><th>Position</th><th>Previous</th><th>Change</th><th>Clicks</th></tr></thead>
            <tbody>
              ${data.keywords.map((k: any) => `
                <tr>
                  <td><strong>${k.keyword}</strong></td>
                  <td>#${Number(k.position).toFixed(1)}</td>
                  <td>${k.prevPosition ? '#' + Number(k.prevPosition).toFixed(1) : '—'}</td>
                  <td class="${k.delta > 0 ? 'up' : 'down'}">${k.delta ? (k.delta > 0 ? '↑' : '↓') + Math.abs(k.delta) : '—'}</td>
                  <td>${k.clicks.toLocaleString()}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  if (slug === 'overview') return (
    <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
      <div className="bg-blue-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <FileText className="w-8 h-8 text-blue-600" />
      </div>
      <h3 className="text-lg font-bold text-gray-900">Agency Overview Reports</h3>
      <p className="text-gray-500 max-w-sm mx-auto mt-2">Select a specific client to view and download their detailed SEO reports and monthly summaries.</p>
    </div>
  );

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-50 animate-pulse rounded-xl" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900">Generated Reports</h3>
        <button 
          onClick={() => downloadPDF(format(new Date(), 'yyyy-MM'))}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Download className="w-4 h-4" />
          Generate April Report
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {reports.length === 0 ? (
          <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-200 p-12 text-center">
            <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Reports are automatically generated at the end of every week and month.</p>
          </div>
        ) : (
          reports.map((report) => (
            <div key={report.id} className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-blue-200 transition-all flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${
                  report.report_type === 'monthly' ? 'bg-purple-50 text-purple-600' :
                  report.report_type === 'weekly' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-600'
                }`}>
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 capitalize">{report.report_type} Performance Report</h4>
                  <p className="text-xs text-gray-500">
                    {format(parseISO(report.period_start), 'MMM d')} - {format(parseISO(report.period_end), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
              
              <button 
                onClick={() => downloadPDF(format(parseISO(report.period_start), 'yyyy-MM'))}
                className="p-2 rounded-lg bg-gray-50 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all"
              >
                <Download className="w-5 h-5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
