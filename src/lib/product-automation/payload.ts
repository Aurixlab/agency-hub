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

const listHtml = (title: string, items: string[]) => {
  if (!items.length) return '';
  return `<h3>${escapeHtml(title)}</h3><ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
};

export function buildBodyHtml(scrapedData: ScrapedProductData, aiCopy: AiProductCopy) {
  const parts = [
    scrapedData.raw_description ? `<p>${escapeHtml(scrapedData.raw_description)}</p>` : '',
    listHtml('Key Features', aiCopy.key_features),
    listHtml('Best Use', aiCopy.best_use),
    listHtml('Material & Care', aiCopy.material_care),
    listHtml('Customization & Fit', aiCopy.customization_fit),
  ].filter(Boolean);

  return parts.join('\n');
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
  const pricingMetafieldKey = args.decorationType === 'print' ? 'bulk_print_pricing' : 'bulk_embroidery_pricing';

  const payload: ShopifyPayload = {
    title: args.scrapedData.title || 'Untitled Apparel Product',
    bodyHtml: buildBodyHtml(args.scrapedData, args.aiCopy),
    vendor: args.scrapedData.brand || 'Unknown',
    productType: 'Apparel',
    status: 'DRAFT',
    tags: ['custom-quote', args.decorationType, 'apparel'].filter(Boolean),
    templateSuffix: 'custom-quote',
    options: ['Color', 'Size'],
    variants,
    metafields: [
      { namespace: 'custom', key: 'brand', type: 'single_line_text_field', value: args.scrapedData.brand || '' },
      { namespace: 'custom', key: 'sku', type: 'single_line_text_field', value: args.scrapedData.sku || '' },
      { namespace: 'custom', key: 'decoration_type', type: 'single_line_text_field', value: args.decorationType },
      { namespace: 'custom', key: 'theme', type: 'single_line_text_field', value: 'custom-quote' },
      { namespace: 'ai', key: 'product_features_texts', type: 'json', value: JSON.stringify(args.aiCopy.key_features) },
      { namespace: 'ai', key: 'best_use_texts', type: 'json', value: JSON.stringify(args.aiCopy.best_use) },
      { namespace: 'ai', key: 'material_care_texts', type: 'json', value: JSON.stringify(args.aiCopy.material_care) },
      { namespace: 'ai', key: 'customization_fit_texts', type: 'json', value: JSON.stringify(args.aiCopy.customization_fit) },
      { namespace: 'ai', key: 'seo_description', type: 'multi_line_text_field', value: args.aiCopy.seo_description || '' },
      { namespace: 'pricing', key: pricingMetafieldKey, type: 'json', value: JSON.stringify(pricing.tiers) },
    ],
  };

  return { pricing, payload };
}
