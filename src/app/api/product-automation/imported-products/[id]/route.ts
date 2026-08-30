import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  assessCatalogProductForEnrichment,
  buildCatalogEnrichmentDraft,
} from '@/lib/product-automation/catalog-enrichment';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const product = await prisma.importedShopifyProduct.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      shopifyProductId: true,
      legacyResourceId: true,
      title: true,
      handle: true,
      vendor: true,
      productType: true,
      shopifyStatus: true,
      templateSuffix: true,
      tags: true,
      descriptionHtml: true,
      seoTitle: true,
      seoDescription: true,
      featuredImageUrl: true,
      variantCount: true,
      imageCount: true,
      metafieldCount: true,
      snapshot: true,
      snapshotBytes: true,
      sourceHash: true,
      shopifyUpdatedAt: true,
      lastSyncedAt: true,
      syncedBy: { select: { id: true, name: true, username: true } },
    },
  });

  if (!product) return NextResponse.json({ error: 'Imported product not found' }, { status: 404 });

  const assessment = assessCatalogProductForEnrichment(product);
  let enrichmentPreview:
    | {
      status: 'eligible';
      decoration: string;
      industryHandles: string[];
      metafields: ReturnType<typeof buildCatalogEnrichmentDraft>['metafields'];
    }
    | {
      status: 'skip';
      reason: string;
      industryHandles: string[];
      metafields: [];
    }
    | {
      status: 'error';
      reason: string;
      industryHandles: string[];
      metafields: [];
    };

  if (assessment.status === 'skip') {
    enrichmentPreview = {
      status: 'skip',
      reason: assessment.reason,
      industryHandles: assessment.industryHandles,
      metafields: [],
    };
  } else {
    try {
      const draft = buildCatalogEnrichmentDraft(product);
      enrichmentPreview = {
        status: 'eligible',
        decoration: draft.decoration,
        industryHandles: draft.industryHandles,
        metafields: draft.metafields,
      };
    } catch (error) {
      enrichmentPreview = {
        status: 'error',
        reason: error instanceof Error ? error.message : 'Unable to generate a content preview',
        industryHandles: assessment.industryHandles,
        metafields: [],
      };
    }
  }

  return NextResponse.json({ product: { ...product, enrichmentPreview } });
}
