import type {
  DecorationMethod,
  DecorationType,
  ProductContentCategory,
} from './types';

export const INDUSTRY_OPTIONS = [
  { handle: 'events', name: 'Events' },
  { handle: 'trades', name: 'Trades' },
  { handle: 'camps', name: 'Camps' },
  { handle: 'schools', name: 'Schools' },
  { handle: 'sports', name: 'Sports' },
  { handle: 'non-profits', name: 'Non-Profits' },
  { handle: 'restaurants', name: 'Restaurants' },
  { handle: 'corporates', name: 'Corporates' },
  { handle: 'retail', name: 'Retail' },
] as const;

export const PRODUCT_CONTENT_CATEGORIES: ProductContentCategory[] = [
  't-shirt',
  'polo',
  'hoodie',
  'sweatshirt',
  'outerwear',
  'headwear',
  'bottoms',
  'bags',
  'other',
];

export const industryName = (handle: string) =>
  INDUSTRY_OPTIONS.find(option => option.handle === handle)?.name || handle;

export const normalizeIndustryHandles = (value: unknown) => {
  const normalize = (item: unknown) => String(item).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const aliases = new Map<string, string>();
  for (const option of INDUSTRY_OPTIONS) {
    aliases.set(normalize(option.handle), option.handle);
    aliases.set(normalize(option.name), option.handle);
  }
  aliases.set('corporate', 'corporates');
  aliases.set('nonprofit', 'non-profits');
  aliases.set('school', 'schools');
  aliases.set('sport', 'sports');
  aliases.set('event', 'events');
  aliases.set('trade', 'trades');
  aliases.set('camp', 'camps');
  aliases.set('restaurant', 'restaurants');
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map(item => aliases.get(normalize(item)) || '')
    .filter(Boolean)));
};

export const decorationLabel = (value: DecorationType): DecorationMethod =>
  value === 'embroidery' ? 'Embroidery' : 'Print';

export const normalizeDecorationMethods = (
  value: unknown,
  pricingDecoration: DecorationType
): DecorationMethod[] => {
  const normalized = Array.from(new Set((Array.isArray(value) ? value : [])
    .map(item => String(item).trim().toLowerCase())
    .map(item => item === 'print' ? 'Print' : item === 'embroidery' ? 'Embroidery' : '')
    .filter((item): item is DecorationMethod => Boolean(item))));
  const primary = decorationLabel(pricingDecoration);
  return normalized.length ? Array.from(new Set([primary, ...normalized])) : [primary];
};

export type InternalLinkStrategy = {
  collectionUrl: string;
  fields: Array<{
    key: 'overview_linked_copy' | 'audience_linked_copy' | 'customization_linked_copy' | 'collection_linked_copy';
    keyword: string;
  }>;
};

// Internal-link copy is intentionally category-scoped. Only the approved
// T-shirt strategy exists today, so a hoodie, jacket, cap, or other product
// can never receive T-shirt keywords accidentally. Add future category
// strategies here only after their keywords and destination are approved.
export const INTERNAL_LINK_STRATEGIES: Partial<Record<ProductContentCategory, InternalLinkStrategy>> = {
  't-shirt': {
    collectionUrl: 'https://budgetpromotion.ca/collections/t-shirts',
    fields: [
      { key: 'overview_linked_copy', keyword: 'custom t-shirt' },
      { key: 'audience_linked_copy', keyword: 'custom apparel' },
      { key: 'customization_linked_copy', keyword: 'custom t shirt merchandise' },
      { key: 'collection_linked_copy', keyword: 'Custom merchandise' },
    ],
  },
};

export function richTextWithLinkedKeyword(copy: string, keyword: string, url: string) {
  const index = copy.toLowerCase().indexOf(keyword.toLowerCase());
  if (index < 0) return null;

  const before = copy.slice(0, index);
  const linkedText = copy.slice(index, index + keyword.length);
  const after = copy.slice(index + keyword.length);
  const children: Array<Record<string, unknown>> = [];
  if (before) children.push({ type: 'text', value: before });
  children.push({
    type: 'link',
    url,
    title: `View ${keyword}`,
    children: [{ type: 'text', value: linkedText }],
  });
  if (after) children.push({ type: 'text', value: after });

  return JSON.stringify({
    type: 'root',
    children: [{ type: 'paragraph', children }],
  });
}
