import type { Confidence, ScrapedProductData } from './types';

const decodeEntities = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

const stripTags = (html: string) =>
  decodeEntities(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const textFromMatch = (html: string, regex: RegExp) => {
  const match = html.match(regex);
  return match?.[1] ? stripTags(match[1]) : '';
};

const metaContent = (html: string, key: string) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return textFromMatch(
    html,
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i')
  ) || textFromMatch(
    html,
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
  );
};

const jsonLdValues = (html: string) => {
  const values: Record<string, string> = {};
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const block of blocks) {
    const raw = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const product = items.flatMap(item => Array.isArray(item?.['@graph']) ? item['@graph'] : [item])
        .find(item => String(item?.['@type'] || '').toLowerCase().includes('product'));
      if (product) {
        values.title ||= String(product.name || '');
        values.brand ||= typeof product.brand === 'string' ? product.brand : String(product.brand?.name || '');
        values.sku ||= String(product.sku || product.mpn || '');
        values.raw_description ||= String(product.description || '');
      }
    } catch {}
  }
  return values;
};

const findLabeledValue = (text: string, labels: string[]) => {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}\\s*[:#-]?\\s*([^|\\n\\r]{2,80})`, 'i'));
    if (match?.[1]) return match[1].replace(/\s{2,}.*/, '').trim();
  }
  return '';
};

const confidence = (value: string, highWhen = false): Confidence => {
  if (!value) return 'missing';
  return highWhen ? 'high' : 'medium';
};

export async function scrapeProductPage(productLink: string): Promise<ScrapedProductData> {
  let url: URL;
  try {
    url = new URL(productLink);
  } catch {
    throw new Error('Product link must be a valid URL');
  }

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'AgencyHub-SPAE/1.0 (+https://aurixlab.com)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) throw new Error(`Supplier page returned ${response.status}`);

  const html = await response.text();
  const pageText = stripTags(html);
  const jsonLd = jsonLdValues(html);

  const title = jsonLd.title
    || metaContent(html, 'og:title')
    || textFromMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)
    || textFromMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawDescription = jsonLd.raw_description
    || metaContent(html, 'og:description')
    || metaContent(html, 'description')
    || textFromMatch(html, /<(?:section|div|p)[^>]+(?:class|id)=["'][^"']*(?:description|product-description)[^"']*["'][^>]*>([\s\S]*?)<\/(?:section|div|p)>/i);
  const brand = jsonLd.brand
    || metaContent(html, 'product:brand')
    || findLabeledValue(pageText, ['Brand', 'Manufacturer', 'Vendor']);
  const sku = jsonLd.sku
    || metaContent(html, 'product:retailer_item_id')
    || findLabeledValue(pageText, ['SKU', 'Style', 'Item', 'Product Code', 'Model']);
  const fabric = findLabeledValue(pageText, ['Fabric', 'Material', 'Fabric Content', 'Content']);
  const weight = findLabeledValue(pageText, ['Weight', 'Product Weight', 'Fabric Weight']);

  return {
    title,
    brand,
    sku,
    fabric,
    weight,
    raw_description: rawDescription,
    confidence: {
      title: confidence(title, Boolean(jsonLd.title || metaContent(html, 'og:title'))),
      brand: confidence(brand, Boolean(jsonLd.brand || metaContent(html, 'product:brand'))),
      sku: confidence(sku, Boolean(jsonLd.sku || metaContent(html, 'product:retailer_item_id'))),
      fabric: confidence(fabric),
      weight: confidence(weight),
      raw_description: confidence(rawDescription, Boolean(jsonLd.raw_description || metaContent(html, 'description'))),
    },
  };
}
