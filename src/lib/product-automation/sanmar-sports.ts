import type { ScrapedProductData } from './types';

export const isSanmarSportsUrl = (url: URL) => /^(?:www\.)?sanmarsports\.com$/i.test(url.hostname);

const text = (html: string) => html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => {
    const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
  })
  .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&nbsp;/gi, ' ')
  .replace(/&reg;/gi, '®').replace(/&trade;/gi, '™').replace(/&amp;/gi, '&')
  .replace(/\s+/g, ' ').trim();

interface SportsProduct {
  title?: string;
  vendor?: string;
  handle?: string;
  description?: string;
  variants?: Array<{ id?: number; sku?: string }>;
}

export function parseSanmarSportsProduct(product: SportsProduct, variantId: string | null = null): ScrapedProductData {
  const title = text(product.title || '');
  const brand = text(product.vendor || '');
  const description = product.description || '';
  const rawDescription = text(description.replace(/<\/(?:p|li|div)>|<br\s*\/?>/gi, '; ')).replace(/(?:;\s*)+$/g, '');
  if (!title || !rawDescription || !product.handle) throw new Error('SanMar Sports returned incomplete product details.');

  // Their variant SKU is a stock identifier; the style at the end of the title matches the product handle.
  const titleStyle = title.match(/(?:^|\s)([a-z0-9][a-z0-9.-]*\d[a-z0-9.-]*)$/i)?.[1];
  const normalize = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const variant = variants.find(item => String(item.id) === variantId) || variants[0];
  const sku = titleStyle && normalize(titleStyle) === normalize(product.handle)
    ? titleStyle.toUpperCase() : String(variant?.sku || '').trim();
  const lines = Array.from(description.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)).map(match => text(match[1]));
  const fabricLine = lines.find(line => /\d+\s*%|\d+\s*\/\s*\d+\s+[a-z]/i.test(line)) || '';
  const fabric = fabricLine.replace(/^.*?((?:\d+\s*%|\d+\s*\/\s*\d+)\s*[a-z])/i, '$1');
  // Capacity references such as "pockets fit 32-ounce bottles" are not fabric weight.
  const weightLines = lines.filter(line => /^(?:fabric\s+weight\s*[:\-]?\s*)?\d+(?:\.\d+)?[-\s]*(?:ounces?\b|oz\b|gsm\b|g\/m[²2])/i.test(line)
    && !/\b(?:bottles?|capacity)\b/i.test(line));
  const weight = (weightLines.join('; ').match(/\d+(?:\.\d+)?[-\s]*(?:ounces?\b|oz\b\.?|gsm\b|g\/m[²2])(?:\s*\/\s*(?:yd[²2]?|sq\.?\s*yd|ly))?/gi) || []).join(', ');
  return {
    title, brand, sku, fabric, weight, raw_description: rawDescription,
    confidence: {
      title: 'high', brand: brand ? 'high' : 'missing', sku: sku ? 'high' : 'missing',
      fabric: fabric ? 'medium' : 'missing', weight: weight ? 'medium' : 'missing', raw_description: 'high',
    },
  };
}

export async function fetchSanmarSportsProduct(url: URL): Promise<ScrapedProductData> {
  if (!isSanmarSportsUrl(url) || !['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid SanMar Sports product URL.');
  const match = url.pathname.match(/^(?:\/[a-z]{2}(?:-[a-z]{2})?)?(?:\/collections\/[^/]+)?\/products\/([^/]+)\/?$/i);
  if (!match) throw new Error('Use a direct SanMar Sports product link, such as /products/bc4540, not the product catalogue.');
  const productPath = url.pathname.replace(/\/$/, '').replace(/\.(?:js|json)$/i, '');
  const endpoint = new URL(`${productPath}.js`, 'https://sanmarsports.com');
  const response = await fetch(endpoint.toString(), {
    headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404) throw new Error('SanMar Sports product was not found. Check the product link.');
  if (!response.ok) throw new Error(`SanMar Sports product data returned ${response.status}`);
  return parseSanmarSportsProduct(await response.json(), url.searchParams.get('variant'));
}
