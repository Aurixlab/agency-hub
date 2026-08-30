import type { DecorationType, ShopifyPayload } from './types';
import sanmarSourceFactsRaw from './sanmar-source-facts.json';
import workbookProductRulesRaw from './workbook-product-rules.json';

type WorkbookProductRule = {
  fabric: string;
  decoration: string;
  sheet: string;
  row: number;
  match: string;
};

const SANMAR_SOURCE_FACTS = sanmarSourceFactsRaw as Record<string, string[]>;
const WORKBOOK_PRODUCT_RULES = workbookProductRulesRaw as Record<string, WorkbookProductRule>;

export const ATC1000_PILOT_PRODUCT_ID = 'gid://shopify/Product/10113107591467';
export const ATC1000_PILOT_HANDLE = 'atc-1000-short-sleeve';
export const ATC1000_PILOT_STYLE = 'ATC1000';
export const ATC1000_SUPPLIER_URL = 'https://media.sanmarcanada.com/pdfs/ATC_ATC1000.pdf';

export const APPROVED_CATALOG_ENRICHMENT_KEYS = new Set([
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
  events: 'Staff apparel, attendee merchandise, giveaways, and branded event runs.',
  trades: 'Crew uniforms, company promotions, and trade-focused branded apparel.',
  camps: 'Counsellor apparel, camper groups, activity programs, and camp merchandise.',
  schools: 'Clubs, field days, fundraisers, spirit wear, and staff programs.',
  sports: 'Team staff, training groups, supporters, tournaments, and club merchandise.',
  'non-profits': 'Volunteer teams, awareness campaigns, fundraisers, and community programs.',
  restaurants: 'Front-of-house teams, kitchen crews, promotions, and restaurant branding.',
  corporates: 'Employee apparel, company events, client programs, and branded teams.',
  retail: 'Private-label merchandise, promotions, branded retail, and resale collections.',
};

const EMBROIDERY_LADDER = ['12-23', '24-47', '48-99', '100+'];
const SKIPPED_LADDERS = [
  ['100+'],
  ['15-49', '50-99', '100+'],
];
const EMBROIDERY_OVERRIDE_HANDLES = new Set([
  'strathmore-ivory-straw-hat',
  'ladies-freestyle-sublimated-cap-sleeve-volleyball-jersey-1',
  'ladies-freestyle-sublimated-cap-sleeve-basketball-jersey',
  'ladies-freestyle-sublimated-cap-sleeve-hocket-jersey',
  'ladies-freestyle-sublimated-cap-sleeve-soccer-jersey',
  'ladies-freestyle-sublimated-cap-sleeve-volleyball-jersey',
]);

// Website Product.xlsx marks these product families as supporting both print
// and embroidery. The list includes the women/youth child styles that are
// present in Shopify; some child products intentionally repeat the parent
// style metafield, so matching by style includes those records as well.
const BOTH_DECORATION_STYLES = new Set([
  'ATCF2500', 'ATCY2500', 'ATCF2100', '18500', '18500B', 'L00550',
  'KOI2250', 'ATCF6500', 'F2005', 'Y2005', 'SF500', 'SF500B',
  'DF7656', 'DF7656L', '3719', 'IND4000', '1379757', 'ATCF2600',
  'ATCY2600', '18600', '18600B', 'KOI2052', 'F2018', 'L2018',
  'NKFD9890', 'IND4000Z', 'ATCF2400', 'ATCY2400', '18000', '18000B',
  'KOI2057', 'SS3000', 'ATCF2700', 'KOI2058', 'S4046', 'L4046',
  'S4007', 'L4007', '88181', '78181', '88181Y', 'S445', 'L445',
  'Y445', '1370399', '1370431', 'NKDC1963', 'NKDC1991', 'TT51L',
  'TT51LW', '88192', '78192', 'S365LS', 'M348L', 'M348LW', 'DG20L',
  'DG20LW', 'D110', 'D110W', 'NKDC2104', 'ATCF2800', 'ATCY2800',
  'KOI2280', 'SF100', 'ATCF2875', 'J0760', 'L0760', 'WERK7645',
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
  return /\b(test|package|utility)\b/.test(searchable) || searchable.includes('demo test');
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

export function supportsBothCatalogDecorations(product: CatalogProductForEnrichment) {
  const styles = [
    terminalStyleFromTitle(product.title),
    metafieldValue(product, 'custom', 'product_style_number').trim(),
  ].map(style => style.toUpperCase()).filter(Boolean);
  return styles.some(style => BOTH_DECORATION_STYLES.has(style));
}

function productCategory(product: CatalogProductForEnrichment) {
  const categories = parseList(metafieldValue(product, 'custom', 'sub_category'));
  return firstNonEmpty(categories) || product.title;
}

function productDisplayCategory(product: CatalogProductForEnrichment) {
  const title = normalize(product.title);
  const titleTypes: Array<[RegExp, string]> = [
    [/\b(toque|beanie)\b/, 'toque'],
    [/\b(cap|hat|snapback|trucker)\b/, 'cap'],
    [/\b(backpack)\b/, 'backpack'],
    [/\b(duffel|tote|bag)\b/, 'bag'],
    [/\b(vest)\b/, 'vest'],
    [/\b(jacket|shell|coat)\b/, 'jacket'],
    [/\b(hoodie|hooded sweatshirt)\b/, 'hoodie'],
    [/\b(crewneck sweatshirt|crewneck sweater)\b/, 'crewneck sweatshirt'],
    [/\b(polo)\b/, 'polo'],
    [/\b(tank)\b/, 'tank top'],
    [/\b(bodysuit|onesie)\b/, 'bodysuit'],
    [/\b(sweatpants?)\b/, 'sweatpants'],
    [/\b(shorts?)\b/, 'shorts'],
    [/\b(jersey)\b/, 'jersey'],
    [/\b(tee|t-shirt|shirt)\b/, title.includes('long sleeve') ? 'long-sleeve shirt' : 'short-sleeve shirt'],
  ];
  const fromTitle = titleTypes.find(([pattern]) => pattern.test(title));
  if (fromTitle) return fromTitle[1];

  const category = productCategory(product).toLowerCase();
  const categoryNames: Record<string, string> = {
    'short sleeves': 'short-sleeve shirt',
    'short sleeve': 'short-sleeve shirt',
    'long sleeves': 'long-sleeve shirt',
    'long sleeve': 'long-sleeve shirt',
    toques: 'toque',
    vests: 'vest',
    'winter jackets': 'jacket',
    softshells: 'softshell jacket',
    fitted: 'fitted cap',
    'adjustable/snapback': 'adjustable cap',
    'tote bags': 'tote bag',
    backpacks: 'backpack',
    kids: 'youth apparel',
    youth: 'youth apparel',
    unisex: 'unisex apparel',
  };
  return categoryNames[category] || category;
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
    ATCF6500: 'EW_ATCF6500.pdf',
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
  if (style === '228358' && handleText(product).includes('volleyball')) {
    return 'https://www.momentecbrands.com/ladies-freestyle-sublimated-cap-sleeve-volleyball-jersey-cut-228358';
  }
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
  return null;
}

function importedProductFacts(product: CatalogProductForEnrichment) {
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

function productKind(product: CatalogProductForEnrichment) {
  const value = `${product.title} ${productCategory(product)}`.toLowerCase();
  if (/\b(cap|hat|toque|beanie|snapback|trucker)\b/.test(value)) return 'headwear';
  if (/\b(backpack|duffel|bag)\b/.test(value)) return 'bag';
  if (/\b(jacket|vest|shell|coat)\b/.test(value)) return 'outerwear';
  if (/\b(shorts?|sweatpants?|pants?)\b/.test(value)) return 'bottom';
  return 'top';
}

function technicalFact(value: string) {
  return /(?:%|\boz\b|oz\/|gsm|panel|closure|visor|sweatband|stitch|seam|hood|pocket|zip|collar|cuff|waistband|wick|water|wind|insulat|rib knit|fleece|jersey|piqu[eé]|mesh|canvas|twill|interlock|tricot|rayon|spandex|nylon|polyester|cotton|acrylic|label|fit|stretch)/i.test(value);
}

function categoryConsistent(value: string, kind: ReturnType<typeof productKind>) {
  const text = value.toLowerCase();
  if (kind === 'headwear') {
    return !/\b(?:tee|t-shirt|shirt|hoodie|sweatshirt|sleeve|bottom hem|neck and shoulders|collar and cuffs?)\b/.test(text);
  }
  if (kind === 'bag') {
    return !/\b(?:tee|t-shirt|shirt|hoodie|sweatshirt|sleeve|collar|cuff|waistband|fit)\b/.test(text);
  }
  if (kind === 'bottom') {
    return !/\b(?:tee|t-shirt|shirt|polo|collar|hood|sleeve)\b/.test(text);
  }
  if (kind === 'outerwear') {
    return !/\b(?:tee|t-shirt|polo|tank|shorts|sweatpants)\b/.test(text);
  }
  return !/\b(?:snapback|trucker cap|toque|beanie|backpack|duffel)\b/.test(text);
}

function fabricConsistent(value: string, expectedFabric: string) {
  const fact = value.toLowerCase();
  const expected = expectedFabric.toLowerCase();
  if (!expected) return true;
  if (expected === 'cotton') {
    return !/100%\s+(?:polyester|acrylic|nylon)/.test(fact) || /cotton/.test(fact);
  }
  if (expected === 'polyester') {
    return !/100%\s+(?:cotton|acrylic|nylon)/.test(fact) || /polyester/.test(fact);
  }
  if (expected === 'acrylic') {
    return !/100%\s+(?:cotton|nylon)/.test(fact) && (!/100%\s+polyester/.test(fact) || /acrylic/.test(fact));
  }
  return true;
}

type VerifiedProductFacts = {
  sourceFacts: string[];
  fabric: string;
  source: 'official_supplier_pdf' | 'workbook_and_imported_product' | 'imported_product';
};

function verifiedProductFacts(product: CatalogProductForEnrichment, sourceUrl: string | null): VerifiedProductFacts {
  const style = productStyle(product).toUpperCase();
  const workbookRule = WORKBOOK_PRODUCT_RULES[style];
  const fabric = workbookRule?.fabric || '';
  const officialFacts = sourceUrl ? (SANMAR_SOURCE_FACTS[sourceUrl] || []) : [];
  if (officialFacts.length) {
    return {
      sourceFacts: distinct(officialFacts.map(sentence)).slice(0, 7),
      fabric,
      source: 'official_supplier_pdf',
    };
  }

  // Several copied sport-product records reuse the volleyball style number
  // while their titles identify different sports. Without an exact supplier
  // page, do not carry the volleyball construction claims into those records.
  if (normalize(product.vendor) === 'momentec brands' && !sourceUrl) {
    return {
      sourceFacts: [],
      fabric,
      source: workbookRule ? 'workbook_and_imported_product' : 'imported_product',
    };
  }

  const imported = importedProductFacts(product);
  const kind = productKind(product);
  const safeImportedFacts = distinct([
    ...imported.features,
    ...imported.materialsAndCare.filter(value => !imported.care.includes(value)),
    ...imported.fitAndDecoration,
  ])
    .filter(technicalFact)
    .filter(value => categoryConsistent(value, kind))
    .filter(value => fabricConsistent(value, fabric))
    .map(sentence)
    .slice(0, 7);

  return {
    sourceFacts: safeImportedFacts,
    fabric,
    source: workbookRule ? 'workbook_and_imported_product' : 'imported_product',
  };
}

function methodsLabel(decoration: DecorationType, supportsBoth: boolean) {
  if (supportsBoth) return 'Print and Embroidery';
  return decoration === 'print' ? 'Print' : 'Embroidery';
}

function featureBullets(
  product: CatalogProductForEnrichment,
  sourceUrl: string | null,
  decoration: DecorationType,
  supportsBoth: boolean,
  industryNames: string[],
  bulkRanges: string[]
) {
  const facts = verifiedProductFacts(product, sourceUrl);
  const sizes = optionValues(product, 'Size').length
    ? optionValues(product, 'Size')
    : optionValues(product, 'Accessory size');
  const colours = optionValues(product, 'Color');
  const brand = metafieldValue(product, 'custom', 'brand').trim() || supplierName(product);
  const style = productStyle(product);
  const category = productDisplayCategory(product);
  const candidates = [
    ...facts.sourceFacts.slice(0, 5),
    facts.sourceFacts.length < 2
      ? `${supplierName(product)} is the supplier recorded for this product in Shopify.`
      : '',
    `${brand}${style ? ` style ${style}` : ''} identifies this exact ${category} for quoting and order review.`,
    sizes.length ? `Available in ${sizes.join(', ')} to support mixed-size group orders.` : '',
    colours.length ? `Choose from ${colours.length} current colour option${colours.length === 1 ? '' : 's'} in the product selector; availability can vary by inventory.` : '',
    `${methodsLabel(decoration, supportsBoth)} ${supportsBoth ? 'are' : 'is'} the approved decoration ${supportsBoth ? 'methods' : 'method'} for this product.`,
    industryNames.length ? `Assigned to the ${industryNames.join(', ')} Shopify industry collection${industryNames.length === 1 ? '' : 's'}.` : '',
    bulkRanges.length ? `Current quantity tiers are ${bulkRanges.join(', ')}; the applicable rate depends on the selected order quantity.` : '',
    sourceUrl ? 'A supplier reference is linked for final material and production verification.' : 'Final material and production details should be confirmed during quote approval.',
  ].map(sentence);

  const seen = new Set<string>();
  return candidates.filter(value => {
    const key = normalize(value).replace(/[^a-z0-9]+/g, ' ');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 9);
}

function genericSpecifications(product: CatalogProductForEnrichment) {
  const brand = metafieldValue(product, 'custom', 'brand').trim();
  const style = productStyle(product);
  const sizes = optionValues(product, 'Size').length
    ? optionValues(product, 'Size')
    : optionValues(product, 'Accessory size');
  const colours = optionValues(product, 'Color');
  return [
    { label: 'Brand', value: brand || supplierName(product) },
    { label: 'Style / SKU', value: style },
    { label: 'Sizes', value: sizes.join(', ') || 'See the product selector for current options' },
    { label: 'Colours', value: colours.join(', ') || 'See the product selector for current options' },
    { label: 'Care', value: 'Follow the sewn-in care label and the care instructions supplied with the approved decoration' },
  ];
}

function genericOverview(
  product: CatalogProductForEnrichment,
  decoration: DecorationType,
  supportsBoth: boolean,
  industryNames: string[],
  sourceUrl: string | null
) {
  const brand = metafieldValue(product, 'custom', 'brand').trim();
  const style = productStyle(product);
  const category = productDisplayCategory(product);
  const facts = verifiedProductFacts(product, sourceUrl);
  const sizes = optionValues(product, 'Size').length
    ? optionValues(product, 'Size')
    : optionValues(product, 'Accessory size');
  const colours = optionValues(product, 'Color');
  const identity = [brand, style ? `style ${style}` : ''].filter(Boolean).join(' ')
    || product.title;
  const audienceItems = industryNames.length
    ? industryNames.slice(0, 3).map(value => value.toLowerCase())
    : ['teams', 'organizations'];
  const audience = audienceItems.length > 1
    ? `${audienceItems.slice(0, -1).join(', ')} and ${audienceItems.at(-1)}`
    : audienceItems[0];
  const method = supportsBoth
    ? 'printing and embroidery'
    : decoration === 'print' ? 'printing' : 'embroidery';
  const verifiedDetails = facts.sourceFacts
    .slice(0, 2)
    .map(value => value.replace(/[.!?]$/, ''));
  const sourceSentence = verifiedDetails.length
    ? facts.source === 'official_supplier_pdf'
      ? `Source-checked details include ${verifiedDetails.join(' and ')}.`
      : `Recorded product details include ${verifiedDetails.join(' and ')}.`
    : facts.fabric
      ? `The product workbook classifies this style as ${facts.fabric.toLowerCase()}, with final construction confirmed during quote approval.`
      : 'The available product data confirms the style, supplier, category, and approved decoration method used for quoting.';
  const availability = [
    sizes.length ? `${sizes.length} current size option${sizes.length === 1 ? '' : 's'}` : '',
    colours.length ? `${colours.length} current colour option${colours.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' and ') || 'the current product options';
  const parts = [
    `This product is listed in the ${category.toLowerCase()} category as ${identity}, selected for custom ${method} across ${audience}.`,
    sourceSentence,
    `Shopify currently lists ${availability}; availability can vary, so confirm the selected size, colour, decoration method, and inventory before artwork approval and production.`,
  ];
  const wordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
  let overview = parts.join(' ');
  if (wordCount(overview) > 70 && verifiedDetails.length > 1) {
    parts[1] = `Source-checked details include ${verifiedDetails[0]}.`;
    overview = parts.join(' ');
  }
  if (wordCount(overview) > 70) {
    parts[1] = facts.fabric
      ? `The product workbook classifies this style as ${facts.fabric.toLowerCase()}, with construction confirmed during quote approval.`
      : 'Supplier-linked product data is used to confirm construction during quote approval.';
    overview = parts.join(' ');
  }
  return overview;
}

function genericTagline(
  product: CatalogProductForEnrichment,
  decoration: DecorationType,
  supportsBoth: boolean,
  industryNames: string[]
) {
  const quality = metafieldValue(product, 'custom', 'quality').trim().toLowerCase();
  const categoryValue = productDisplayCategory(product);
  const category = normalize(categoryValue) === normalize(product.title) ? 'product' : categoryValue.toLowerCase();
  const audience = industryNames.length ? industryNames[0].toLowerCase() : 'team';
  const method = supportsBoth
    ? 'custom printing and embroidery'
    : decoration === 'print' ? 'custom printing' : 'custom embroidery';
  const lead = quality ? `${quality.charAt(0).toUpperCase()}${quality.slice(1)} ` : '';
  return `${lead}${category} for ${audience} programs with ${method}.`;
}

function genericFaqs(
  product: CatalogProductForEnrichment,
  decoration: DecorationType,
  supportsBoth: boolean,
  sourceUrl: string | null
) {
  const style = productStyle(product);
  const reference = style || product.title;
  const sizes = optionValues(product, 'Size').length
    ? optionValues(product, 'Size')
    : optionValues(product, 'Accessory size');
  const colours = optionValues(product, 'Color');
  const facts = verifiedProductFacts(product, sourceUrl);
  const colourCount = colours.length
    ? `${colours.length} colour option${colours.length === 1 ? '' : 's'}`
    : '';
  const optionAnswer = sizes.length
    ? `${reference} is currently offered in ${sizes.join(', ')}.${colourCount ? ` ${colourCount} ${colours.length === 1 ? 'is' : 'are'} listed in Shopify.` : ''} Availability can vary by inventory.`
    : `${colourCount ? `${colourCount} ${colours.length === 1 ? 'is' : 'are'} currently listed in Shopify.` : 'Available options are shown in the product selector.'} Availability can vary by inventory.`;
  const materialFact = facts.sourceFacts.find(technicalFact);
  const materialAnswer = materialFact
    ? `${sentence(materialFact)} Follow the sewn-in care label and the care instructions supplied with the approved decoration.`
    : facts.fabric
      ? `The product workbook classifies this style as ${facts.fabric.toLowerCase()}. Follow the sewn-in care label and the care instructions supplied with the approved decoration.`
      : 'Confirm the supplier material reference during quote approval, then follow the sewn-in care label and the care instructions supplied with the approved decoration.';

  return [
    {
      question: sizes.length ? `What sizes are available for ${reference}?` : `What options are available for ${reference}?`,
      answer: optionAnswer,
    },
    {
      question: `What customization method is priced for ${reference}?`,
      answer: supportsBoth
        ? `${reference} supports both Print and Embroidery. The ${decoration === 'print' ? 'Print' : 'Embroidery'} ladder shown on this product is the pricing basis for the current bulk tiers.`
        : `${reference} uses the ${decoration === 'print' ? 'Print' : 'Embroidery'} pricing ladder shown on this product.`,
    },
    {
      question: `What is ${reference} made from and how should it be cared for?`,
      answer: materialAnswer,
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
  const supportsBoth = supportsBothCatalogDecorations(product);
  const availableDecorationMethods = supportsBoth
    ? ['Print', 'Embroidery']
    : [decorationName];
  const brand = metafieldValue(product, 'custom', 'brand').trim();
  const style = productStyle(product);
  const category = productDisplayCategory(product);
  const supplier = supplierName(product);
  const sourceUrl = supplierProductUrl(product, style, brand);
  const industryContexts = recognizedIndustries(product.tags).map(([handle, name]) => ({
    industry: name,
    context: INDUSTRY_CONTEXT[handle]
      || `A versatile branded ${category.toLowerCase()} option for ${name.toLowerCase()} programs and teams.`,
  }));
  const industryNames = industryContexts.map(item => item.industry);
  const facts = verifiedProductFacts(product, sourceUrl);
  const materialDetail = facts.sourceFacts.find(technicalFact)
    || (facts.fabric ? `${facts.fabric} fabric classification` : 'verified product construction');
  const decorationGuide = supportsBoth
    ? `Both Print and Embroidery are available for this product. Production planning uses this construction detail: ${materialDetail.replace(/[.!?]$/, '')}. Print works for detailed artwork, while embroidery provides a durable stitched finish; the current bulk tiers use ${decorationName} pricing.`
    : assessment.decoration === 'print'
      ? `This product uses Print pricing. Production planning uses this construction detail: ${materialDetail.replace(/[.!?]$/, '')}. Print is suited to logos, text, campaign artwork, and event graphics; the quantity tiers shown determine the applicable bulk rate.`
      : `This product uses Embroidery pricing. Production planning uses this construction detail: ${materialDetail.replace(/[.!?]$/, '')}. Embroidery gives logos and text a durable stitched finish; the quantity tiers shown determine the applicable bulk rate.`;
  const metafields: ShopifyPayload['metafields'] = [
    textMetafield(
      'accordion1_texts',
      JSON.stringify(featureBullets(
        product,
        sourceUrl,
        assessment.decoration,
        supportsBoth,
        industryNames,
        assessment.bulkRanges
      )),
      'list.single_line_text_field'
    ),
    textMetafield('quick_spec_tagline', genericTagline(product, assessment.decoration, supportsBoth, industryNames)),
    textMetafield(
      'quick_spec_overview',
      genericOverview(product, assessment.decoration, supportsBoth, industryNames, sourceUrl),
      'multi_line_text_field'
    ),
    jsonMetafield('specifications', genericSpecifications(product)),
    jsonMetafield('who_its_great_for', industryContexts),
    textMetafield('supplier_name', supplier),
    textMetafield('pricing_decoration_method', decorationName),
    textMetafield('available_decoration_methods', JSON.stringify(availableDecorationMethods), 'list.single_line_text_field'),
    textMetafield('decoration_guide', decorationGuide, 'multi_line_text_field'),
    jsonMetafield('product_faqs', genericFaqs(product, assessment.decoration, supportsBoth, sourceUrl)),
    textMetafield('enrichment_version', '4', 'number_integer'),
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

  const featureList = [
    '100% cotton construction with a 9.1 oz Canadian fabric weight holds print decoration cleanly across repeat orders.',
    'Compacted yarns help reduce shrinkage and keep sizing more consistent after washing.',
    'Double-needle stitching at the sleeves and hem adds reinforcement for regular team and staff wear.',
    'Taped neck and shoulders help the shirt retain its structure through repeated use.',
    'A tear-away label makes the shirt a clean choice for private-label branding.',
    'The 1 × 1 rib-knit collar and classic fit create a familiar everyday profile.',
    `Available in ${sizes.join(', ')} across ${colours.length} current colour options for mixed group orders.`,
    'Select colours use cotton/polyester blends, so fibre content should be checked before final approval.',
  ];

  const specifications = [
    { label: 'Brand', value: 'ATC (SanMar Canada)' },
    { label: 'Style / SKU', value: ATC1000_PILOT_STYLE },
    { label: 'Sizes', value: sizes.join(', ') },
    { label: 'Colours', value: colours.join(', ') },
    { label: 'Care', value: 'Follow the sewn-in care label and the care instructions supplied with the approved decoration.' },
  ];

  const faqs = [
    {
      question: `What sizes and colours are available for ${ATC1000_PILOT_STYLE}?`,
      answer: `This product is currently offered in ${sizes.join(', ')} across ${colours.length} colour options. Availability can vary by inventory.`,
    },
    {
      question: `How is custom decoration priced for ${ATC1000_PILOT_STYLE}?`,
      answer: 'This product uses the Print pricing ladder shown on the page. The applicable per-piece rate changes with the selected quantity tier.',
    },
    {
      question: `What is ${ATC1000_PILOT_STYLE} made from and how does it fit?`,
      answer: 'The standard fabric is 100% cotton with compacted yarns, while select colours use cotton/polyester blends. It has a classic fit and a 1 × 1 rib-knit collar.',
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
      textMetafield('accordion1_texts', JSON.stringify(featureList), 'list.single_line_text_field'),
      textMetafield('quick_spec_tagline', 'A dependable cotton tee built for private-label branding and high-volume print runs.'),
      textMetafield(
        'quick_spec_overview',
        `The ATC 1000 is a 100% cotton tee built for teams, staff, and events that need a dependable blank in bulk. Compacted yarns help reduce shrinkage after washing, and the tear-away label makes it a clean choice for private branding. It is currently offered in ${sizes.join(', ')} across ${colours.length} colour options, subject to live inventory.`,
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
        'The ATC1000 uses Print pricing, and its classic cotton surface is suited to logos, text, event artwork, and campaign graphics. Select blended colours can behave differently during decoration, so confirm the chosen colour before production. The quantity tiers shown on the product determine the applicable bulk rate.',
        'multi_line_text_field'
      ),
      jsonMetafield('product_faqs', faqs),
      textMetafield('enrichment_version', '4', 'number_integer'),
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
