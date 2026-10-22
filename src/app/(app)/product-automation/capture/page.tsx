'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Loader2, PackageSearch, Send } from 'lucide-react';
import {
  CAPTURE_MESSAGE,
  CAPTURE_RECEIVED_MESSAGE,
  type CaptureMessage,
} from '@/lib/product-automation/capture-bookmarklet';
import type { ScrapedProductData } from '@/lib/product-automation/types';

interface CaptureRun {
  id: string;
  productLink: string;
  status: string;
  scrapedData: ScrapedProductData | null;
  createdAt: string;
}

const siteHost = (value: string) => {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

const pagePath = (value: string) => {
  try {
    const url = new URL(value);
    return `${siteHost(value)}${url.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch {
    return '';
  }
};

export default function ProductCapturePage() {
  const [capture, setCapture] = useState<CaptureMessage | null>(null);
  const [runs, setRuns] = useState<CaptureRun[] | null>(null);
  const [runId, setRunId] = useState('');
  const [attaching, setAttaching] = useState(false);
  const [attached, setAttached] = useState<{ runId: string; data: ScrapedProductData } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as Partial<CaptureMessage> | null;
      if (!data || data.type !== CAPTURE_MESSAGE || typeof data.url !== 'string' || typeof data.html !== 'string') return;
      // A page may only send itself: the claimed URL must belong to the window that posted it.
      try {
        if (new URL(data.url).origin !== event.origin) return;
      } catch {
        return;
      }
      (event.source as Window | null)?.postMessage({ type: CAPTURE_RECEIVED_MESSAGE }, event.origin);
      setCapture(current => current || { type: CAPTURE_MESSAGE, url: data.url!, title: String(data.title || ''), html: data.html! });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    fetch('/api/product-automation/runs')
      .then(res => (res.ok ? res.json() : { runs: [] }))
      .then(payload => setRuns(payload.runs || []))
      .catch(() => setRuns([]));
  }, []);

  const matchingRuns = useMemo(() => {
    if (!capture || !runs) return [];
    const host = siteHost(capture.url);
    const path = pagePath(capture.url);
    const sameSite = runs.filter(run => siteHost(run.productLink) === host);
    // Runs for this exact product page first, then other runs on the same supplier site.
    return [
      ...sameSite.filter(run => pagePath(run.productLink) === path),
      ...sameSite.filter(run => pagePath(run.productLink) !== path),
    ];
  }, [capture, runs]);

  useEffect(() => {
    if (matchingRuns.length && !matchingRuns.some(run => run.id === runId)) setRunId(matchingRuns[0].id);
  }, [matchingRuns, runId]);

  const attach = async () => {
    if (!capture || !runId) return;
    setAttaching(true);
    setError(null);
    try {
      const res = await fetch(`/api/product-automation/runs/${runId}/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: capture.url, html: capture.html }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || `Request failed (${res.status})`);
      setAttached({ runId, data: payload.scrapedData });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setAttaching(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Send className="h-6 w-6 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Send to Aurix</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400">Attach a supplier page captured in your browser to a product run.</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">This page could not be attached</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      <section className="card p-5">
        {!capture ? (
          <div className="flex items-start gap-3 text-sm text-surface-600 dark:text-surface-300">
            <Loader2 className="mt-0.5 h-5 w-5 flex-shrink-0 animate-spin text-brand-600" />
            <div className="space-y-2">
              <p className="font-semibold text-surface-900 dark:text-white">Waiting for a supplier page</p>
              <p>Open a product page on the supplier site and click the Send to Aurix bookmark. This tab fills in automatically.</p>
              <p className="text-xs text-surface-500">
                If the supplier tab says the page source was copied, open the run in{' '}
                <Link href="/product-automation" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">Product Automation</Link>{' '}
                and use Paste page source.
              </p>
            </div>
          </div>
        ) : attached ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
              <div>
                <p className="font-semibold text-surface-900 dark:text-white">Scraped data saved to the run</p>
                <p className="text-sm text-surface-500">Review the fields in the run, then continue with Generate all content.</p>
              </div>
            </div>
            <dl className="space-y-2 rounded-lg border border-surface-200 p-4 text-sm dark:border-surface-800">
              {(['title', 'brand', 'sku', 'fabric', 'weight'] as const).map(field => (
                <div key={field} className="flex items-start justify-between gap-3">
                  <dt className="capitalize text-surface-500">{field}</dt>
                  <dd className="text-right font-semibold text-surface-900 dark:text-white">{attached.data[field] || '-'}</dd>
                </div>
              ))}
            </dl>
            <Link href={`/product-automation?run=${attached.runId}`} className="btn-primary">
              <PackageSearch className="h-4 w-4" /> Open run
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="label">Captured page</p>
              <p className="font-semibold text-surface-900 dark:text-white">{capture.title || 'Untitled page'}</p>
              <p className="break-all text-xs text-surface-500">{capture.url}</p>
            </div>
            {runs === null ? (
              <p className="flex items-center gap-2 text-sm text-surface-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading runs…</p>
            ) : matchingRuns.length === 0 ? (
              <p className="rounded-lg border border-dashed border-surface-200 p-4 text-sm text-surface-600 dark:border-surface-800 dark:text-surface-300">
                No recent run uses a link on {new URL(capture.url).hostname}. Create a run with this product link in{' '}
                <Link href="/product-automation" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">Product Automation</Link>,
                then click Send to Aurix again.
              </p>
            ) : (
              <>
                <label className="block">
                  <span className="label">Attach to run</span>
                  <select className="select" value={runId} onChange={e => setRunId(e.target.value)}>
                    {matchingRuns.map(run => (
                      <option key={run.id} value={run.id}>
                        {run.scrapedData?.title || run.productLink} · {run.status} · {new Date(run.createdAt).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-surface-500">This replaces the run’s Scraped Data with what was read from this page.</p>
                <button onClick={attach} disabled={attaching || !runId} className="btn-primary">
                  {attaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Attach
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
