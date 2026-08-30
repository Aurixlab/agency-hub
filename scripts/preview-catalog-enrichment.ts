import type { PrismaClient } from '@prisma/client';
import {
  assessCatalogProductForEnrichment,
  buildCatalogEnrichmentDraft,
  supportsBothCatalogDecorations,
  type CatalogProductForEnrichment,
  type CatalogEnrichmentSkipReason,
} from '../src/lib/product-automation/catalog-enrichment';
import { fetchShopifyEnrichmentCatalog } from '../src/lib/product-automation/shopify-catalog';

const APPROVED_KEYS = new Set([
  'accordion1_texts',
  'quick_spec_tagline',
  'quick_spec_overview',
  'specifications',
  'who_its_great_for',
  'industries',
  'supplier_name',
  'supplier_product_url',
  'pricing_decoration_method',
  'available_decoration_methods',
  'decoration_guide',
  'product_faqs',
  'enrichment_version',
  'last_enriched_at',
]);

type CountMap = Record<string, number>;
let previewPrisma: PrismaClient | null = null;

function increment(counts: CountMap, key: string) {
  counts[key] = (counts[key] || 0) + 1;
}

async function main() {
  const includeDetails = process.argv.includes('--details');
  const useLiveShopify = process.argv.includes('--shopify-live');
  // Prefer the direct connection for local audits; the transaction pooler can
  // be temporarily unavailable even while the database itself is healthy.
  if (process.env.DIRECT_URL) {
    const directUrl = new URL(process.env.DIRECT_URL);
    directUrl.searchParams.set('connect_timeout', '10');
    process.env.DATABASE_URL = directUrl.toString();
  }
  const { prisma } = await import('../src/lib/prisma');
  previewPrisma = prisma;
  let catalogSource = useLiveShopify ? 'shopify_live' : 'database';
  let products: CatalogProductForEnrichment[];
  if (useLiveShopify) {
    products = await fetchShopifyEnrichmentCatalog();
  } else try {
    products = await prisma.importedShopifyProduct.findMany({
      orderBy: { title: 'asc' },
      select: {
        shopifyProductId: true,
        title: true,
        handle: true,
        vendor: true,
        tags: true,
        snapshot: true,
      },
    });
  } catch (error) {
    console.warn('Catalog database unavailable; using read-only live Shopify fallback.');
    catalogSource = 'shopify_live';
    products = await fetchShopifyEnrichmentCatalog();
  }

  const decoration: CountMap = {};
  const eligibleByVendor: CountMap = {};
  const eligibleByIndustry: CountMap = {};
  const skipReasons: CountMap = {};
  const skippedProducts: Record<CatalogEnrichmentSkipReason, string[]> = {
    deferred_missing_industry_review: [],
    country_or_world_cup: [],
    package_or_utility: [],
    no_bulk_ranges: [],
    unsupported_bulk_ranges: [],
    no_recognized_industry: [],
  };
  const eligibleProducts: Array<{
    title: string;
    handle: string;
    decoration: string;
    industries: string[];
    supplierUrl: string | null;
  }> = [];
  const errors: Array<{ title: string; message: string }> = [];
  const overviewOutsideTarget: Array<{ title: string; words: number }> = [];
  const specificationsUnderFive: Array<{ title: string; specifications: number }> = [];
  const featureCountIssues: Array<{ title: string; features: number }> = [];
  const faqCountIssues: Array<{ title: string; faqs: number }> = [];
  const overviewSentenceIssues: Array<{ title: string; sentences: number }> = [];
  const specificationLabelIssues: Array<{ title: string; labels: string[] }> = [];
  const emptyContentIssues: Array<{ title: string; field: string }> = [];
  const decorationMethodIssues: Array<{ title: string; expected: string[]; actual: string[] }> = [];
  const categoryContradictionIssues: Array<{ title: string; text: string }> = [];
  const missingSupplierUrlTitles: string[] = [];
  let withSupplierUrl = 0;

  for (const product of products) {
    const assessment = assessCatalogProductForEnrichment(product);
    if (assessment.status === 'skip') {
      increment(skipReasons, assessment.reason);
      skippedProducts[assessment.reason].push(product.title);
      continue;
    }

    try {
      const draft = buildCatalogEnrichmentDraft(product, new Date('2026-08-20T00:00:00.000Z'));
      const unexpectedKeys = draft.metafields
        .map(metafield => metafield.key)
        .filter(key => !APPROVED_KEYS.has(key));
      if (unexpectedKeys.length) {
        throw new Error(`Draft contains unapproved metafields: ${unexpectedKeys.join(', ')}`);
      }

      increment(decoration, draft.decoration);
      increment(eligibleByVendor, product.vendor || '(no vendor)');
      draft.industryHandles.forEach(handle => increment(eligibleByIndustry, handle));
      if (draft.sourceUrl) withSupplierUrl += 1;
      else missingSupplierUrlTitles.push(product.title);
      const metafieldsByKey = new Map(draft.metafields.map(item => [item.key, item.value]));
      const overview = metafieldsByKey.get('quick_spec_overview') || '';
      const overviewWords = overview.trim().split(/\s+/).filter(Boolean).length;
      if (overviewWords < 50 || overviewWords > 70) {
        overviewOutsideTarget.push({ title: product.title, words: overviewWords });
      }
      const sentenceSafeOverview = overview.replace(/\b(Co|Inc|Ltd)\./g, '$1');
      const overviewSentences = sentenceSafeOverview.split(/(?<=[.!?])\s+/).filter(Boolean).length;
      if (overviewSentences < 2 || overviewSentences > 3) {
        overviewSentenceIssues.push({ title: product.title, sentences: overviewSentences });
      }
      const features = JSON.parse(metafieldsByKey.get('accordion1_texts') || '[]');
      if (!Array.isArray(features) || features.length < 7 || features.length > 9) {
        featureCountIssues.push({
          title: product.title,
          features: Array.isArray(features) ? features.length : 0,
        });
      }
      const specifications = JSON.parse(metafieldsByKey.get('specifications') || '[]');
      if (!Array.isArray(specifications) || specifications.length < 4 || specifications.length > 5) {
        specificationsUnderFive.push({
          title: product.title,
          specifications: Array.isArray(specifications) ? specifications.length : 0,
        });
      }
      const specificationLabels = Array.isArray(specifications)
        ? specifications.map(item => String(item?.label || ''))
        : [];
      const expectedSpecificationLabels = ['Brand', 'Style / SKU', 'Sizes', 'Colours', 'Care'];
      if (JSON.stringify(specificationLabels) !== JSON.stringify(expectedSpecificationLabels)) {
        specificationLabelIssues.push({ title: product.title, labels: specificationLabels });
      }
      const faqs = JSON.parse(metafieldsByKey.get('product_faqs') || '[]');
      if (!Array.isArray(faqs) || faqs.length !== 3) {
        faqCountIssues.push({ title: product.title, faqs: Array.isArray(faqs) ? faqs.length : 0 });
      }
      const methods = JSON.parse(metafieldsByKey.get('available_decoration_methods') || '[]');
      const expectedMethods = supportsBothCatalogDecorations(product)
        ? ['Print', 'Embroidery']
        : [draft.decoration === 'print' ? 'Print' : 'Embroidery'];
      if (!Array.isArray(methods) || JSON.stringify(methods) !== JSON.stringify(expectedMethods)) {
        decorationMethodIssues.push({
          title: product.title,
          expected: expectedMethods,
          actual: Array.isArray(methods) ? methods : [],
        });
      }
      for (const [field, value] of Array.from(metafieldsByKey.entries())) {
        if (!String(value).trim()) emptyContentIssues.push({ title: product.title, field });
      }
      const searchableTitle = product.title.toLowerCase();
      const generatedText = [overview, ...(Array.isArray(features) ? features : [])].join(' ').toLowerCase();
      const contradiction =
        /\b(cap|hat|toque|beanie|snapback|trucker)\b/.test(searchableTitle)
          ? /\b(tee|t-shirt|hoodie|sweatshirt|bottom hem|neck and shoulders)\b/.exec(generatedText)
          : /\b(jacket|vest|shell|coat)\b/.test(searchableTitle)
            ? /\b(tee|t-shirt|polo|tank|shorts|sweatpants)\b/.exec(generatedText)
            : /\b(backpack|duffel|bag)\b/.test(searchableTitle)
              ? /\b(tee|t-shirt|hoodie|sweatshirt|sleeve|collar|cuff|waistband|fit)\b/.exec(generatedText)
              : null;
      if (contradiction) {
        categoryContradictionIssues.push({ title: product.title, text: contradiction[0] });
      }
      eligibleProducts.push({
        title: product.title,
        handle: product.handle || '',
        decoration: draft.decoration,
        industries: draft.industryHandles,
        supplierUrl: draft.sourceUrl,
      });
    } catch (error) {
      errors.push({
        title: product.title,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const report = {
    catalogSource,
    catalogProducts: products.length,
    eligibleProducts: eligibleProducts.length,
    skippedProducts: products.length - eligibleProducts.length - errors.length,
    errors: errors.length,
    decoration,
    eligibleByVendor,
    eligibleByIndustry,
    supplierUrlCoverage: {
      withUrl: withSupplierUrl,
      withoutUrl: eligibleProducts.length - withSupplierUrl,
    },
    skipReasons,
    contentQuality: {
      overviewOutsideTarget,
      overviewSentenceIssues,
      featureCountIssues,
      specificationsUnderFive,
      specificationLabelIssues,
      faqCountIssues,
      emptyContentIssues,
      decorationMethodIssues,
      categoryContradictionIssues,
      missingSupplierUrlTitles,
    },
    ...(includeDetails ? {
      skippedProductTitles: skippedProducts,
      errorDetails: errors,
      eligibleProductPreview: eligibleProducts,
    } : {}),
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await previewPrisma?.$disconnect();
  });
