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
  Sparkles,
  Tag,
} from 'lucide-react';
import { ATC1000_PILOT_PRODUCT_ID } from '@/lib/product-automation/catalog-enrichment';

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

type PilotApplyResponse = {
  message?: string;
  productUrl?: string;
  savedKeys?: string[];
  error?: string;
};

type BatchApplyResponse = {
  totals?: {
    catalogProducts: number;
    eligibleProducts: number;
    skippedProducts: number;
  };
  batch?: {
    offset: number;
    attempted: number;
    succeeded: number;
    failed: number;
  };
  failures?: Array<{ productId: string; title: string; error: string }>;
  nextOffset?: number;
  done?: boolean;
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
  const [pilotApplying, setPilotApplying] = useState(false);
  const [pilotResult, setPilotResult] = useState<{ message: string; productUrl: string; savedCount: number } | null>(null);
  const [batchApplying, setBatchApplying] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ attempted: number; eligible: number } | null>(null);
  const [batchResult, setBatchResult] = useState<{ succeeded: number; failed: number; skipped: number } | null>(null);

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

  const applyAtc1000Pilot = async () => {
    if (selected?.shopifyProductId !== ATC1000_PILOT_PRODUCT_ID) return;
    if (!window.confirm('Apply the approved enrichment metafields to ATC 1000 Short Sleeve (Men) only?')) return;

    setPilotApplying(true);
    setPilotResult(null);
    setError(null);
    try {
      const response = await fetch('/api/product-automation/imported-products/atc1000-pilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'ATC1000-ONLY' }),
      });
      const payload: PilotApplyResponse = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to apply the ATC1000 pilot');
      setPilotResult({
        message: payload.message || 'ATC1000 pilot saved to Shopify',
        productUrl: payload.productUrl || '',
        savedCount: payload.savedKeys?.length || 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to apply the ATC1000 pilot');
    } finally {
      setPilotApplying(false);
    }
  };

  const applyApprovedBatch = async () => {
    if (!window.confirm('Apply the audited enrichment metafields to 173 eligible Shopify products? The 59 approved skips and all existing product content will remain unchanged.')) return;

    setBatchApplying(true);
    setBatchResult(null);
    setBatchProgress({ attempted: 0, eligible: 173 });
    setError(null);

    let offset = 0;
    let succeeded = 0;
    const failures: NonNullable<BatchApplyResponse['failures']> = [];
    let skipped = 59;

    try {
      while (true) {
        const response = await fetch('/api/product-automation/imported-products/enrichment-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            confirmation: 'APPLY-173-APPROVED-PRODUCTS',
            offset,
          }),
        });
        const payload: BatchApplyResponse = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to apply the approved catalog batch');
        if (!payload.batch || typeof payload.nextOffset !== 'number') {
          throw new Error('The catalog batch returned an incomplete response');
        }

        succeeded += payload.batch.succeeded;
        failures.push(...(payload.failures || []));
        skipped = payload.totals?.skippedProducts ?? skipped;
        offset = payload.nextOffset;
        setBatchProgress({ attempted: offset, eligible: payload.totals?.eligibleProducts ?? 173 });

        if (payload.batch.attempted > 0 && payload.batch.succeeded === 0) {
          throw new Error(payload.failures?.[0]?.error || 'Shopify rejected an entire enrichment batch');
        }
        if (payload.done) break;
      }

      setBatchResult({ succeeded, failed: failures.length, skipped });
      if (failures.length) {
        setError(`${failures.length} product${failures.length === 1 ? '' : 's'} could not be enriched. First failure: ${failures[0].title} — ${failures[0].error}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to apply the approved catalog batch');
      setBatchResult({ succeeded, failed: failures.length, skipped });
    } finally {
      setBatchApplying(false);
    }
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

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/70 dark:bg-amber-950/20 sm:flex sm:items-center sm:justify-between sm:gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-800 dark:text-amber-300">Approved catalog enrichment</p>
          <p className="mt-1 text-sm leading-6 text-amber-800 dark:text-amber-200">
            Applies the tested additive metafields to 173 eligible products. The 59 approved skips, existing descriptions, pricing, variants, tags, accordions, and size charts remain unchanged.
          </p>
          {batchProgress && (
            <p className="mt-2 text-xs font-semibold text-amber-900 dark:text-amber-100">
              Processed {batchProgress.attempted} of {batchProgress.eligible} eligible products.
            </p>
          )}
          {batchResult && (
            <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              Saved {batchResult.succeeded}; failed {batchResult.failed}; deliberately skipped {batchResult.skipped}.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={applyApprovedBatch}
          disabled={batchApplying || syncing}
          className="mt-3 inline-flex min-h-11 flex-none items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-bold text-surface-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60 sm:mt-0"
        >
          {batchApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {batchApplying ? 'Applying approved batch…' : 'Apply approved batch'}
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
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
            pilotApplying={pilotApplying}
            pilotResult={pilotResult}
            onApplyPilot={applyAtc1000Pilot}
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
  pilotApplying: boolean;
  pilotResult: { message: string; productUrl: string; savedCount: number } | null;
  onApplyPilot: () => void;
}) {
  const {
    product,
    loading,
    optionNodes,
    variantNodes,
    mediaNodes,
    metafieldNodes,
    tags,
    pilotApplying,
    pilotResult,
    onApplyPilot,
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
        {product.shopifyProductId === ATC1000_PILOT_PRODUCT_ID && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/70 dark:bg-amber-950/20">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-800 dark:text-amber-300">ATC1000 enrichment pilot</p>
            <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-200">
              Applies only the approved new metafields to this product. Existing content, pricing, variants, tags, and size chart remain unchanged.
            </p>
            <button
              type="button"
              onClick={onApplyPilot}
              disabled={pilotApplying}
              className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-3 text-sm font-bold text-surface-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pilotApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {pilotApplying ? 'Applying to Shopify…' : 'Apply ATC1000 pilot to Shopify'}
            </button>
            {pilotResult && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                <p className="font-semibold">{pilotResult.message}</p>
                <p className="mt-1">Saved {pilotResult.savedCount} metafields.</p>
                {pilotResult.productUrl && (
                  <a href={pilotResult.productUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-bold underline">
                    Open product in Shopify
                  </a>
                )}
              </div>
            )}
          </div>
        )}

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
