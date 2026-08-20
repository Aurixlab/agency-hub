import type { DecorationType, ShopifyPayload } from './types';

export const ATC1000_PILOT_PRODUCT_ID = 'gid://shopify/Product/10113107591467';
export const ATC1000_PILOT_HANDLE = 'atc-1000-short-sleeve';
export const ATC1000_PILOT_STYLE = 'ATC1000';
export const ATC1000_SUPPLIER_URL = 'https://media.sanmarcanada.com/pdfs/ATC_ATC1000.pdf';

export const APPROVED_CATALOG_ENRICHMENT_KEYS = new Set([
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
  sourceUrl: string | null;
  metafields: ShopifyPayload['metafields'];
}

export type CatalogEnrichmentSkipReason =
  | 'deferred_missing_industry_review'
  | 'country_or_world_cup'
  | 'package_or_utility'
  | 'no_bulk_ranges'
  | 'unsupported_bulk_ranges'
  | 'no_recognized_industry';

export type CatalogEnrichmentAssessment =
  | {
    status: 'eligible';
    decoration: DecorationType;
    bulkRanges: string[];
    industryHandles: string[];
  }
  | {
    status: 'skip';
    reason: CatalogEnrichmentSkipReason;
    bulkRanges: string[];
    industryHandles: string[];
  };

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
  camps: 'A practical choice for counsellor apparel, camper groups, activity programs, and camp merchandise.',
  schools: 'A practical option for clubs, field days, fundraisers, spirit wear, and student or staff programs.',
  sports: 'A useful option for team staff, training groups, supporters, tournaments, and branded club merchandise.',
  'non-profits': 'An accessible choice for volunteer teams, awareness campaigns, fundraising merchandise, and community programs.',
  restaurants: 'Well suited to staff apparel, front-of-house teams, promotions, and consistent restaurant branding.',
  corporates: 'A polished option for employee apparel, company events, client programs, and branded team merchandise.',
  retail: 'A versatile option for branded retail programs, private-label merchandise, promotions, and resale collections.',
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

// The user asked to keep these 17 regular products out of the batch until their
// missing industry assignments have been reviewed. Keep this guard even if a
// later catalog sync introduces an accidental tag.
const DEFERRED_REVIEW_HANDLES = new Set([
  'callaway-all-over-stitched-chev-polo-cgm794',
  'carhartt-120l-foundry-series-duffel-ctb0000487',
  'carhartt-foundry-series-14-tool-bag-24l-ct89240105',
  'new-sameday-demo-t-shirt',
  'cutter-black-standard-leather',
  'cutterblack-standard-leather-belt',
  'forge-four-way-stretch-womens-sleeveless-polo-lck00197',
  'strathmore-ivory-straw-hat',
  'nike-dri-fit-smooth-heather-polo-nkfq4794',
  'pike-fern-print-mens-polo-mck01391',
  'pullover-hoodie',
  'signature-waterproof-hat',
  'ultra-cotton-women-t-shirt-2000',
  'woodland-mens-fleece-snap-pullover-jacket-mco00103',
  'woodland-womens-fleece-snap-pullover-jacket-lco00087',
  'wrangler-indigo-denim-mens-shirt',
  'wrangler-storm-rider-mens-jacket',
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

function handleText(product: CatalogProductForEnrichment) {
  return normalize(product.handle).replace(/ /g, '-');
}

function isCountryOrWorldCupProduct(product: CatalogProductForEnrichment) {
  const worldCupTeam = metafieldValue(product, 'custom', 'world_cup_team');
  const searchable = `${normalize(product.title)} ${handleText(product)}`;
  return Boolean(worldCupTeam.trim()) || searchable.includes('world cup');
}

function isPackageOrUtilityProduct(product: CatalogProductForEnrichment) {
  const handle = handleText(product);
  if (EMBROIDERY_OVERRIDE_HANDLES.has(handle)) return false;
  const searchable = `${normalize(product.title)} ${handle.replace(/-/g, ' ')}`;
  return /\b(package|utility)\b/.test(searchable) || searchable.includes('demo test');
}

export function assessCatalogProductForEnrichment(
  product: CatalogProductForEnrichment
): CatalogEnrichmentAssessment {
  const bulkRanges = parseList(metafieldValue(product, 'custom', 'bulk_ranges'));
  const industries = recognizedIndustries(product.tags);
  const industryHandles = industries.map(([handle]) => handle);
  const skipped = (reason: CatalogEnrichmentSkipReason): CatalogEnrichmentAssessment => ({
    status: 'skip',
    reason,
    bulkRanges,
    industryHandles,
  });

  if (DEFERRED_REVIEW_HANDLES.has(handleText(product))) {
    return skipped('deferred_missing_industry_review');
  }
  if (isCountryOrWorldCupProduct(product)) return skipped('country_or_world_cup');
  if (isPackageOrUtilityProduct(product)) return skipped('package_or_utility');
  if (!bulkRanges.length) return skipped('no_bulk_ranges');

  const decoration = classifyCatalogDecoration({ bulkRanges, handle: product.handle });
  if (decoration === 'skip') return skipped('unsupported_bulk_ranges');
  if (decoration === 'review') return skipped('unsupported_bulk_ranges');
  if (!industryHandles.length) return skipped('no_recognized_industry');

  return { status: 'eligible', decoration, bulkRanges, industryHandles };
}

function textMetafield(key: string, value: string, type = 'single_line_text_field') {
  return { namespace: 'custom', key, type, value };
}

function jsonMetafield(key: string, value: unknown) {
  return textMetafield(key, JSON.stringify(value), 'json');
}

function firstNonEmpty(values: string[]) {
  return values.map(value => value.trim()).find(Boolean) || '';
}

function sentence(value: string) {
  const clean = value.trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function distinct(values: string[]) {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function terminalStyleFromTitle(title: string) {
  const match = title.trim().match(/(?:^|[\s.\-–—])([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)$/);
  const candidate = match?.[1]?.replace(/[.,;:]+$/, '') || '';
  return /\d/.test(candidate) ? candidate.toUpperCase() : '';
}

function productStyle(product: CatalogProductForEnrichment) {
  return terminalStyleFromTitle(product.title)
    || metafieldValue(product, 'custom', 'product_style_number').trim();
}

function productCategory(product: CatalogProductForEnrichment) {
  const categories = parseList(metafieldValue(product, 'custom', 'sub_category'));
  return firstNonEmpty(categories) || product.title;
}

function supplierName(product: CatalogProductForEnrichment) {
  const vendor = product.vendor?.trim() || '';
  const names: Record<string, string> = {
    sanmar: 'SanMar Canada',
    's&s': 'S&S Activewear Canada',
    stormtech: 'STORMTECH Canada',
    csw: 'Canada Sportswear',
    'momentec brands': 'Momentec Brands',
    cbcorporate: 'CB Corporate',
  };
  return names[normalize(vendor)] || vendor;
}

function sanmarPdfUrl(style: string, brand: string) {
  if (!style) return null;
  const exactOverrides: Record<string, string | null> = {
    WERK1207: 'WeRK1207.pdf',
    ATCF6500: null,
    ATC0822Y: 'ATC0822Y.pdf',
    ATCF2500: 'ATCF2500.pdf',
    ATCY2500: 'ATCY2500.pdf',
    ATC0822: 'ATC0822.pdf',
    WERK422: 'WeRK422.pdf',
    ATCY2600: 'ATCY2600.pdf',
    L350LS: 'ATC_S350LS.pdf',
    ATCF2400: 'ATCF2400.pdf',
    WERK7645: 'WeRK7645.pdf',
    ATCY2400: 'ATCY2400.pdf',
    NKBQ5231L: 'Nike_NKBQ5231.pdf',
    ATCF2600: 'ATCF2600.pdf',
  };
  const override = exactOverrides[style.toUpperCase()];
  if (override === null) return null;
  if (override) return `https://media.sanmarcanada.com/pdfs/${override}`;
  const brandName = normalize(brand);
  let prefix = '';
  if (brandName === 'atc' || brandName === 'werk' || brandName === 'atc werk') prefix = 'ATC_';
  else if (brandName === 'dryframe') prefix = 'DF_';
  else if (brandName === 'coal harbour' || brandName === 'ch essential') prefix = 'CH_';
  else if (brandName === 'koi') prefix = 'KOI_';
  else if (brandName === 'new era') prefix = 'NE_';
  else if (brandName === 'nike') prefix = 'Nike_';
  else if (brandName !== 'the north face' && brandName !== 'carhartt') return null;
  return `https://media.sanmarcanada.com/pdfs/${prefix}${encodeURIComponent(style)}.pdf`;
}

function supplierProductUrl(product: CatalogProductForEnrichment, style: string, brand: string) {
  const vendor = normalize(product.vendor);
  if (vendor === 'sanmar') return sanmarPdfUrl(style, brand);
  if (vendor === 's&s' && style) {
    return `https://en-ca.ssactivewear.com/ps/?q=${encodeURIComponent(style)}`;
  }
  if (vendor === 'stormtech' && product.handle) {
    return `https://www.stormtech.ca/products/${encodeURIComponent(product.handle)}`;
  }
  if (vendor === 'csw' && style) {
    return `https://canadasportswear.com/search?q=${encodeURIComponent(style)}`;
  }
  if (vendor === 'momentec brands' && style === '228358' && handleText(product).includes('volleyball')) {
    return 'https://www.momentecbrands.com/ladies-freestyle-sublimated-cap-sleeve-volleyball-jersey-cut-228358';
  }
  return null;
}

function productFacts(product: CatalogProductForEnrichment) {
  const features = parseList(metafieldValue(product, 'custom', 'accordion1_texts'));
  const materialsAndCare = parseList(metafieldValue(product, 'custom', 'accordion3_texts'));
  const fitAndDecoration = parseList(metafieldValue(product, 'custom', 'accordion4_texts'));
  const material = firstNonEmpty(materialsAndCare.filter(value =>
    !/\b(machine wash|hand wash|spot clean|tumble dry|air dry|do not|avoid bleach|care label|wash and dry instructions)\b/i.test(value)
  ));
  const care = distinct(materialsAndCare.filter(value =>
    /\b(wash|tumble|air dry|spot clean|bleach|iron|care label|dry clean)\b/i.test(value)
  ));
  const weight = firstNonEmpty([...features, ...materialsAndCare].filter(value =>
    /\b\d+(?:\.\d+)?\s*(?:oz|oz\/yd²|oz\/yd2|gsm|g\/m²|g\/m2|g\/m)\b/i.test(value)
  ));
  const fit = firstNonEmpty(fitAndDecoration.filter(value => /\bfit\b/i.test(value)));
  return { features, materialsAndCare, fitAndDecoration, material, care, weight, fit };
}

function genericSpecifications(product: CatalogProductForEnrichment) {
  const brand = metafieldValue(product, 'custom', 'brand').trim();
  const quality = metafieldValue(product, 'custom', 'quality').trim();
  const style = productStyle(product);
  const category = productCategory(product);
  const sizes = optionValues(product, 'Size').length
    ? optionValues(product, 'Size')
    : optionValues(product, 'Accessory size');
  const colours = optionValues(product, 'Color');
  const facts = productFacts(product);
  const specs = [
    { label: 'Product', value: product.title },
    { label: 'Brand', value: brand },
    { label: 'Style', value: style },
    { label: 'Product type', value: category },
    { label: 'Quality', value: quality },
    { label: 'Fabric / material', value: facts.material },
    { label: 'Fabric weight', value: facts.weight },
    { label: 'Fit', value: facts.fit },
    { label: 'Construction / details', value: firstNonEmpty(facts.features) },
    { label: 'Available sizes', value: sizes.join(', ') },
    { label: 'Available colours', value: colours.join(', ') },
    { label: 'Care', value: facts.care.join('; ') },
  ];
  return specs.filter(spec => spec.value.trim());
}

function genericOverview(product: CatalogProductForEnrichment) {
  const brand = metafieldValue(product, 'custom', 'brand').trim();
  const style = productStyle(product);
  const facts = productFacts(product);
  const sizes = optionValues(product, 'Size').length
    ? optionValues(product, 'Size')
    : optionValues(product, 'Accessory size');
  const colours = optionValues(product, 'Color');
  const identity = [brand, style ? `style ${style}` : ''].filter(Boolean).join(', ');
  const parts = [sentence(
    `${product.title} is ${identity ? `${identity}, and is ` : ''}prepared for custom branded orders`
  )];
  const wordCount = (values: string[]) => values.join(' ').trim().split(/\s+/).filter(Boolean).length;
  const addIfItFits = (value: string) => {
    const clean = sentence(value);
    if (!clean || parts.includes(clean)) return;
    if (wordCount([...parts, clean]) <= 70) parts.push(clean);
  };
  for (const fact of [...facts.features.slice(0, 3), facts.material, facts.fit]) {
    if (wordCount(parts) >= 38) break;
    addIfItFits(fact);
  }
  if (sizes.length || colours.length) {
    const availability = [
      sizes.length ? `${sizes.length} current size option${sizes.length === 1 ? '' : 's'}` : '',
      colours.length ? `${colours.length} current colour option${colours.length === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(' and ');
    addIfItFits(`Shopify currently lists ${availability}; availability can vary by inventory`);
  }
  if (wordCount(parts) < 50) {
    addIfItFits('Review the selected size, colour, decoration method, and live inventory before confirming the final branded order');
  }
  if (wordCount(parts) < 50) {
    addIfItFits('Specifications and options can vary by the selected colour or size');
  }
  return distinct(parts).join(' ');
}

function genericFaqs(product: CatalogProductForEnrichment, decoration: DecorationType) {
  const style = productStyle(product);
  const reference = style || product.title;
  const sizes = optionValues(product, 'Size').length
    ? optionValues(product, 'Size')
    : optionValues(product, 'Accessory size');
  const colours = optionValues(product, 'Color');
  const facts = productFacts(product);
  const optionAnswer = sizes.length
    ? `${reference} is currently offered in ${sizes.join(', ')}. ${colours.length ? `${colours.length} colour options are listed in Shopify.` : ''} Availability can vary by inventory.`
    : `${colours.length ? `${colours.length} colour options are currently listed in Shopify.` : 'Available options are shown in the product selector.'} Availability can vary by inventory.`;
  const materialAnswer = [
    sentence(facts.material || firstNonEmpty(facts.features)),
    facts.care.length ? sentence(`Care guidance: ${facts.care.join('; ')}`) : '',
  ].filter(Boolean).join(' ');

  return [
    {
      question: sizes.length ? `What sizes are available for ${reference}?` : `What options are available for ${reference}?`,
      answer: optionAnswer,
    },
    {
      question: `What customization method is priced for ${reference}?`,
      answer: `${reference} uses the ${decoration === 'print' ? 'Print' : 'Embroidery'} pricing ladder shown on this product.`,
    },
    {
      question: `What is ${reference} made from and how should it be cared for?`,
      answer: materialAnswer || 'Refer to the product material and care specifications shown above before laundering or decorating.',
    },
  ];
}

export function buildCatalogEnrichmentDraft(
  product: CatalogProductForEnrichment,
  enrichedAt = new Date()
): ProductEnrichmentDraft {
  if (product.shopifyProductId === ATC1000_PILOT_PRODUCT_ID) {
    return buildAtc1000PilotDraft(product, enrichedAt);
  }

  const assessment = assessCatalogProductForEnrichment(product);
  if (assessment.status === 'skip') {
    throw new Error(`Catalog enrichment skipped ${product.title}: ${assessment.reason}`);
  }

  const decorationName = assessment.decoration === 'print' ? 'Print' : 'Embroidery';
  const brand = metafieldValue(product, 'custom', 'brand').trim();
  const style = productStyle(product);
  const category = productCategory(product);
  const supplier = supplierName(product);
  const sourceUrl = supplierProductUrl(product, style, brand);
  const industryContexts = recognizedIndustries(product.tags).map(([handle, name]) => ({
    industry: name,
    context: INDUSTRY_CONTEXT[handle]
      || `A versatile branded ${category.toLowerCase()} option for ${name.toLowerCase()} programs and teams.`,
  }));
  const decorationGuide = assessment.decoration === 'print'
    ? `This product uses Print pricing. Print is suited to logos, text, campaign artwork, and event graphics; the price tiers shown on the product determine the applicable bulk rate.`
    : `This product uses Embroidery pricing. Embroidery gives logos and text a durable, professional finish; the price tiers shown on the product determine the applicable bulk rate.`;
  const metafields: ShopifyPayload['metafields'] = [
    textMetafield(
      'quick_spec_tagline',
      `${product.title} prepared for custom ${assessment.decoration === 'print' ? 'printing' : 'embroidery'}.`
    ),
    textMetafield('quick_spec_overview', genericOverview(product), 'multi_line_text_field'),
    jsonMetafield('specifications', genericSpecifications(product)),
    jsonMetafield('who_its_great_for', industryContexts),
    textMetafield('supplier_name', supplier),
    textMetafield('pricing_decoration_method', decorationName),
    textMetafield('available_decoration_methods', JSON.stringify([decorationName]), 'list.single_line_text_field'),
    textMetafield('decoration_guide', decorationGuide, 'multi_line_text_field'),
    jsonMetafield('product_faqs', genericFaqs(product, assessment.decoration)),
    textMetafield('enrichment_version', '1', 'number_integer'),
    textMetafield('last_enriched_at', enrichedAt.toISOString(), 'date_time'),
  ];
  if (sourceUrl) {
    metafields.splice(5, 0, textMetafield('supplier_product_url', sourceUrl, 'url'));
  }

  return {
    productId: product.shopifyProductId,
    productTitle: product.title,
    productHandle: product.handle || '',
    decoration: assessment.decoration,
    industryHandles: assessment.industryHandles,
    sourceUrl,
    metafields,
  };
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
