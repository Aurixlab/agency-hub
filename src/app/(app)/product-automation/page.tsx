'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Database,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  PackageSearch,
  Plus,
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
import { ImportedProductsSection } from '@/components/product-automation/ImportedProductsSection';

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

const initialForm = {
  product_link: '',
  base_price: '',
  decoration_type: 'print' as 'print' | 'embroidery',
  colors: 'Black, White, Navy',
  images_ready: false,
};

const listToText = (items: string[]) => items.join('\n');
const textToList = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean);
const drafted = (run: ProductAutomationRun) => run.status === 'created' && Boolean(run.shopifyProductUrl);
const money = (value: string | number) => `$${Number(value || 0).toFixed(2)}`;
const hasAiCopyContent = (copy: AiProductCopy | null | undefined) =>
  Boolean(copy?.seo_description?.trim())
  || Boolean(copy?.key_features?.length)
  || Boolean(copy?.best_use?.length)
  || Boolean(copy?.material_care?.length)
  || Boolean(copy?.customization_fit?.length);

export default function ProductAutomationPage() {
  const [mode, setMode] = useState<'table' | 'workspace' | 'imports'>('table');
  const [form, setForm] = useState(initialForm);
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

  const syncRun = (nextRun: ProductAutomationRun, openWorkspace = true) => {
    setRun(nextRun);
    setScraped(nextRun.scrapedData || emptyScraped);
    setAiCopy(nextRun.aiCopy || emptyAi);
    setForm({
      product_link: nextRun.productLink,
      base_price: String(nextRun.basePrice),
      decoration_type: nextRun.decorationType,
      colors: Array.isArray(nextRun.colors) ? nextRun.colors.join(', ') : '',
      images_ready: nextRun.imagesReady,
    });
    if (openWorkspace) setMode('workspace');
  };

  const startNewProduct = () => {
    setRun(null);
    setScraped(emptyScraped);
    setAiCopy(emptyAi);
    setForm(initialForm);
    setError(null);
    setMode('workspace');
  };

  const backToProducts = async () => {
    setMode('table');
    setError(null);
    await fetchRuns();
  };

  const callStep = async (label: string, request: () => Promise<Response>) => {
    setLoading(label);
    setError(null);
    try {
      const res = await request();
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `Request failed (${res.status})`);
      if (payload.run) syncRun(payload.run, false);
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
          {mode === 'workspace'
            ? <ShoppingBag className="w-6 h-6 text-brand-600" />
            : mode === 'imports'
              ? <Database className="w-6 h-6 text-brand-600" />
              : <FileSpreadsheet className="w-6 h-6 text-brand-600" />}
          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">
              {mode === 'workspace' ? 'Create Product' : mode === 'imports' ? 'Imported Products' : 'Product Automation'}
            </h1>
            <p className="text-sm text-surface-500 dark:text-surface-400">
              {mode === 'workspace'
                ? 'Build and review a Shopify draft product.'
                : mode === 'imports'
                  ? 'Compact Shopify catalog snapshots, ready for bulk enrichment.'
                  : 'Spreadsheet view of generated Shopify product drafts.'}
            </p>
          </div>
        </div>
        {mode === 'workspace' ? (
          <button onClick={backToProducts} className="btn-secondary">
            <ArrowLeft className="w-4 h-4" /> Go Back
          </button>
        ) : mode === 'imports' ? (
          <button onClick={() => setMode('table')} className="btn-secondary">
            <ArrowLeft className="w-4 h-4" /> Product drafts
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setMode('imports')} className="btn-secondary">
              <Database className="w-4 h-4" /> Imported Products
            </button>
            <button onClick={fetchRuns} className="btn-secondary">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button onClick={startNewProduct} className="btn-primary">
              <Plus className="w-4 h-4" /> Create Product
            </button>
          </div>
        )}
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

      {mode === 'table' ? (
        <ProductsSpreadsheet runs={runs} onOpen={syncRun} onCreate={startNewProduct} />
      ) : mode === 'imports' ? (
        <ImportedProductsSection />
      ) : (
        <ProductWorkspace
          form={form}
          setForm={setForm}
          run={run}
          scraped={scraped}
          setScraped={setScraped}
          aiCopy={aiCopy}
          setAiCopy={setAiCopy}
          colors={colors}
          loading={loading}
          actionDisabled={actionDisabled}
          createRun={createRun}
          scrape={scrape}
          generate={generate}
          preview={preview}
          createShopifyDraft={createShopifyDraft}
        />
      )}
    </div>
  );
}

function ProductsSpreadsheet({ runs, onOpen, onCreate }: {
  runs: ProductAutomationRun[];
  onOpen: (run: ProductAutomationRun) => void;
  onCreate: () => void;
}) {
  const createdCount = runs.filter(drafted).length;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-surface-200 bg-surface-50 px-4 py-3 dark:border-surface-800 dark:bg-surface-900/80 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-surface-900 dark:text-white">All Products</h2>
            <p className="text-xs text-surface-500">{runs.length} rows · {createdCount} drafted</p>
          </div>
        </div>
        <button onClick={onCreate} className="btn-primary">
          <Plus className="h-4 w-4" /> Create Product
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1120px] w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface-100 text-left text-xs font-bold uppercase tracking-wide text-surface-500 dark:bg-surface-800 dark:text-surface-400">
              <Th className="w-16 text-center">Draft</Th>
              <Th>Product</Th>
              <Th>Brand</Th>
              <Th>SKU</Th>
              <Th>Decoration</Th>
              <Th>Base</Th>
              <Th>Colors</Th>
              <Th>Variants</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th className="w-32 text-right">Action</Th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={11} className="border-t border-surface-200 px-4 py-12 text-center dark:border-surface-800">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                    <FileSpreadsheet className="h-8 w-8 text-surface-300" />
                    <p className="font-semibold text-surface-700 dark:text-surface-200">No product rows yet</p>
                    <button onClick={onCreate} className="btn-primary">
                      <Plus className="h-4 w-4" /> Create Product
                    </button>
                  </div>
                </td>
              </tr>
            ) : runs.map((item, index) => (
              <tr
                key={item.id}
                className="group bg-white transition-colors hover:bg-brand-50/40 dark:bg-surface-900 dark:hover:bg-brand-950/20"
              >
                <Td className="text-center">
                  {drafted(item) ? (
                    <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" title="Drafted">
                      <Check className="h-4 w-4" />
                    </span>
                  ) : (
                    <span className="mx-auto block h-6 w-6 rounded-full border border-surface-300 dark:border-surface-700" title="Not drafted" />
                  )}
                </Td>
                <Td>
                  <button onClick={() => onOpen(item)} className="max-w-[19rem] truncate text-left font-semibold text-surface-900 hover:text-brand-700 dark:text-white dark:hover:text-brand-300">
                    {item.scrapedData?.title || `Untitled product ${index + 1}`}
                  </button>
                  <p className="max-w-[19rem] truncate text-xs text-surface-400">{item.productLink}</p>
                </Td>
                <Td>{item.scrapedData?.brand || '-'}</Td>
                <Td><span className="font-mono text-xs">{item.scrapedData?.sku || '-'}</span></Td>
                <Td><span className="capitalize">{item.decorationType}</span></Td>
                <Td>{money(item.basePrice)}</Td>
                <Td>{Array.isArray(item.colors) ? item.colors.join(', ') : '-'}</Td>
                <Td>{item.variants?.length || 0}</Td>
                <Td><StatusPill status={item.status} /></Td>
                <Td>{new Date(item.createdAt).toLocaleDateString()}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    {item.shopifyProductUrl && (
                      <a href={item.shopifyProductUrl} target="_blank" rel="noopener noreferrer" className="rounded-md p-1.5 text-surface-400 hover:bg-surface-100 hover:text-brand-600 dark:hover:bg-surface-800" title="Open Shopify draft">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    <button onClick={() => onOpen(item)} className="btn-secondary btn-sm">Open</button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProductWorkspace(props: {
  form: typeof initialForm;
  setForm: (value: typeof initialForm) => void;
  run: ProductAutomationRun | null;
  scraped: ScrapedProductData;
  setScraped: (value: ScrapedProductData) => void;
  aiCopy: AiProductCopy;
  setAiCopy: (value: AiProductCopy) => void;
  colors: string[];
  loading: string | null;
  actionDisabled: boolean;
  createRun: () => void;
  scrape: () => void;
  generate: () => void;
  preview: () => void;
  createShopifyDraft: () => void;
}) {
  const {
    form,
    setForm,
    run,
    scraped,
    setScraped,
    aiCopy,
    setAiCopy,
    loading,
    actionDisabled,
    createRun,
    scrape,
    generate,
    preview,
    createShopifyDraft,
  } = props;

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="grid grid-cols-1 divide-y divide-surface-200 dark:divide-surface-800 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          <StepCell active={!run} done={Boolean(run)} label="Input" value={run ? 'Run created' : 'Ready'} />
          <StepCell active={run?.status === 'draft'} done={Boolean(run?.scrapedData)} label="Scrape" value={run?.scrapedData ? 'Data loaded' : 'Waiting'} />
          <StepCell active={run?.status === 'scraped'} done={hasAiCopyContent(run?.aiCopy)} label="Copy" value={hasAiCopyContent(run?.aiCopy) ? 'Generated' : 'Waiting'} />
          <StepCell active={run?.status === 'previewed'} done={run ? drafted(run) : false} label="Draft" value={run ? run.status : 'Waiting'} />
        </div>
      </div>

      {run?.shopifyProductUrl && (
        <a href={run.shopifyProductUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          <Check className="h-4 w-4" /> Shopify draft created <ExternalLink className="h-4 w-4" />
        </a>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(280px,360px)_1fr]">
        <section className="space-y-4">
          <div className="card p-5">
            <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Product Input</h2>
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
                {run ? 'Save New Run' : 'Create Run'}
              </button>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Actions</h2>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <button onClick={scrape} disabled={!run || actionDisabled} className="btn-secondary justify-start">
                {loading === 'scrape' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageSearch className="h-4 w-4" />} Scrape supplier
              </button>
              <button onClick={generate} disabled={!run || actionDisabled} className="btn-secondary justify-start">
                {loading === 'generate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate copy
              </button>
              <button onClick={preview} disabled={!run || actionDisabled} className="btn-secondary justify-start">
                {loading === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Preview payload
              </button>
              <button onClick={createShopifyDraft} disabled={!run || actionDisabled} className="btn-primary justify-start">
                {loading === 'shopify' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Create Shopify Draft
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-4">
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
      <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Scraped Data</h2>
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
      <h2 className="text-lg font-semibold text-surface-900 dark:text-white">AI Copy</h2>
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
        <p className="mt-4 rounded-lg border border-dashed border-surface-200 p-6 text-center text-sm text-surface-500 dark:border-surface-800">Create a run to preview Shopify data.</p>
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
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Shopify Product</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="Title" value={payload?.title || '-'} />
              <Row label="Vendor" value={payload?.vendor || '-'} />
              <Row label="Status" value={payload?.status || '-'} />
              <Row label="Template" value={payload?.templateSuffix || '-'} />
            </dl>
          </div>
          <div className="rounded-lg border border-surface-200 p-4 dark:border-surface-800">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">First Variants</h3>
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

function StatusPill({ status }: { status: string }) {
  const classes = status === 'created'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
    : status === 'failed'
      ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
      : 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300';

  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold capitalize ${classes}`}>{status}</span>;
}

function StepCell({ active, done, label, value }: { active: boolean; done: boolean; label: string; value: string }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${active ? 'bg-brand-50 dark:bg-brand-950/20' : ''}`}>
      <span className={`flex h-7 w-7 items-center justify-center rounded-full border ${
        done ? 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
          : 'border-surface-300 text-surface-400 dark:border-surface-700'
      }`}>
        {done ? <Check className="h-4 w-4" /> : null}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-surface-900 dark:text-white">{label}</p>
        <p className="truncate text-xs capitalize text-surface-500">{value}</p>
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

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`border border-surface-200 px-3 py-2 dark:border-surface-700 ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`border border-surface-200 px-3 py-2 align-middle text-surface-700 dark:border-surface-800 dark:text-surface-300 ${className}`}>{children}</td>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-surface-500">{label}</dt>
      <dd className="truncate font-semibold text-surface-900 dark:text-white">{value}</dd>
    </div>
  );
}
