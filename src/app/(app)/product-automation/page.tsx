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
  DecorationMethod,
  PricingTable,
  ScrapedProductData,
  ShopifyPayload,
} from '@/lib/product-automation/types';
import { INDUSTRY_OPTIONS, PRODUCT_CONTENT_CATEGORIES } from '@/lib/product-automation/content-config';
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
  product_category: 'other',
  quick_spec_tagline: '',
  quick_spec_overview: '',
  specifications: [],
  industry_handles: [],
  who_its_great_for: [],
  available_decoration_methods: [],
  decoration_guide: '',
  product_faqs: [],
  overview_linked_copy: '',
  audience_linked_copy: '',
  customization_linked_copy: '',
  collection_linked_copy: '',
};

const initialForm = {
  product_link: '',
  base_price: '',
  decoration_type: 'print' as 'print' | 'embroidery',
  colors: 'Black, White, Navy',
  images_ready: false,
  supports_both: false,
  industry_handles: [] as string[],
};

const listToText = (items: string[]) => items.join('\n');
const textToList = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean);
const pairListToText = (items: Array<Record<string, string>>, first: string, second: string) =>
  items.map(item => `${item[first] || ''} | ${item[second] || ''}`).join('\n');
const textToPairs = (value: string, first: string, second: string) =>
  value.split('\n').map(line => {
    const separator = line.indexOf('|');
    return separator < 0
      ? { [first]: line.trim(), [second]: '' }
      : { [first]: line.slice(0, separator).trim(), [second]: line.slice(separator + 1).trim() };
  }).filter(item => item[first] && item[second]);
const normalizedAiCopy = (copy: AiProductCopy | null | undefined): AiProductCopy => ({
  ...emptyAi,
  ...(copy || {}),
  key_features: copy?.key_features || [],
  best_use: copy?.best_use || [],
  material_care: copy?.material_care || [],
  customization_fit: copy?.customization_fit || [],
  specifications: copy?.specifications || [],
  industry_handles: copy?.industry_handles || [],
  who_its_great_for: copy?.who_its_great_for || [],
  available_decoration_methods: copy?.available_decoration_methods || [],
  product_faqs: copy?.product_faqs || [],
});
const drafted = (run: ProductAutomationRun) => run.status === 'created' && Boolean(run.shopifyProductUrl);
const money = (value: string | number) => `$${Number(value || 0).toFixed(2)}`;
const hasAiCopyContent = (copy: AiProductCopy | null | undefined) =>
  Boolean(copy?.seo_description?.trim())
  || Boolean(copy?.key_features?.length)
  || Boolean(copy?.best_use?.length)
  || Boolean(copy?.material_care?.length)
  || Boolean(copy?.customization_fit?.length)
  || Boolean(copy?.quick_spec_overview?.trim());

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
    const nextAiCopy = normalizedAiCopy(nextRun.aiCopy);
    setAiCopy(nextAiCopy);
    setForm({
      product_link: nextRun.productLink,
      base_price: String(nextRun.basePrice),
      decoration_type: nextRun.decorationType,
      colors: Array.isArray(nextRun.colors) ? nextRun.colors.join(', ') : '',
      images_ready: nextRun.imagesReady,
      supports_both: nextAiCopy.available_decoration_methods.includes('Print')
        && nextAiCopy.available_decoration_methods.includes('Embroidery'),
      industry_handles: nextAiCopy.industry_handles,
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
              <label className="flex items-start gap-2 rounded-lg border border-surface-200 p-3 text-sm dark:border-surface-800">
                <input
                  type="checkbox"
                  checked={form.supports_both}
                  onChange={e => setForm({ ...form, supports_both: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-surface-300"
                />
                <span>
                  <span className="block font-medium text-surface-700 dark:text-surface-300">Supports both decoration methods</span>
                  <span className="mt-0.5 block text-xs text-surface-500">The selected method above remains the pricing ladder.</span>
                </span>
              </label>
              <label className="block">
                <span className="label">Colors</span>
                <input
                  className="input"
                  value={form.colors}
                  onChange={e => setForm({ ...form, colors: e.target.value })}
                  placeholder="Black, White, Navy"
                />
              </label>
              <fieldset>
                <legend className="label">Industry collections <span className="font-normal text-surface-400">(optional)</span></legend>
                <p className="mb-2 text-xs text-surface-500">Choose known industries, or leave blank and let Gemini suggest them for review.</p>
                <div className="grid grid-cols-2 gap-2">
                  {INDUSTRY_OPTIONS.map(option => {
                    const checked = form.industry_handles.includes(option.handle);
                    return (
                      <label key={option.handle} className="flex items-center gap-2 rounded-md border border-surface-200 px-2.5 py-2 text-xs dark:border-surface-800">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setForm({
                            ...form,
                            industry_handles: checked
                              ? form.industry_handles.filter(handle => handle !== option.handle)
                              : [...form.industry_handles, option.handle],
                          })}
                          className="h-4 w-4 rounded border-surface-300"
                        />
                        {option.name}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
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
                {loading === 'generate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate all content
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
  type CopyListField = 'key_features' | 'best_use' | 'material_care' | 'customization_fit';
  const setList = (field: CopyListField, value: string) =>
    setAiCopy({ ...aiCopy, [field]: textToList(value) });
  const setMethod = (method: DecorationMethod) => {
    const selected = aiCopy.available_decoration_methods.includes(method);
    setAiCopy({
      ...aiCopy,
      available_decoration_methods: selected
        ? aiCopy.available_decoration_methods.filter(item => item !== method)
        : [...aiCopy.available_decoration_methods, method],
    });
  };
  const setIndustry = (handle: string) => {
    const selected = aiCopy.industry_handles.includes(handle);
    const option = INDUSTRY_OPTIONS.find(item => item.handle === handle);
    const industryHandles = selected
      ? aiCopy.industry_handles.filter(item => item !== handle)
      : [...aiCopy.industry_handles, handle];
    const contexts = selected
      ? aiCopy.who_its_great_for.filter(context => context.industry !== option?.name)
      : option && !aiCopy.who_its_great_for.some(context => context.industry === option.name)
        ? [...aiCopy.who_its_great_for, {
          industry: option.name,
          context: `A practical branded product for ${option.name.toLowerCase()} teams, programs, and group orders.`,
        }]
        : aiCopy.who_its_great_for;
    setAiCopy({ ...aiCopy, industry_handles: industryHandles, who_its_great_for: contexts });
  };

  return (
    <div className="card p-5">
      <h2 className="text-lg font-semibold text-surface-900 dark:text-white">AI Copy</h2>
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="label">Product category</span>
          <select
            className="select"
            value={aiCopy.product_category}
            onChange={e => setAiCopy({ ...aiCopy, product_category: e.target.value as AiProductCopy['product_category'] })}
          >
            {PRODUCT_CONTENT_CATEGORIES.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>
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
        <div className="border-t border-surface-200 pt-4 dark:border-surface-800">
          <p className="text-sm font-semibold text-surface-900 dark:text-white">Enriched product details</p>
          <p className="mt-1 text-xs text-surface-500">These fields power the content section after the quote form.</p>
        </div>
        <label className="block">
          <span className="label">Quick-spec tagline</span>
          <textarea className="input min-h-20 resize-y" value={aiCopy.quick_spec_tagline} onChange={e => setAiCopy({ ...aiCopy, quick_spec_tagline: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">Overview</span>
          <textarea className="input min-h-32 resize-y" value={aiCopy.quick_spec_overview} onChange={e => setAiCopy({ ...aiCopy, quick_spec_overview: e.target.value })} />
        </label>
        <ListField
          label="Specifications (Label | Value)"
          value={pairListToText(aiCopy.specifications as unknown as Array<Record<string, string>>, 'label', 'value')}
          onChange={value => setAiCopy({ ...aiCopy, specifications: textToPairs(value, 'label', 'value') as unknown as AiProductCopy['specifications'] })}
        />
        <fieldset>
          <legend className="label">Industry collections</legend>
          <div className="grid grid-cols-2 gap-2">
            {INDUSTRY_OPTIONS.map(option => (
              <label key={option.handle} className="flex items-center gap-2 text-xs text-surface-700 dark:text-surface-300">
                <input type="checkbox" checked={aiCopy.industry_handles.includes(option.handle)} onChange={() => setIndustry(option.handle)} className="h-4 w-4 rounded border-surface-300" />
                {option.name}
              </label>
            ))}
          </div>
        </fieldset>
        <ListField
          label="Who it’s great for (Industry | Context)"
          value={pairListToText(aiCopy.who_its_great_for as unknown as Array<Record<string, string>>, 'industry', 'context')}
          onChange={value => setAiCopy({ ...aiCopy, who_its_great_for: textToPairs(value, 'industry', 'context') as unknown as AiProductCopy['who_its_great_for'] })}
        />
        <fieldset>
          <legend className="label">Available decoration methods</legend>
          <div className="flex gap-4">
            {(['Print', 'Embroidery'] as DecorationMethod[]).map(method => (
              <label key={method} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={aiCopy.available_decoration_methods.includes(method)} onChange={() => setMethod(method)} className="h-4 w-4 rounded border-surface-300" />
                {method}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="label">Decoration guide</span>
          <textarea className="input min-h-28 resize-y" value={aiCopy.decoration_guide} onChange={e => setAiCopy({ ...aiCopy, decoration_guide: e.target.value })} />
        </label>
        <ListField
          label="Product FAQs (Question | Answer)"
          value={pairListToText(aiCopy.product_faqs as unknown as Array<Record<string, string>>, 'question', 'answer')}
          onChange={value => setAiCopy({ ...aiCopy, product_faqs: textToPairs(value, 'question', 'answer') as unknown as AiProductCopy['product_faqs'] })}
        />
        {aiCopy.product_category === 't-shirt' && (
          <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-900 dark:bg-brand-950/20">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">T-shirt internal-link copy</p>
            <ListField label="Overview linked copy" value={aiCopy.overview_linked_copy} onChange={value => setAiCopy({ ...aiCopy, overview_linked_copy: value })} />
            <ListField label="Audience linked copy" value={aiCopy.audience_linked_copy} onChange={value => setAiCopy({ ...aiCopy, audience_linked_copy: value })} />
            <ListField label="Customization linked copy" value={aiCopy.customization_linked_copy} onChange={value => setAiCopy({ ...aiCopy, customization_linked_copy: value })} />
            <ListField label="Collection linked copy" value={aiCopy.collection_linked_copy} onChange={value => setAiCopy({ ...aiCopy, collection_linked_copy: value })} />
          </div>
        )}
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
          <div className="rounded-lg border border-surface-200 p-4 dark:border-surface-800 lg:col-span-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Metafield coverage</h3>
              <span className="text-xs text-surface-500">{payload?.metafields?.length || 0} generated fields + reusable icons</span>
            </div>
            {payload?.metafields?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {payload.metafields.map(field => (
                  <span key={`${field.namespace}.${field.key}`} className="rounded-md bg-surface-100 px-2 py-1 font-mono text-[11px] text-surface-600 dark:bg-surface-800 dark:text-surface-300">
                    {field.key}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-surface-400">Generate and preview the product to audit every Shopify field before publishing.</p>
            )}
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
