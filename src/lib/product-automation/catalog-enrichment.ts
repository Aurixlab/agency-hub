import type { DecorationType, ShopifyPayload } from './types';

export const ATC1000_PILOT_PRODUCT_ID = 'gid://shopify/Product/10113107591467';
export const ATC1000_PILOT_HANDLE = 'atc-1000-short-sleeve';
export const ATC1000_PILOT_STYLE = 'ATC1000';
export const ATC1000_SUPPLIER_URL = 'https://media.sanmarcanada.com/pdfs/ATC_ATC1000.pdf';

export type CatalogDecorationDecision = DecorationType | 'skip' | 'review';

type SnapshotMetafield = {
  namespace?: unknown;
  key?: unknown;
  value?: unknown;
};

type SnapshotOption = {
  name?: unknown;
  optionValues?: Array<{ name?: unknown }> | null;
};

type ImportedProductSnapshot = {
  metafields?: { nodes?: SnapshotMetafield[] | null } | null;
  options?: SnapshotOption[] | null;
};

export interface CatalogProductForEnrichment {
  shopifyProductId: string;
  title: string;
  handle: string | null;
  vendor: string | null;
  tags: unknown;
  snapshot: unknown;
}

export interface ProductEnrichmentDraft {
  productId: string;
  productTitle: string;
  productHandle: string;
  decoration: DecorationType;
  industryHandles: string[];
  sourceUrl: string;
  metafields: ShopifyPayload['metafields'];
}

const INDUSTRIES = [
  ['events', 'Events'],
  ['trades', 'Trades'],
  ['camps', 'Camps'],
  ['schools', 'Schools'],
  ['sports', 'Sports'],
  ['non-profits', 'Non-Profits'],
  ['restaurants', 'Restaurants'],
  ['corporates', 'Corporates'],
  ['retail', 'Retail'],
] as const;

const INDUSTRY_CONTEXT: Record<string, string> = {
  events: 'A dependable choice for staff shirts, attendee apparel, giveaways, and branded event merchandise.',
  trades: 'Well suited to casual crew wear, company promotions, and branded giveaways for trade-focused businesses.',
  schools: 'A practical option for clubs, field days, fundraisers, spirit wear, and student or staff programs.',
  'non-profits': 'An accessible choice for volunteer teams, awareness campaigns, fundraising merchandise, and community programs.',
};

const EMBROIDERY_LADDER = ['12-23', '24-47', '48-99', '100+'];
const SKIPPED_LADDERS = [
  ['100+'],
  ['15-49', '50-99', '100+'],
];
const EMBROIDERY_OVERRIDE_HANDLES = new Set([
  'strathmore-ivory-straw-hat',
  'ladies-freestyle-sublimated-cap-sleeve-volleyball-jersey-1',
  'test-product-copy',
  'ladies-freestyle-sublimated-cap-sleeve-basketball-jersey',
  'ladies-freestyle-sublimated-cap-sleeve-hocket-jersey',
  'ladies-freestyle-sublimated-cap-sleeve-soccer-jersey',
  'ladies-freestyle-sublimated-cap-sleeve-volleyball-jersey',
]);

const normalize = (value: unknown) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/_/g, ' ')
  .replace(/\s+/g, ' ');

const normalizeRange = (value: unknown) => String(value ?? '')
  .replace(/\s/g, '')
  .replace(/[–—]/g, '-');

const sameLadder = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export function classifyCatalogDecoration(args: {
  bulkRanges: string[];
  handle?: string | null;
}): CatalogDecorationDecision {
  const ranges = args.bulkRanges.map(normalizeRange).filter(Boolean);
  const handle = normalize(args.handle).replace(/ /g, '-');

  if (!ranges.length) return 'skip';
  if (EMBROIDERY_OVERRIDE_HANDLES.has(handle)) return 'embroidery';
  if (sameLadder(ranges, EMBROIDERY_LADDER)) return 'embroidery';
  if (SKIPPED_LADDERS.some(ladder => sameLadder(ranges, ladder))) return 'skip';
  if (/^1-\d+$/.test(ranges[0] || '')) return 'print';
  return 'review';
}

function productSnapshot(product: CatalogProductForEnrichment): ImportedProductSnapshot {
  if (!product.snapshot || typeof product.snapshot !== 'object') return {};
  return product.snapshot as ImportedProductSnapshot;
}

function metafieldValue(product: CatalogProductForEnrichment, namespace: string, key: string) {
  const nodes = productSnapshot(product).metafields?.nodes;
  if (!Array.isArray(nodes)) return '';
  const match = nodes.find(item => item.namespace === namespace && item.key === key);
  return typeof match?.value === 'string' ? match.value : '';
}

function parseList(value: string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(item => String(item).trim()).filter(Boolean) : [];
  } catch {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
}

function optionValues(product: CatalogProductForEnrichment, optionName: string) {
  const options = productSnapshot(product).options;
  if (!Array.isArray(options)) return [];
  const option = options.find(item => normalize(item.name) === normalize(optionName));
  if (!Array.isArray(option?.optionValues)) return [];
  return option.optionValues
    .map(item => typeof item.name === 'string' ? item.name.trim() : '')
    .filter(Boolean);
}

function recognizedIndustries(tags: unknown) {
  const normalizedTags = new Set((Array.isArray(tags) ? tags : []).map(normalize));
  return INDUSTRIES.filter(([handle]) => normalizedTags.has(handle));
}

function textMetafield(key: string, value: string, type = 'single_line_text_field') {
  return { namespace: 'custom', key, type, value };
}

function jsonMetafield(key: string, value: unknown) {
  return textMetafield(key, JSON.stringify(value), 'json');
}

export function buildAtc1000PilotDraft(
  product: CatalogProductForEnrichment,
  enrichedAt = new Date()
): ProductEnrichmentDraft {
  const style = metafieldValue(product, 'custom', 'product_style_number');
  if (
    product.shopifyProductId !== ATC1000_PILOT_PRODUCT_ID
    || product.handle !== ATC1000_PILOT_HANDLE
    || style !== ATC1000_PILOT_STYLE
  ) {
    throw new Error('ATC1000 pilot guard rejected this product');
  }

  const bulkRanges = parseList(metafieldValue(product, 'custom', 'bulk_ranges'));
  const decoration = classifyCatalogDecoration({ bulkRanges, handle: product.handle });
  if (decoration !== 'print') {
    throw new Error(`ATC1000 pilot expected Print pricing, received ${decoration}`);
  }

  const industries = recognizedIndustries(product.tags);
  if (!industries.length) throw new Error('ATC1000 pilot has no recognized industry tags');

  const sizes = optionValues(product, 'Size');
  const colours = optionValues(product, 'Color');
  if (!sizes.length || !colours.length) {
    throw new Error('ATC1000 pilot requires current Shopify size and color options');
  }

  const industryContexts = industries.map(([handle, name]) => ({
    industry: name,
    context: INDUSTRY_CONTEXT[handle] || `A versatile branded apparel option for ${name.toLowerCase()} programs and teams.`,
  }));

  const specifications = [
    { label: 'Style', value: ATC1000_PILOT_STYLE },
    { label: 'Product', value: 'ATC™ Everyday Cotton Tee' },
    { label: 'Fabric weight', value: '9.1 oz.' },
    { label: 'Fabric', value: '100% cotton; select colours use cotton/polyester blends' },
    { label: 'Fit', value: 'Classic fit' },
    { label: 'Collar', value: '1 × 1 rib-knit collar' },
    { label: 'Construction', value: 'Compacted yarns, taped neck and shoulders, and double-needle sleeve and bottom hems' },
    { label: 'Label', value: 'Tear-away label for private branding' },
    { label: 'Certification', value: 'OEKO-TEX® STANDARD 100' },
    { label: 'Available sizes', value: sizes.join(', ') },
    { label: 'Available colours', value: colours.join(', ') },
  ];

  const faqs = [
    {
      question: 'What sizes are currently available for this shirt?',
      answer: `This product is currently offered in ${sizes.join(', ')}. Available colours and sizes may vary by inventory.`,
    },
    {
      question: 'What customization method is priced for this product?',
      answer: 'This product uses our Print pricing ladder, making it suitable for custom logos, artwork, campaign graphics, and event designs.',
    },
    {
      question: 'Is the ATC1000 made from 100% cotton?',
      answer: 'The standard fabric is 100% cotton. Select colours use cotton/polyester blends, so fibre content can vary by colour.',
    },
    {
      question: 'How does the shirt help reduce shrinkage?',
      answer: 'The fabric uses compacted yarns designed to minimize shrinkage. Following the garment care instructions will help preserve its fit.',
    },
  ];

  return {
    productId: product.shopifyProductId,
    productTitle: product.title,
    productHandle: product.handle,
    decoration,
    industryHandles: industries.map(([handle]) => handle),
    sourceUrl: ATC1000_SUPPLIER_URL,
    metafields: [
      textMetafield('quick_spec_tagline', 'Dependable everyday cotton tee made for custom printing.'),
      textMetafield(
        'quick_spec_overview',
        `A classic-fit, 9.1-oz cotton tee with compacted yarns, reinforced hems, and a tear-away label. Currently available in ${sizes.join(', ')} across ${colours.length} colour options.`,
        'multi_line_text_field'
      ),
      jsonMetafield('specifications', specifications),
      jsonMetafield('who_its_great_for', industryContexts),
      textMetafield('supplier_name', 'SanMar Canada'),
      textMetafield('supplier_product_url', ATC1000_SUPPLIER_URL, 'url'),
      textMetafield('pricing_decoration_method', 'Print'),
      textMetafield('available_decoration_methods', JSON.stringify(['Print']), 'list.single_line_text_field'),
      textMetafield(
        'decoration_guide',
        'This product uses Print pricing. Its classic cotton surface is a practical choice for logos, text, event artwork, and campaign graphics across small and bulk orders.',
        'multi_line_text_field'
      ),
      jsonMetafield('product_faqs', faqs),
      textMetafield('enrichment_version', '1', 'number_integer'),
      textMetafield('last_enriched_at', enrichedAt.toISOString(), 'date_time'),
    ],
  };
}

export function addIndustryCollectionReferences(
  draft: ProductEnrichmentDraft,
  collectionIdsByHandle: Record<string, string>
): ProductEnrichmentDraft {
  const collectionIds = draft.industryHandles.map(handle => {
    const id = collectionIdsByHandle[handle];
    if (!id) throw new Error(`Missing Shopify collection reference for ${handle}`);
    return id;
  });

  return {
    ...draft,
    metafields: [
      ...draft.metafields,
      textMetafield('industries', JSON.stringify(collectionIds), 'list.collection_reference'),
    ],
  };
}
