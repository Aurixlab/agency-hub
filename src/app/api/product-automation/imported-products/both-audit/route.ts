import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  assessCatalogProductForEnrichment,
  type CatalogProductForEnrichment,
} from '@/lib/product-automation/catalog-enrichment';

const TEMPORARY_AUDIT_TOKEN_HASH = 'ceced93a0700101138edbf81555046996198e36bc09f8d9c0f660ffdc119eb39';
const TEMPORARY_AUDIT_EXPIRES_AT = 1787253127000;

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
        skipReason: assessment.status === 'skip' ? assessment.reason : null,
      };
    }),
  });
}
