import { NextResponse } from 'next/server';
import { getSessionFromRequestFull } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  APPROVED_CATALOG_ENRICHMENT_KEYS,
  addIndustryCollectionReferences,
  assessCatalogProductForEnrichment,
  buildCatalogEnrichmentDraft,
  type CatalogProductForEnrichment,
} from '@/lib/product-automation/catalog-enrichment';
import {
  resolveShopifyCollectionIds,
  setShopifyProductMetafieldsOnly,
} from '@/lib/product-automation/shopify';

export const maxDuration = 60;

const CONFIRMATION = 'APPLY-173-APPROVED-PRODUCTS';
const EXPECTED_CATALOG_PRODUCTS = 232;
const EXPECTED_ELIGIBLE_PRODUCTS = 173;
const EXPECTED_SKIPPED_PRODUCTS = 59;
const BATCH_SIZE = 5;

type BatchFailure = {
  productId: string;
  title: string;
  error: string;
};

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  const serviceSecret = process.env.CRON_SECRET;
  const serviceAuthorized = Boolean(
    serviceSecret
    && authorization === `Bearer ${serviceSecret}`
  );

  if (!serviceAuthorized) {
    const session = await getSessionFromRequestFull(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only admins can apply the approved catalog enrichment batch' }, { status: 403 });
    }
  }

  try {
    const body = await request.json().catch(() => ({}));
    if (body.confirmation !== CONFIRMATION) {
      return NextResponse.json({ error: 'Approved catalog batch confirmation is required' }, { status: 400 });
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
    const skipped = products.length - eligible.length;

    if (
      products.length !== EXPECTED_CATALOG_PRODUCTS
      || eligible.length !== EXPECTED_ELIGIBLE_PRODUCTS
      || skipped !== EXPECTED_SKIPPED_PRODUCTS
    ) {
      return NextResponse.json({
        error: 'Catalog changed after the approved enrichment audit; no products were written',
        currentTotals: {
          catalogProducts: products.length,
          eligibleProducts: eligible.length,
          skippedProducts: skipped,
        },
        expectedTotals: {
          catalogProducts: EXPECTED_CATALOG_PRODUCTS,
          eligibleProducts: EXPECTED_ELIGIBLE_PRODUCTS,
          skippedProducts: EXPECTED_SKIPPED_PRODUCTS,
        },
      }, { status: 409 });
    }

    if (offset > eligible.length) {
      return NextResponse.json({ error: 'Batch offset is beyond the approved product set' }, { status: 400 });
    }

    const batch = eligible.slice(offset, offset + BATCH_SIZE);
    const drafts = batch.map(product => buildCatalogEnrichmentDraft(product));
    const collectionHandles = Array.from(new Set(drafts.flatMap(draft => draft.industryHandles)));
    const collectionIds = collectionHandles.length
      ? await resolveShopifyCollectionIds(collectionHandles)
      : {};

    const succeeded: Array<{ productId: string; title: string; savedKeys: string[] }> = [];
    const failures: BatchFailure[] = [];

    for (const draft of drafts) {
      try {
        const finalDraft = addIndustryCollectionReferences(draft, collectionIds);
        const unapprovedKeys = finalDraft.metafields
          .map(item => item.key)
          .filter(key => !APPROVED_CATALOG_ENRICHMENT_KEYS.has(key));
        if (unapprovedKeys.length) {
          throw new Error(`Draft contains unapproved metafields: ${unapprovedKeys.join(', ')}`);
        }

        const result = await setShopifyProductMetafieldsOnly(finalDraft.productId, finalDraft.metafields);
        succeeded.push({
          productId: finalDraft.productId,
          title: finalDraft.productTitle,
          savedKeys: result.metafields.map(item => item.key),
        });
      } catch (error) {
        failures.push({
          productId: draft.productId,
          title: draft.productTitle,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const nextOffset = offset + batch.length;
    return NextResponse.json({
      totals: {
        catalogProducts: products.length,
        eligibleProducts: eligible.length,
        skippedProducts: skipped,
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
      done: nextOffset >= eligible.length,
    });
  } catch (error) {
    console.error('Apply catalog enrichment batch error:', error);
    const message = error instanceof Error ? error.message : 'Unable to apply the approved catalog enrichment batch';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
