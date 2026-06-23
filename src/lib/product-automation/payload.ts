import { calculatePricing } from './pricing';
import { generateVariants } from './variants';
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

export function buildBodyHtml(scrapedData: ScrapedProductData) {
  return scrapedData.raw_description ? `<p>${escapeHtml(scrapedData.raw_description)}</p>` : '';
}

export function composeShopifyPayload(args: {
  scrapedData: ScrapedProductData;
  aiCopy: AiProductCopy;
  basePrice: number;
  decorationType: DecorationType;
  colors: string[];
}): { pricing: PricingTable; payload: ShopifyPayload } {
  const pricing = calculatePricing(args.basePrice, args.decorationType);
  const sellPrice = pricing.tiers[0]?.price ?? args.basePrice;
  const variants = generateVariants(args.colors, args.scrapedData.sku, sellPrice);
  const lowestTier = pricing.tiers[pricing.tiers.length - 1];

  const payload: ShopifyPayload = {
    title: args.scrapedData.title || 'Untitled Apparel Product',
    bodyHtml: buildBodyHtml(args.scrapedData),
    vendor: args.scrapedData.brand || 'Unknown',
    productType: 'Apparel',
    status: 'DRAFT',
    tags: ['custom-quote', args.decorationType, 'apparel'].filter(Boolean),
    templateSuffix: 'custom-quote',
    options: ['Color', 'Size'],
    variants,
    metafields: [
      { namespace: 'custom', key: 'brand', type: 'single_line_text_field', value: args.scrapedData.brand || '' },
      { namespace: 'custom', key: 'quality', type: 'single_line_text_field', value: 'Standard' },
      { namespace: 'custom', key: 'sub_category', type: 'single_line_text_field', value: 'Apparel' },
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
    ],
  };

  return { pricing, payload };
}
