'use client';

import React, { useState, useEffect } from 'react';
import MetricCards from '@/components/seo/MetricCards';
import TrendChart from '@/components/seo/TrendChart';
import KeywordTable from '@/components/seo/KeywordTable';
import RankingComparison from '@/components/seo/RankingComparison';
import ReportsTab from '@/components/seo/ReportsTab';
import QueriesSection from '@/components/seo/QueriesSection';
import { Calendar, ChevronDown, BarChart3, RefreshCw, FileText, TrendingUp, Key } from 'lucide-react';

const CLIENTS = [
  { name: 'Aurix Lab', slug: 'aurixlab' },
  { name: 'Budget Promotion', slug: 'budget-promotion' },
  { name: 'CPC Clinics', slug: 'cpc-clinics' },
];

const PERIODS = [
  { label: 'Last 7 Days', value: '7' },
  { label: 'Last 30 Days', value: '30' },
  { label: 'Last 90 Days', value: '90' },
];

const TABS = [
  { id: 'performance', label: 'Performance', icon: TrendingUp },
  { id: 'keywords', label: 'Keywords', icon: Key },
  { id: 'reports', label: 'Reports', icon: FileText },
];

export default function SEODashboard() {
  const [activeClient, setActiveClient] = useState(CLIENTS[0]);
  const [period, setPeriod] = useState(PERIODS[1]);
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [periodOpen, setPeriodOpen] = useState(false);

  async function fetchData() {
    setLoading(true);
    try {
      const url = `/api/seo/client/${activeClient.slug}?period=${period.value}`;
      
      const res = await fetch(url);
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error('Failed to fetch SEO data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      // Pass days=30 to backfill history so the chart and 7/30-day views populate immediately
      const res = await fetch('/api/cron/sync-seo?days=30');
      const json = await res.json();
      if (json.success) {
        fetchData();
        // Surface per-client errors as a warning so the user knows if one GSC property failed
        const failed = (json.results || []).filter((r: any) => r.status === 'error');
        if (failed.length > 0) {
          setSyncError(`Partial sync: ${failed.map((r: any) => `${r.client} — ${r.error}`).join('; ')}`);
        }
      } else {
        setSyncError(json.error || 'Sync failed. Check server logs.');
      }
    } catch (error) {
      setSyncError('Network error — could not reach sync endpoint.');
      console.error('Sync failed:', error);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [activeClient, period]);

  return (
    <div className="space-y-6 md:space-y-8 w-full max-w-[1600px] mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-brand-500" />
            SEO Rankings
          </h1>
          <p className="text-surface-500 dark:text-surface-400 text-sm mt-1">Real-time Google Search Console performance tracking.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button 
            onClick={handleSync}
            disabled={syncing}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 hover:bg-surface-50 dark:hover:bg-surface-800 transition-all ${syncing ? 'opacity-50' : ''}`}
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>

          <div className="relative">
            <button 
              onClick={() => setPeriodOpen(!periodOpen)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 text-surface-900 dark:text-surface-100 hover:bg-surface-50 dark:hover:bg-surface-800 transition-all"
            >
              <Calendar className="w-4 h-4 text-surface-400" />
              {period.label}
              <ChevronDown className="w-4 h-4 text-surface-400" />
            </button>
            {periodOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-surface-900 border border-surface-100 dark:border-surface-800 rounded-xl shadow-xl transition-all z-50 overflow-hidden">
                {PERIODS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => {
                      setPeriod(p);
                      setPeriodOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 text-sm hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors ${period.value === p.value ? 'text-brand-600 font-bold bg-brand-50 dark:bg-brand-950/20' : 'text-surface-600 dark:text-surface-400'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {syncError && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-sm text-rose-700 dark:text-rose-400">
          <span className="font-semibold shrink-0">Sync error:</span>
          <span>{syncError}</span>
          <button onClick={() => setSyncError(null)} className="ml-auto shrink-0 text-rose-400 hover:text-rose-600">✕</button>
        </div>
      )}

      {/* Client Tabs & Tab Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 border-b border-surface-100 dark:border-surface-800 pb-2 max-w-full">
        <div className="max-w-full overflow-x-auto">
        <div className="flex w-max items-center gap-1 p-1 bg-surface-100/50 dark:bg-surface-800/50 rounded-2xl">
          {CLIENTS.map((client) => (
            <button
              key={client.slug}
              onClick={() => setActiveClient(client)}
              className={`px-6 py-2 text-sm font-medium rounded-xl transition-all ${
                activeClient.slug === client.slug 
                  ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm' 
                  : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-200/50 dark:hover:bg-surface-700/50'
              }`}
            >
              {client.name}
            </button>
          ))}
        </div>
        </div>

        <div className="max-w-full overflow-x-auto">
        <div className="flex w-max items-center gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 pb-3 px-1 text-sm font-medium transition-all border-b-2 ${
                activeTab === tab.id
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-surface-400 hover:text-surface-600 dark:hover:text-surface-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-32 bg-gray-100 animate-pulse rounded-2xl border border-gray-200" />
          ))}
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {activeTab === 'performance' && (
            <>
              <MetricCards 
                data={data} 
                latestMetrics={data?.snapshots}
              />

              <TrendChart snapshots={data?.snapshots} />

              <div className="space-y-6">
                <QueriesSection slug={activeClient.slug} period={period.value} />
                <RankingComparison slug={activeClient.slug} />
              </div>
            </>
          )}

          {activeTab === 'keywords' && (
            <KeywordTable keywords={data?.keywords} />
          )}


          {activeTab === 'reports' && (
            <ReportsTab slug={activeClient.slug} />
          )}
        </div>
      )}
    </div>
  );
}
