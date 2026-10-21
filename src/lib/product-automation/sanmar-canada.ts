import type { ScrapedProductData } from './types';

export const isSanmarCanadaUrl = (url: URL) => /^(?:www\.)?sanmarcanada\.com$/i.test(url.hostname);

const text = (html: string) => {
  let value = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  // Some Magento attributes contain nested encodings. Titles also use Windows-1252's trademark entity.
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', reg: '®', trade: '™', ndash: '–', mdash: '—', rsquo: '’' };
  for (let pass = 0; pass < 3; pass++) {
    value = value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (!code.startsWith('#')) return named[code.toLowerCase()] ?? entity;
      const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      if (point === 153) return '™';
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
    });
  }
  return value.replace(/\s+/g, ' ').trim();
};

const attribute = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'))?.[2] || '';

function descriptionTab(html: string) {
  const opening = /<div\b[^>]*\bid\s*=\s*["']tab1["'][^>]*>/i.exec(html);
  if (!opening) return '';
  const start = opening.index + opening[0].length;
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = start;
  let depth = 1;
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    depth += /^<\//.test(match[0]) ? -1 : 1;
    if (!depth) return html.slice(start, match.index);
  }
  return '';
}

export function parseSanmarCanadaProduct(html: string): ScrapedProductData {
  const form = (html.match(/<form\b[^>]*>/gi) || []).find(tag => attribute(tag, 'data-product-sku')) || '';
  const sku = text(attribute(form, 'data-product-sku'));
  const title = text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
  const descriptionHtml = descriptionTab(html).split(/<div\b[^>]*class=["']disclaimer\b/i)[0];
  const lines = Array.from(descriptionHtml.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)).map(match => text(match[1]));
  const rawDescription = text(descriptionHtml.replace(/<\/(?:li|p)>/gi, '; ')).replace(/(?:;\s*)+$/g, '');
  if (!sku || !title || !rawDescription) {
    throw new Error('SanMar Canada product details are missing. Use a product page link, not a catalogue or homepage link.');
  }
  const brandMeta = (html.match(/<meta\b[^>]*>/gi) || []).find(tag => attribute(tag, 'itemprop') === 'brand') || '';
  const metaBrand = text(attribute(brandMeta, 'content'));
  const brand = /^ATC(?:\b|™)/i.test(title) ? 'ATC'
    : /^(?:DISCONTINUED\s+)?CH ESSENTIAL\b/i.test(title) ? 'CH Essential'
    : metaBrand === 'CoalHarbour_CH' ? 'Coal Harbour' : metaBrand;
  const fabricLine = lines.find(line => /\d+\s*%|\d+\s*\/\s*\d+\s+[a-z]/i.test(line)) || '';
  const fabric = fabricLine.replace(/^.*?((?:\d+\s*%|\d+\s*\/\s*\d+)\s*[a-z])/i, '$1');
  const weight = (lines.join('; ').match(/\d+(?:\.\d+)?[-\s]*(?:oz\.?(?:\s*\/\s*(?:ly|l\s*yd|sq\.?\s*yd|yd[²2]?))?|g\/m[²2]|gsm)(?:\s*\((?:CA|US|EU)\))?/gi) || []).join(', ');
  return {
    title, brand, sku, fabric, weight, raw_description: rawDescription,
    confidence: {
      title: 'high', brand: brand ? 'high' : 'missing', sku: 'high',
      fabric: fabric ? 'medium' : 'missing', weight: weight ? 'medium' : 'missing', raw_description: 'high',
    },
  };
}
