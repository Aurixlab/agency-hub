import { calculatePricing } from './pricing';
import { generateVariants } from './variants';
import {
  INTERNAL_LINK_STRATEGIES,
  decorationLabel,
  richTextWithLinkedKeyword,
} from './content-config';
import type { AiProductCopy, DecorationType, PricingTable, ScrapedProductData, ShopifyPayload } from './types';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const metafieldList = (items: string[]) => JSON.stringify(items.filter(Boolean));
const priceText = (price: number) => `$${price.toFixed(2)}`;
const contentCategoryLabel = (category: AiProductCopy['product_category']) => ({
  't-shirt': 'T-Shirts',
  polo: 'Polos',
  hoodie: 'Hoodies',
  sweatshirt: 'Sweatshirts',
  outerwear: 'Outerwear',
  headwear: 'Headwear',
  bottoms: 'Bottoms',
  bags: 'Bags',
  other: 'Apparel',
}[category]);

export function buildBodyHtml(scrapedData: ScrapedProductData) {
  return scrapedData.raw_description ? `<p>${escapeHtml(scrapedData.raw_description)}</p>` : '';
}

export function composeShopifyPayload(args: {
  scrapedData: ScrapedProductData;
  aiCopy: AiProductCopy;
  basePrice: number;
  decorationType: DecorationType;
  colors: string[];
  productLink: string;
  industryCollectionIds?: string[];
  enrichedAt?: Date;
}): { pricing: PricingTable; payload: ShopifyPayload } {
  const pricing = calculatePricing(args.basePrice, args.decorationType);
  const sellPrice = pricing.tiers[0]?.price ?? args.basePrice;
  const variants = generateVariants(args.colors, args.scrapedData.sku, sellPrice);
  const lowestTier = pricing.tiers[pricing.tiers.length - 1];

  const metafields: ShopifyPayload['metafields'] = [
    { namespace: 'custom', key: 'brand', type: 'single_line_text_field', value: args.scrapedData.brand || '' },
    { namespace: 'custom', key: 'quality', type: 'single_line_text_field', value: 'Standard' },
    { namespace: 'custom', key: 'sub_category', type: 'single_line_text_field', value: contentCategoryLabel(args.aiCopy.product_category) },
    { namespace: 'custom', key: 'product_style_number', type: 'single_line_text_field', value: args.scrapedData.sku || '' },
    { namespace: 'custom', key: 'price_info', type: 'single_line_text_field', value: lowestTier ? `As low as ${priceText(lowestTier.price)} (Price for ${lowestTier.range})` : '' },
    { namespace: 'custom', key: 'accordion1_texts', type: 'list.single_line_text_field', value: metafieldList(args.aiCopy.key_features) },
    { namespace: 'custom', key: 'accordion2_texts', type: 'list.single_line_text_field', value: metafieldList(args.aiCopy.best_use) },
    { namespace: 'custom', key: 'accordion3_texts', type: 'list.single_line_text_field', value: metafieldList(args.aiCopy.material_care) },
    { namespace: 'custom', key: 'accordion4_texts', type: 'list.single_line_text_field', value: metafieldList(args.aiCopy.customization_fit) },
    { namespace: 'custom', key: 'bulk_ranges', type: 'list.single_line_text_field', value: metafieldList(pricing.tiers.map(tier => tier.range)) },
    { namespace: 'custom', key: 'bulk_prices', type: 'list.single_line_text_field', value: metafieldList(pricing.tiers.map(tier => priceText(tier.price))) },
    { namespace: 'custom', key: 'bulk_savings', type: 'list.single_line_text_field', value: metafieldList(pricing.tiers.map((tier, index) => {
      if (index === 0) return 'Save 0%';
      const firstPrice = pricing.tiers[0]?.price || tier.price;
      const discount = Math.max(0, Math.round((1 - tier.price / firstPrice) * 100));
      return `Save ${discount}%`;
    })) },
    { namespace: 'custom', key: 'quick_spec_tagline', type: 'single_line_text_field', value: args.aiCopy.quick_spec_tagline },
    { namespace: 'custom', key: 'quick_spec_overview', type: 'multi_line_text_field', value: args.aiCopy.quick_spec_overview },
    { namespace: 'custom', key: 'specifications', type: 'json', value: JSON.stringify(args.aiCopy.specifications) },
    { namespace: 'custom', key: 'who_its_great_for', type: 'json', value: JSON.stringify(args.aiCopy.who_its_great_for) },
    { namespace: 'custom', key: 'supplier_name', type: 'single_line_text_field', value: args.scrapedData.brand || 'Supplier' },
    { namespace: 'custom', key: 'supplier_product_url', type: 'url', value: args.productLink },
    { namespace: 'custom', key: 'source_product_url', type: 'url', value: args.productLink },
    { namespace: 'custom', key: 'pricing_decoration_method', type: 'single_line_text_field', value: decorationLabel(args.decorationType) },
    { namespace: 'custom', key: 'available_decoration_methods', type: 'list.single_line_text_field', value: metafieldList(args.aiCopy.available_decoration_methods) },
    { namespace: 'custom', key: 'decoration_guide', type: 'multi_line_text_field', value: args.aiCopy.decoration_guide },
    { namespace: 'custom', key: 'product_faqs', type: 'json', value: JSON.stringify(args.aiCopy.product_faqs) },
    { namespace: 'custom', key: 'show_content_description', type: 'boolean', value: 'true' },
    { namespace: 'custom', key: 'enrichment_version', type: 'number_integer', value: '5' },
    { namespace: 'custom', key: 'last_enriched_at', type: 'date_time', value: (args.enrichedAt || new Date()).toISOString() },
  ];

  if (args.industryCollectionIds?.length) {
    metafields.push({
      namespace: 'custom',
      key: 'industries',
      type: 'list.collection_reference',
      value: JSON.stringify(args.industryCollectionIds),
    });
  }

  const linkStrategy = INTERNAL_LINK_STRATEGIES[args.aiCopy.product_category];
  if (linkStrategy) {
    for (const { key, keyword } of linkStrategy.fields) {
      const value = richTextWithLinkedKeyword(args.aiCopy[key], keyword, linkStrategy.collectionUrl);
      if (value) metafields.push({ namespace: 'custom', key, type: 'rich_text_field', value });
    }
  }

  const payload: ShopifyPayload = {
    title: args.scrapedData.title || 'Untitled Apparel Product',
    bodyHtml: buildBodyHtml(args.scrapedData),
    vendor: args.scrapedData.brand || 'Unknown',
    productType: 'Apparel',
    status: 'DRAFT',
    tags: ['custom-quote', args.decorationType, 'apparel', args.aiCopy.product_category, ...args.aiCopy.industry_handles].filter(Boolean),
    templateSuffix: 'custom-quote',
    options: ['Color', 'Size'],
    variants,
    metafields,
  };

  return { pricing, payload };
}
