'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  PackageSearch,
  RefreshCw,
  Send,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import type {
  AiProductCopy,
  PricingTable,
  ScrapedProductData,
  ShopifyPayload,
} from '@/lib/product-automation/types';

interface ProductAutomationRun {
  id: string;
  productLink: string;
  basePrice: string | number;
  decorationType: 'print' | 'embroidery';
  colors: string[];
  imagesReady: boolean;
  scrapedData: ScrapedProductData | null;
  aiCopy: AiProductCopy | null;
  pricing: PricingTable | null;
  variants: ShopifyPayload['variants'] | null;
  shopifyPayload: ShopifyPayload | null;
  status: string;
  shopifyProductUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  creator?: { name: string; username: string };
}

const emptyScraped: ScrapedProductData = {
  title: '',
  brand: '',
  sku: '',
  fabric: '',
  weight: '',
  raw_description: '',
  confidence: {
    title: 'missing',
    brand: 'missing',
    sku: 'missing',
    fabric: 'missing',
    weight: 'missing',
    raw_description: 'missing',
  },
};

const emptyAi: AiProductCopy = {
  key_features: [],
  best_use: [],
  material_care: [],
  customization_fit: [],
  seo_description: '',
};

const listToText = (items: string[]) => items.join('\n');
const textToList = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean);

export default function ProductAutomationPage() {
  const [form, setForm] = useState({
    product_link: '',
    base_price: '',
    decoration_type: 'print' as 'print' | 'embroidery',
    colors: 'Black, White, Navy',
    images_ready: false,
  });
  const [runs, setRuns] = useState<ProductAutomationRun[]>([]);
  const [run, setRun] = useState<ProductAutomationRun | null>(null);
  const [scraped, setScraped] = useState<ScrapedProductData>(emptyScraped);
  const [aiCopy, setAiCopy] = useState<AiProductCopy>(emptyAi);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const colors = useMemo(
    () => form.colors.split(',').map(color => color.trim()).filter(Boolean),
    [form.colors]
  );

  const fetchRuns = async () => {
    const res = await fetch('/api/product-automation/runs');
    if (!res.ok) return;
    const payload = await res.json();
    setRuns(payload.runs || []);
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const syncRun = (nextRun: ProductAutomationRun) => {
    setRun(nextRun);
    setScraped(nextRun.scrapedData || emptyScraped);
    setAiCopy(nextRun.aiCopy || emptyAi);
    setForm(prev => ({
      ...prev,
      product_link: nextRun.productLink,
      base_price: String(nextRun.basePrice),
      decoration_type: nextRun.decorationType,
      colors: Array.isArray(nextRun.colors) ? nextRun.colors.join(', ') : prev.colors,
      images_ready: nextRun.imagesReady,
    }));
  };

  const callStep = async (label: string, request: () => Promise<Response>) => {
    setLoading(label);
    setError(null);
    try {
      const res = await request();
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `Request failed (${res.status})`);
      if (payload.run) syncRun(payload.run);
      await fetchRuns();
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      return null;
    } finally {
      setLoading(null);
    }
  };

  const createRun = async () => {
    await callStep('create', () => fetch('/api/product-automation/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        base_price: Number(form.base_price),
        colors,
      }),
    }));
  };

  const scrape = async () => {
    if (!run) return;
    await callStep('scrape', () => fetch(`/api/product-automation/runs/${run.id}/scrape`, { method: 'POST' }));
  };

  const generate = async () => {
    if (!run) return;
    await callStep('generate', () => fetch(`/api/product-automation/runs/${run.id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scrapedData: scraped }),
    }));
  };

  const preview = async () => {
    if (!run) return;
    await callStep('preview', () => fetch(`/api/product-automation/runs/${run.id}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scrapedData: scraped, aiCopy, colors }),
    }));
  };

  const createShopifyDraft = async () => {
    if (!run) return;
    await callStep('shopify', () => fetch(`/api/product-automation/runs/${run.id}/create-shopify-draft`, { method: 'POST' }));
  };

  const actionDisabled = Boolean(loading);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <ShoppingBag className="w-6 h-6 text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Product Automation</h1>
            <p className="text-sm text-surface-500 dark:text-surface-400">
              Create Shopify draft apparel products from supplier pages, pricing inputs, and reviewed AI copy.
            </p>
          </div>
        </div>
        <button onClick={fetchRuns} className="btn-secondary">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Product automation stopped</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(280px,380px)_1fr]">
        <section className="space-y-4">
          <div className="card p-5">
            <h2 className="text-lg font-semibold text-surface-900 dark:text-white">New run</h2>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="label">Supplier product link</span>
                <input
                  className="input"
                  value={form.product_link}
                  onChange={e => setForm({ ...form, product_link: e.target.value })}
                  placeholder="https://supplier.com/product"
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Base price</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.base_price}
                    onChange={e => setForm({ ...form, base_price: e.target.value })}
                    placeholder="12.50"
                  />
                </label>
                <label className="block">
                  <span className="label">Decoration</span>
                  <select
                    className="select"
                    value={form.decoration_type}
                    onChange={e => setForm({ ...form, decoration_type: e.target.value as 'print' | 'embroidery' })}
                  >
                    <option value="print">Print</option>
                    <option value="embroidery">Embroidery</option>
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="label">Colors</span>
                <input
                  className="input"
                  value={form.colors}
                  onChange={e => setForm({ ...form, colors: e.target.value })}
                  placeholder="Black, White, Navy"
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-surface-700 dark:text-surface-300">
                <input
                  type="checkbox"
                  checked={form.images_ready}
                  onChange={e => setForm({ ...form, images_ready: e.target.checked })}
                  className="h-4 w-4 rounded border-surface-300"
                />
                Images are ready for manual upload
              </label>
              <button onClick={createRun} disabled={actionDisabled} className="btn-primary w-full">
                {loading === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageSearch className="h-4 w-4" />}
                Create Run
              </button>
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Recent runs</h2>
              <span className="text-xs text-surface-400">{runs.length}</span>
            </div>
            <div className="max-h-[34rem] space-y-2 overflow-y-auto">
              {runs.length === 0 ? (
                <p className="rounded-lg border border-dashed border-surface-200 p-4 text-sm text-surface-500 dark:border-surface-800">No product runs yet.</p>
              ) : runs.map(item => (
                <button
                  key={item.id}
                  onClick={() => syncRun(item)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    run?.id === item.id
                      ? 'border-brand-300 bg-brand-50 dark:border-brand-900 dark:bg-brand-950/30'
                      : 'border-surface-200 hover:bg-surface-50 dark:border-surface-800 dark:hover:bg-surface-800/60'
                  }`}
                >
                  <p className="truncate text-sm font-semibold text-surface-900 dark:text-white">{item.scrapedData?.title || item.productLink}</p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs text-surface-500">
                    <span className="capitalize">{item.status}</span>
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="card p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Workflow</h2>
                <p className="text-sm text-surface-500">Current status: <span className="font-semibold capitalize">{run?.status || 'No run selected'}</span></p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={scrape} disabled={!run || actionDisabled} className="btn-secondary">
                  {loading === 'scrape' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageSearch className="h-4 w-4" />} Scrape
                </button>
                <button onClick={generate} disabled={!run || actionDisabled} className="btn-secondary">
                  {loading === 'generate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate
                </button>
                <button onClick={preview} disabled={!run || actionDisabled} className="btn-secondary">
                  {loading === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Preview
                </button>
                <button onClick={createShopifyDraft} disabled={!run || actionDisabled} className="btn-primary">
                  {loading === 'shopify' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Create Draft
                </button>
              </div>
            </div>
            {run?.shopifyProductUrl && (
              <a href={run.shopifyProductUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                <ExternalLink className="h-4 w-4" /> Open Shopify draft
              </a>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <EditableScrapedData scraped={scraped} setScraped={setScraped} />
            <EditableAiCopy aiCopy={aiCopy} setAiCopy={setAiCopy} />
          </div>

          <PreviewPanel run={run} />
        </section>
      </div>
    </div>
  );
}

function EditableScrapedData({ scraped, setScraped }: {
  scraped: ScrapedProductData;
  setScraped: (value: ScrapedProductData) => void;
}) {
  const setField = (field: keyof Omit<ScrapedProductData, 'confidence'>, value: string) =>
    setScraped({ ...scraped, [field]: value });

  return (
    <div className="card p-5">
      <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Scraped product data</h2>
      <div className="mt-4 space-y-3">
        {(['title', 'brand', 'sku', 'fabric', 'weight'] as const).map(field => (
          <label key={field} className="block">
            <span className="label capitalize">{field.replace('_', ' ')}</span>
            <input className="input" value={scraped[field]} onChange={e => setField(field, e.target.value)} />
          </label>
        ))}
        <label className="block">
          <span className="label">Raw description</span>
          <textarea
            className="input min-h-32 resize-y"
            value={scraped.raw_description}
            onChange={e => setField('raw_description', e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

function EditableAiCopy({ aiCopy, setAiCopy }: {
  aiCopy: AiProductCopy;
  setAiCopy: (value: AiProductCopy) => void;
}) {
  const setList = (field: keyof Omit<AiProductCopy, 'seo_description'>, value: string) =>
    setAiCopy({ ...aiCopy, [field]: textToList(value) });

  return (
    <div className="card p-5">
      <h2 className="text-lg font-semibold text-surface-900 dark:text-white">AI product copy</h2>
      <div className="mt-4 space-y-3">
        <ListField label="Key features" value={listToText(aiCopy.key_features)} onChange={value => setList('key_features', value)} />
        <ListField label="Best use" value={listToText(aiCopy.best_use)} onChange={value => setList('best_use', value)} />
        <ListField label="Material care" value={listToText(aiCopy.material_care)} onChange={value => setList('material_care', value)} />
        <ListField label="Customization fit" value={listToText(aiCopy.customization_fit)} onChange={value => setList('customization_fit', value)} />
        <label className="block">
          <span className="label">SEO description</span>
          <textarea
            className="input min-h-24 resize-y"
            value={aiCopy.seo_description}
            onChange={e => setAiCopy({ ...aiCopy, seo_description: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}

function ListField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <textarea className="input min-h-24 resize-y" value={value} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

function PreviewPanel({ run }: { run: ProductAutomationRun | null }) {
  const pricing = run?.pricing;
  const variants = run?.variants || [];
  const payload = run?.shopifyPayload;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Preview</h2>
        {variants.length > 0 && <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">{variants.length} variants</span>}
      </div>
      {!run ? (
        <p className="mt-4 rounded-lg border border-dashed border-surface-200 p-6 text-center text-sm text-surface-500 dark:border-surface-800">Create or select a run to preview Shopify data.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-surface-200 p-4 dark:border-surface-800">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Pricing</h3>
            <div className="mt-3 space-y-2">
              {pricing?.tiers?.length ? pricing.tiers.map(tier => (
                <div key={tier.range} className="flex items-center justify-between text-sm">
                  <span className="text-surface-500">{tier.range}</span>
                  <span className="font-semibold text-surface-900 dark:text-white">${tier.price.toFixed(2)}</span>
                </div>
              )) : <p className="text-sm text-surface-400">Preview has not been generated.</p>}
            </div>
          </div>
          <div className="rounded-lg border border-surface-200 p-4 dark:border-surface-800">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Shopify product</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="Title" value={payload?.title || '-'} />
              <Row label="Vendor" value={payload?.vendor || '-'} />
              <Row label="Status" value={payload?.status || '-'} />
              <Row label="Template" value={payload?.templateSuffix || '-'} />
            </dl>
          </div>
          <div className="rounded-lg border border-surface-200 p-4 dark:border-surface-800">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">First variants</h3>
            <div className="mt-3 space-y-2 text-sm">
              {variants.slice(0, 5).map(variant => (
                <div key={variant.sku} className="flex items-center justify-between gap-3">
                  <span className="truncate text-surface-500">{variant.title}</span>
                  <span className="font-mono text-xs text-surface-400">{variant.sku}</span>
                </div>
              ))}
              {variants.length === 0 && <p className="text-sm text-surface-400">No variants yet.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-surface-500">{label}</dt>
      <dd className="truncate font-semibold text-surface-900 dark:text-white">{value}</dd>
    </div>
  );
}
