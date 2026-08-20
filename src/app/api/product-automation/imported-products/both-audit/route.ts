import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  assessCatalogProductForEnrichment,
  buildCatalogEnrichmentDraft,
  supportsBothCatalogDecorations,
  type CatalogProductForEnrichment,
} from '@/lib/product-automation/catalog-enrichment';
import { setShopifyProductMetafieldsOnly } from '@/lib/product-automation/shopify';

const TEMPORARY_AUDIT_TOKEN_HASH = 'ceced93a0700101138edbf81555046996198e36bc09f8d9c0f660ffdc119eb39';
const TEMPORARY_AUDIT_EXPIRES_AT = 1787257200000;
const CONFIRMATION = 'APPLY-WORKBOOK-BOTH-DECORATION-CORRECTION';
const EXPECTED_CATALOG_PRODUCTS = 232;
const EXPECTED_ELIGIBLE_PRODUCTS = 173;
const EXPECTED_BOTH_PRODUCTS = 71;
const BATCH_SIZE = 5;
const CORRECTION_KEYS = new Set([
  'quick_spec_tagline',
  'available_decoration_methods',
  'decoration_guide',
  'product_faqs',
  'enrichment_version',
  'last_enriched_at',
]);

function safeMatch(received: string, expected: string) {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isAuthorized(request: Request) {
  if (Date.now() >= TEMPORARY_AUDIT_EXPIRES_AT) return false;
  const token = request.headers.get('x-product-audit-token') || '';
  if (!token) return false;
  return safeMatch(createHash('sha256').update(token).digest('hex'), TEMPORARY_AUDIT_TOKEN_HASH);
}

function metafieldValue(snapshot: unknown, namespace: string, key: string) {
  if (!snapshot || typeof snapshot !== 'object') return '';
  const metafields = (snapshot as { metafields?: { nodes?: unknown[] } }).metafields?.nodes;
  if (!Array.isArray(metafields)) return '';
  const match = metafields.find(item => {
    if (!item || typeof item !== 'object') return false;
    const field = item as { namespace?: unknown; key?: unknown };
    return field.namespace === namespace && field.key === key;
  });
  const value = (match as { value?: unknown } | undefined)?.value;
  return typeof value === 'string' ? value : '';
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const products = await prisma.importedShopifyProduct.findMany({
    orderBy: [{ title: 'asc' }, { shopifyProductId: 'asc' }],
    select: {
      shopifyProductId: true,
      title: true,
      handle: true,
      vendor: true,
      tags: true,
      snapshot: true,
    },
  }) as CatalogProductForEnrichment[];

  return NextResponse.json({
    total: products.length,
    products: products.map(product => {
      const assessment = assessCatalogProductForEnrichment(product);
      return {
        shopifyProductId: product.shopifyProductId,
        title: product.title,
        handle: product.handle,
        vendor: product.vendor,
        tags: product.tags,
        style: metafieldValue(product.snapshot, 'custom', 'product_style_number'),
        availableDecorationMethods: metafieldValue(product.snapshot, 'custom', 'available_decoration_methods'),
        pricingDecorationMethod: metafieldValue(product.snapshot, 'custom', 'pricing_decoration_method'),
        eligibility: assessment.status,
        pricingDecision: assessment.status === 'eligible' ? assessment.decoration : null,
        supportsBoth: assessment.status === 'eligible' && supportsBothCatalogDecorations(product),
        skipReason: assessment.status === 'skip' ? assessment.reason : null,
      };
    }),
  });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (body.confirmation !== CONFIRMATION) {
    return NextResponse.json({ error: 'Correction confirmation is required' }, { status: 400 });
  }
  const offset = Number(body.offset ?? 0);
  if (!Number.isInteger(offset) || offset < 0) {
    return NextResponse.json({ error: 'Batch offset must be a non-negative integer' }, { status: 400 });
  }

  const products = await prisma.importedShopifyProduct.findMany({
    orderBy: [{ title: 'asc' }, { shopifyProductId: 'asc' }],
    select: {
      shopifyProductId: true,
      title: true,
      handle: true,
      vendor: true,
      tags: true,
      snapshot: true,
    },
  }) as CatalogProductForEnrichment[];
  const eligible = products.filter(product =>
    assessCatalogProductForEnrichment(product).status === 'eligible'
  );
  const affected = eligible.filter(supportsBothCatalogDecorations);

  if (
    products.length !== EXPECTED_CATALOG_PRODUCTS
    || eligible.length !== EXPECTED_ELIGIBLE_PRODUCTS
    || affected.length !== EXPECTED_BOTH_PRODUCTS
  ) {
    return NextResponse.json({
      error: 'Catalog changed after the workbook correction audit; no products were written',
      currentTotals: {
        catalogProducts: products.length,
        eligibleProducts: eligible.length,
        bothProducts: affected.length,
      },
      expectedTotals: {
        catalogProducts: EXPECTED_CATALOG_PRODUCTS,
        eligibleProducts: EXPECTED_ELIGIBLE_PRODUCTS,
        bothProducts: EXPECTED_BOTH_PRODUCTS,
      },
    }, { status: 409 });
  }

  if (offset > affected.length) {
    return NextResponse.json({ error: 'Batch offset is beyond the audited correction set' }, { status: 400 });
  }

  const batch = affected.slice(offset, offset + BATCH_SIZE);
  const succeeded: Array<{
    productId: string;
    title: string;
    pricingMethod: string;
    savedKeys: string[];
  }> = [];
  const failures: Array<{ productId: string; title: string; error: string }> = [];

  for (const product of batch) {
    try {
      const draft = buildCatalogEnrichmentDraft(product);
      const correctionMetafields = draft.metafields.filter(item => CORRECTION_KEYS.has(item.key));
      const available = correctionMetafields.find(item => item.key === 'available_decoration_methods');
      if (available?.value !== JSON.stringify(['Print', 'Embroidery'])) {
        throw new Error('Workbook Both override was not present in the generated draft');
      }
      const result = await setShopifyProductMetafieldsOnly(product.shopifyProductId, correctionMetafields);
      const saved = new Map(result.metafields.map(item => [item.key, item.value]));
      if (saved.get('available_decoration_methods') !== JSON.stringify(['Print', 'Embroidery'])) {
        throw new Error('Shopify did not return the expected Both decoration availability');
      }
      if (saved.get('enrichment_version') !== '2') {
        throw new Error('Shopify did not return enrichment version 2');
      }
      succeeded.push({
        productId: product.shopifyProductId,
        title: product.title,
        pricingMethod: draft.decoration === 'print' ? 'Print' : 'Embroidery',
        savedKeys: result.metafields.map(item => item.key),
      });
    } catch (error) {
      failures.push({
        productId: product.shopifyProductId,
        title: product.title,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const nextOffset = offset + batch.length;
  return NextResponse.json({
    totals: {
      catalogProducts: products.length,
      eligibleProducts: eligible.length,
      bothProducts: affected.length,
    },
    batch: {
      offset,
      attempted: batch.length,
      succeeded: succeeded.length,
      failed: failures.length,
    },
    succeeded,
    failures,
    nextOffset,
    done: nextOffset >= affected.length,
  });
}
