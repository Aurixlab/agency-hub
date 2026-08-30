'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Archive,
  Boxes,
  CheckCircle2,
  CloudDownload,
  Database,
  FileImage,
  HardDrive,
  Loader2,
  PackageSearch,
  RefreshCw,
  Search,
  Shapes,
  ShieldCheck,
  Tag,
} from 'lucide-react';

type EnrichmentMetafield = {
  namespace: string;
  key: string;
  type: string;
  value: string;
};

type EnrichmentPreview = {
  status: 'eligible' | 'skip' | 'error';
  reason?: string;
  decoration?: string;
  industryHandles: string[];
  metafields: EnrichmentMetafield[];
};

type ImportedProductSummary = {
  id: string;
  legacyResourceId: string | null;
  handle: string | null;
  title: string;
  vendor: string | null;
  productType: string | null;
  shopifyStatus: string | null;
  templateSuffix: string | null;
  tags: string[];
  featuredImageUrl: string | null;
  variantCount: number;
  imageCount: number;
  metafieldCount: number;
  snapshotBytes: number;
  shopifyUpdatedAt: string | null;
  lastSyncedAt: string;
};

type ImportedProductDetail = ImportedProductSummary & {
  shopifyProductId: string;
  descriptionHtml: string;
  seoTitle: string | null;
  seoDescription: string | null;
  sourceHash: string;
  snapshot: Record<string, unknown>;
  syncedBy: { id: string; name: string; username: string } | null;
  enrichmentPreview: EnrichmentPreview;
};

type CatalogStats = {
  totalProducts: number;
  storageBytes: number;
  lastSyncedAt: string | null;
};

type ShopifySyncResponse = {
  synced?: number;
  hasNextPage?: boolean;
  nextCursor?: string | null;
  error?: string;
};

const emptyStats: CatalogStats = {
  totalProducts: 0,
  storageBytes: 0,
  lastSyncedAt: null,
};

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  const display = value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1);
  return display + ' ' + units[index];
};

const dateText = (value: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Not synced yet';

const plainText = (value: string) =>
  value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const nodesFrom = (snapshot: Record<string, unknown>, key: string) => {
  const value = snapshot[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const nodes = (value as { nodes?: unknown }).nodes;
  return Array.isArray(nodes) ? nodes : [];
};

export function ImportedProductsSection() {
  const [products, setProducts] = useState<ImportedProductSummary[]>([]);
  const [stats, setStats] = useState<CatalogStats>(emptyStats);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ pages: number; products: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ImportedProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadProducts = useCallback(async (query = '') => {
    setLoading(true);
    try {
      const response = await fetch('/api/product-automation/imported-products?search=' + encodeURIComponent(query));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to load imported products');
      setProducts(payload.products || []);
      setStats(payload.stats || emptyStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load imported products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const openProduct = async (product: ImportedProductSummary) => {
    setDetailLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/product-automation/imported-products/' + product.id);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to load the product snapshot');
      setSelected(payload.product);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the product snapshot');
    } finally {
      setDetailLoading(false);
    }
  };

  const importCatalog = async () => {
    setSyncing(true);
    setError(null);
    setSyncProgress({ pages: 0, products: 0 });

    try {
      let cursor: string | null = null;
      let pages = 0;
      let imported = 0;

      do {
        const response: Response = await fetch('/api/product-automation/imported-products/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursor }),
        });
        const payload: ShopifySyncResponse = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'Shopify catalog sync failed');

        pages += 1;
        imported += Number(payload.synced || 0);
        setSyncProgress({ pages, products: imported });

        if (!payload.hasNextPage) break;
        if (!payload.nextCursor) throw new Error('Shopify did not return the next catalog cursor');
        cursor = payload.nextCursor;
      } while (cursor);

      await loadProducts(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Shopify catalog sync failed');
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    loadProducts(search);
  };

  const tags = Array.isArray(selected?.tags) ? selected.tags : [];
  const optionNodes = selected && Array.isArray(selected.snapshot.options) ? selected.snapshot.options : [];
  const variantNodes = selected ? nodesFrom(selected.snapshot, 'variants') : [];
  const mediaNodes = selected ? nodesFrom(selected.snapshot, 'media') : [];
  const metafieldNodes = selected ? nodesFrom(selected.snapshot, 'metafields') : [];

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <div className="relative overflow-hidden border-b border-surface-200 bg-surface-950 px-5 py-6 text-white dark:border-surface-800 sm:px-7">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-2/5 opacity-30 [background:radial-gradient(circle_at_center,_#d5a332_0,_transparent_65%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
                <Database className="h-4 w-4" /> Shopify catalog cache
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Imported Products</h2>
              <p className="mt-2 text-sm leading-6 text-surface-300">
                Full product records are kept as compact Shopify snapshots. Images remain in Shopify and are stored only as URLs and metadata here.
              </p>
            </div>
            <button
              onClick={importCatalog}
              disabled={syncing}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-bold text-surface-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
              {syncing ? 'Syncing Shopify…' : 'Sync catalog from Shopify'}
            </button>
          </div>
          {syncProgress && (
            <div className="relative mt-5 flex items-center gap-3 border-t border-white/10 pt-4 text-sm text-amber-100">
              <Loader2 className="h-4 w-4 animate-spin" />
              Imported {syncProgress.products} products across {syncProgress.pages} Shopify page{syncProgress.pages === 1 ? '' : 's'}.
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-surface-200 dark:divide-surface-800 lg:grid-cols-4 lg:divide-y-0">
          <Metric icon={Boxes} label="Products" value={String(stats.totalProducts)} />
          <Metric icon={HardDrive} label="Catalog storage" value={formatBytes(stats.storageBytes)} />
          <Metric icon={Archive} label="Stored as" value="JSON snapshots" />
          <Metric icon={CheckCircle2} label="Last catalog sync" value={dateText(stats.lastSyncedAt)} />
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/70 dark:bg-emerald-950/20 sm:flex sm:items-center sm:justify-between sm:gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-800 dark:text-emerald-300">Content review mode</p>
          <p className="mt-1 text-sm leading-6 text-emerald-800 dark:text-emerald-200">
            Select any product to review the proposed new content format. Shopify writing is locked: nothing on the storefront or in Shopify Admin will change during this review.
          </p>
        </div>
        <div className="mt-3 inline-flex min-h-11 flex-none items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-white px-4 text-sm font-bold text-emerald-800 dark:border-emerald-800 dark:bg-surface-900 dark:text-emerald-300 sm:mt-0">
          <ShieldCheck className="h-4 w-4" /> Shopify push locked
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_34rem]">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-surface-200 bg-white dark:border-surface-800 dark:bg-surface-900">
          <div className="flex flex-col gap-3 border-b border-surface-200 px-4 py-4 dark:border-surface-800 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <form onSubmit={submitSearch} className="relative min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                className="input h-10 w-full pl-9"
                placeholder="Search title, handle, vendor, or ID"
                aria-label="Search imported products"
              />
            </form>
            <button onClick={() => loadProducts(search)} className="btn-secondary h-10 px-3" disabled={loading}>
              <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} /> Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface-50 text-[11px] font-bold uppercase tracking-[0.08em] text-surface-500 dark:bg-surface-950/50 dark:text-surface-400">
                <tr>
                  <th className="px-5 py-3">Product</th>
                  <th className="px-4 py-3">Catalog data</th>
                  <th className="px-4 py-3">Shopify status</th>
                  <th className="px-4 py-3 text-right">Snapshot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
                {loading ? (
                  <tr><td colSpan={4} className="px-5 py-14 text-center text-surface-500"><Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />Loading catalog…</td></tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-14 text-center">
                      <PackageSearch className="mx-auto mb-3 h-7 w-7 text-surface-300" />
                      <p className="font-semibold text-surface-700 dark:text-surface-300">No products imported yet</p>
                      <p className="mt-1 text-sm text-surface-500">Use the Shopify sync to create a compact, reviewable catalog cache.</p>
                    </td>
                  </tr>
                ) : products.map(product => (
                  <tr
                    key={product.id}
                    onClick={() => openProduct(product)}
                    className={'cursor-pointer transition-colors hover:bg-amber-50/60 dark:hover:bg-amber-950/10 ' + (selected?.id === product.id ? 'bg-amber-50 dark:bg-amber-950/20' : '')}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex min-w-[15rem] items-center gap-3">
                        <div className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-lg border border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-800">
                          {product.featuredImageUrl
                            ? <img src={product.featuredImageUrl} alt="" className="h-full w-full object-cover" />
                            : <PackageSearch className="h-4 w-4 text-surface-400" />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-surface-900 dark:text-white">{product.title}</p>
                          <p className="mt-0.5 truncate text-xs text-surface-500">{product.handle ? '/' + product.handle : product.legacyResourceId || 'No handle'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex min-w-[11rem] flex-wrap gap-1.5 text-xs text-surface-600 dark:text-surface-300">
                        <DataChip label={String(product.variantCount) + ' variants'} />
                        <DataChip label={String(product.imageCount) + ' media'} />
                        <DataChip label={String(product.metafieldCount) + ' metafields'} />
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex rounded-full bg-surface-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-surface-600 dark:bg-surface-800 dark:text-surface-300">
                        {product.shopifyStatus || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <p className="font-mono text-xs text-surface-600 dark:text-surface-300">{formatBytes(product.snapshotBytes)}</p>
                      <p className="mt-0.5 text-[11px] text-surface-400">{dateText(product.lastSyncedAt)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="min-w-0">
          <ProductSnapshotPanel
            product={selected}
            loading={detailLoading}
            optionNodes={optionNodes}
            variantNodes={variantNodes}
            mediaNodes={mediaNodes}
            metafieldNodes={metafieldNodes}
            tags={tags}
          />
        </aside>
      </div>
    </section>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Boxes; label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-4 sm:px-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-surface-500">
        <Icon className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" /> {label}
      </div>
      <p className="mt-2 truncate text-sm font-bold text-surface-900 dark:text-white" title={value}>{value}</p>
    </div>
  );
}

function DataChip({ label }: { label: string }) {
  return <span className="rounded-md bg-surface-100 px-2 py-1 dark:bg-surface-800">{label}</span>;
}

function ProductSnapshotPanel(props: {
  product: ImportedProductDetail | null;
  loading: boolean;
  optionNodes: unknown[];
  variantNodes: unknown[];
  mediaNodes: unknown[];
  metafieldNodes: unknown[];
  tags: string[];
}) {
  const {
    product,
    loading,
    optionNodes,
    variantNodes,
    mediaNodes,
    metafieldNodes,
    tags,
  } = props;

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-2xl border border-surface-200 bg-white text-sm text-surface-500 dark:border-surface-800 dark:bg-surface-900">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading snapshot…
      </div>
    );
  }

  if (!product) {
    return (
      <div className="rounded-2xl border border-dashed border-surface-300 bg-surface-50 p-6 text-center dark:border-surface-700 dark:bg-surface-900/60">
        <Database className="mx-auto mb-3 h-6 w-6 text-surface-400" />
        <h3 className="font-semibold text-surface-800 dark:text-surface-200">Inspect an imported product</h3>
        <p className="mt-2 text-sm leading-6 text-surface-500">Select a row to confirm the full Shopify record is available before any automation writes are enabled.</p>
      </div>
    );
  }

  const description = plainText(product.descriptionHtml);

  return (
    <div className="overflow-hidden rounded-2xl border border-surface-200 bg-white dark:border-surface-800 dark:bg-surface-900">
      <div className="border-b border-surface-200 px-5 py-4 dark:border-surface-800">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-lg bg-surface-100 dark:bg-surface-800">
            {product.featuredImageUrl
              ? <img src={product.featuredImageUrl} alt="" className="h-full w-full object-cover" />
              : <Shapes className="h-4 w-4 text-surface-400" />}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-surface-900 dark:text-white">{product.title}</p>
            <p className="mt-0.5 truncate font-mono text-xs text-surface-500">{product.shopifyProductId}</p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <ProposedContentReview preview={product.enrichmentPreview} />

        <SnapshotCounts
          variants={product.variantCount}
          media={product.imageCount}
          metafields={product.metafieldCount}
          storage={formatBytes(product.snapshotBytes)}
        />

        <SnapshotBlock label="Description" icon={Archive}>
          <p className="line-clamp-5 text-sm leading-6 text-surface-600 dark:text-surface-300">{description || 'No description saved in Shopify.'}</p>
        </SnapshotBlock>

        <SnapshotBlock label="SEO" icon={Search}>
          <p className="text-sm font-semibold text-surface-800 dark:text-surface-200">{product.seoTitle || 'No SEO title'}</p>
          <p className="mt-1 text-sm leading-5 text-surface-500">{product.seoDescription || 'No SEO description'}</p>
        </SnapshotBlock>

        <SnapshotBlock label="Catalog structure" icon={Boxes}>
          <div className="space-y-2 text-sm text-surface-600 dark:text-surface-300">
            <p><span className="text-surface-400">Options:</span> {optionNodes.length || 'None'}</p>
            <p><span className="text-surface-400">Variants stored:</span> {variantNodes.length}</p>
            <p><span className="text-surface-400">Media references:</span> {mediaNodes.length}</p>
            <p><span className="text-surface-400">Metafields stored:</span> {metafieldNodes.length}</p>
          </div>
        </SnapshotBlock>

        <SnapshotBlock label="Tags" icon={Tag}>
          {tags.length ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.slice(0, 12).map(tag => <DataChip key={tag} label={tag} />)}
              {tags.length > 12 && <DataChip label={'+' + String(tags.length - 12) + ' more'} />}
            </div>
          ) : <p className="text-sm text-surface-500">No tags stored.</p>}
        </SnapshotBlock>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs leading-5 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300">
          Image binaries are not copied. This snapshot contains product data and media references only, keeping catalog storage low.
        </div>
      </div>
    </div>
  );
}

function ProposedContentReview({ preview }: { preview: EnrichmentPreview }) {
  if (preview.status !== 'eligible') {
    const reason = preview.reason?.replace(/_/g, ' ') || 'Preview unavailable';
    return (
      <section className="rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-950/40">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-surface-600 dark:text-surface-300">
          <ShieldCheck className="h-4 w-4" /> No Shopify changes
        </div>
        <p className="mt-2 text-sm leading-6 text-surface-600 dark:text-surface-300">
          This product is {preview.status === 'skip' ? 'deliberately excluded from enrichment' : 'not ready for preview'}: {reason}.
        </p>
      </section>
    );
  }

  const field = (key: string) => preview.metafields.find(item => item.key === key)?.value || '';
  const jsonArray = <T,>(key: string): T[] => {
    const value = field(key);
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as T[] : [];
    } catch {
      return [];
    }
  };
  const features = jsonArray<string>('accordion1_texts');
  const specs = jsonArray<{ label?: string; value?: string }>('specifications');
  const audiences = jsonArray<{ industry?: string; context?: string }>('who_its_great_for');
  const faqs = jsonArray<{ question?: string; answer?: string }>('product_faqs');
  const methods = jsonArray<string>('available_decoration_methods');

  return (
    <section className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/70 dark:bg-emerald-950/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-emerald-800 dark:text-emerald-300">
            <ShieldCheck className="h-4 w-4" /> Proposed content — review only
          </p>
          <p className="mt-1 text-xs leading-5 text-emerald-700 dark:text-emerald-200">
            Generated inside Mission Control. Nothing below has been sent to Shopify.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(methods.length ? methods : [preview.decoration || '']).filter(Boolean).map(method => (
            <span key={method} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-800 shadow-sm dark:bg-surface-900 dark:text-emerald-300">
              {method}
            </span>
          ))}
        </div>
      </div>

      <ReviewText label="Tagline" value={field('quick_spec_tagline')} />
      <ReviewText label="Overview (50–70 words)" value={field('quick_spec_overview')} />

      <ReviewList label={`Product features (${features.length})`} items={features} />

      <ReviewGroup label={`Specifications (${specs.length} rows)`}>
        <dl className="divide-y divide-surface-200 overflow-hidden rounded-lg border border-surface-200 bg-white text-xs dark:divide-surface-800 dark:border-surface-800 dark:bg-surface-900">
          {specs.map((item, index) => (
            <div key={`${item.label || 'spec'}-${index}`} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 px-3 py-2.5">
              <dt className="font-semibold text-surface-500">{item.label || 'Specification'}</dt>
              <dd className="text-surface-800 dark:text-surface-200">{item.value || '—'}</dd>
            </div>
          ))}
        </dl>
      </ReviewGroup>

      <ReviewGroup label="Who it’s great for">
        <div className="space-y-2">
          {audiences.map((item, index) => (
            <div key={`${item.industry || 'industry'}-${index}`} className="rounded-lg border border-surface-200 bg-white px-3 py-2.5 text-xs dark:border-surface-800 dark:bg-surface-900">
              <p className="font-bold text-surface-900 dark:text-white">{item.industry || 'Industry'}</p>
              <p className="mt-1 leading-5 text-surface-600 dark:text-surface-300">{item.context || '—'}</p>
            </div>
          ))}
        </div>
      </ReviewGroup>

      <ReviewText label="Decoration guide" value={field('decoration_guide')} />

      <ReviewGroup label={`Product FAQs (${faqs.length})`}>
        <div className="space-y-2">
          {faqs.map((item, index) => (
            <div key={`${item.question || 'faq'}-${index}`} className="rounded-lg border border-surface-200 bg-white px-3 py-2.5 text-xs dark:border-surface-800 dark:bg-surface-900">
              <p className="font-bold leading-5 text-surface-900 dark:text-white">{item.question || 'Question'}</p>
              <p className="mt-1 leading-5 text-surface-600 dark:text-surface-300">{item.answer || '—'}</p>
            </div>
          ))}
        </div>
      </ReviewGroup>

      <ReviewGroup label="Supplier source">
        <div className="space-y-1 text-xs leading-5 text-surface-600 dark:text-surface-300">
          <p><span className="font-semibold text-surface-800 dark:text-surface-200">Supplier:</span> {field('supplier_name') || 'Not available'}</p>
          <p className="break-all"><span className="font-semibold text-surface-800 dark:text-surface-200">URL:</span> {field('supplier_product_url') || 'Not available'}</p>
        </div>
      </ReviewGroup>
    </section>
  );
}

function ReviewGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-surface-500">{label}</h4>
      {children}
    </div>
  );
}

function ReviewText({ label, value }: { label: string; value: string }) {
  return (
    <ReviewGroup label={label}>
      <p className="rounded-lg border border-surface-200 bg-white px-3 py-2.5 text-sm leading-6 text-surface-700 dark:border-surface-800 dark:bg-surface-900 dark:text-surface-200">
        {value || 'No proposed value.'}
      </p>
    </ReviewGroup>
  );
}

function ReviewList({ label, items }: { label: string; items: string[] }) {
  return (
    <ReviewGroup label={label}>
      {items.length ? (
        <ul className="space-y-2 rounded-lg border border-surface-200 bg-white px-3 py-3 text-xs leading-5 text-surface-700 dark:border-surface-800 dark:bg-surface-900 dark:text-surface-200">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-brand-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-surface-500">No verified feature bullets are available.</p>}
    </ReviewGroup>
  );
}

function SnapshotCounts({ variants, media, metafields, storage }: { variants: number; media: number; metafields: number; storage: string }) {
  const values = [
    { icon: Boxes, label: 'Variants', value: variants },
    { icon: FileImage, label: 'Media', value: media },
    { icon: Tag, label: 'Fields', value: metafields },
  ];

  return (
    <div className="grid grid-cols-4 divide-x divide-surface-200 overflow-hidden rounded-lg border border-surface-200 dark:divide-surface-800 dark:border-surface-800">
      {values.map(({ icon: Icon, label, value }) => (
        <div key={label} className="min-w-0 px-2 py-2.5 text-center">
          <Icon className="mx-auto h-3.5 w-3.5 text-surface-400" />
          <p className="mt-1 text-sm font-bold text-surface-900 dark:text-white">{value}</p>
          <p className="text-[10px] uppercase tracking-wide text-surface-400">{label}</p>
        </div>
      ))}
      <div className="min-w-0 px-2 py-2.5 text-center">
        <HardDrive className="mx-auto h-3.5 w-3.5 text-surface-400" />
        <p className="mt-1 truncate text-sm font-bold text-surface-900 dark:text-white" title={storage}>{storage}</p>
        <p className="text-[10px] uppercase tracking-wide text-surface-400">Storage</p>
      </div>
    </div>
  );
}

function SnapshotBlock({ icon: Icon, label, children }: { icon: typeof Archive; label: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-surface-500">
        <Icon className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" /> {label}
      </h4>
      {children}
    </section>
  );
}
