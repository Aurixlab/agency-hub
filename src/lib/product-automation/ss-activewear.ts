import type { ScrapedProductData } from './types';

const SS_API_BASE = 'https://api.ssactivewear.com/v2';
const SS_CANADA_API_BASE = 'https://api-ca.ssactivewear.com/v2';

interface SsStyle {
  styleID?: number;
  partNumber?: string;
  brandName?: string;
  styleName?: string;
  title?: string;
  description?: string;
}

export const isSsActivewearUrl = (url: URL) => /(^|\.)ssactivewear\.com$/i.test(url.hostname);

export const ssActivewearCredentials = () => {
  const accountNumber = process.env.SS_ACTIVEWEAR_ACCOUNT_NUMBER?.trim();
  const apiKey = process.env.SS_ACTIVEWEAR_API_KEY?.trim();
  return accountNumber && apiKey ? { accountNumber, apiKey } : null;
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

// S&S product pages look like /p/{brand-slug}/{style}, e.g. /p/gildan/5000 or /p/bella/3001cvc.
export function parseSsActivewearUrl(url: URL) {
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const productIndex = segments.findIndex(segment => segment.toLowerCase() === 'p');
  if (productIndex >= 0 && segments[productIndex + 2]) {
    return { brandSlug: segments[productIndex + 1], style: segments[productIndex + 2] };
  }
  const style = segments.at(-1);
  if (!style) throw new Error('Could not find a style number in the S&S Activewear link');
  return { brandSlug: '', style };
}

export function pickSsStyle(styles: SsStyle[], style: string, brandSlug: string) {
  const sameStyle = styles.filter(item => normalize(item.styleName || '') === normalize(style));
  const brand = normalize(brandSlug.replace(/[-_]/g, ' '));
  return (brand && sameStyle.find(item => {
    const brandName = normalize(item.brandName || '');
    return brandName.startsWith(brand) || brand.startsWith(brandName);
  })) || sameStyle[0] || null;
}

const descriptionText = (html: string) =>
  html
    .replace(/<\/li>/gi, '; ')
    .replace(/<br\s*\/?>/gi, '; ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(;\s*)+/g, '; ')
    .replace(/^[;\s]+|[;\s]+$/g, '')
    .trim();

export function extractFabricAndWeight(description: string) {
  const text = descriptionText(description);
  const weight = text.match(/\d+(?:\.\d+)?\s*oz\.?(?:\s*\/\s*(?:yd²|yd2|sq\.?\s*yd\.?|linear\s*yd\.?|l\s*yd\.?))?/i)?.[0]?.trim() || '';
  const fabricText = text.replace(/\bU\.S\./gi, 'US');
  const fabric = fabricText.match(/\d{1,3}%\s*[a-z][^;.,%]*?(?:,\s*\d{1,3}%\s*[a-z][^;.,%]*?)*(?=[;.]|$|,\s*(?!\d{1,3}%))/i)?.[0]?.trim() || '';
  return { fabric, weight };
}

export function ssStyleToScrapedData(style: SsStyle): ScrapedProductData {
  const brand = style.brandName?.trim() || '';
  const sku = style.styleName?.trim() || '';
  const title = [brand, sku, style.title?.trim()].filter(Boolean).join(' ');
  const rawDescription = descriptionText(style.description || '');
  const { fabric, weight } = extractFabricAndWeight(style.description || '');

  return {
    title,
    brand,
    sku,
    fabric,
    weight,
    raw_description: rawDescription,
    confidence: {
      title: title ? 'high' : 'missing',
      brand: brand ? 'high' : 'missing',
      sku: sku ? 'high' : 'missing',
      fabric: fabric ? 'medium' : 'missing',
      weight: weight ? 'medium' : 'missing',
      raw_description: rawDescription ? 'high' : 'missing',
    },
  };
}

export async function fetchSsActivewearProduct(
  url: URL,
  credentials: { accountNumber: string; apiKey: string }
): Promise<ScrapedProductData> {
  const { brandSlug, style } = parseSsActivewearUrl(url);
  const canadian = /^(?:en-ca|fr-ca|api-ca)\.ssactivewear\.com$/i.test(url.hostname);
  const primaryBase = canadian ? SS_CANADA_API_BASE : SS_API_BASE;
  const alternateBase = canadian ? SS_API_BASE : SS_CANADA_API_BASE;
  const request = (base: string) => fetch(`${base}/styles?search=${encodeURIComponent(style)}&mediatype=json`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.accountNumber}:${credentials.apiKey}`).toString('base64')}`,
      Accept: 'application/json',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  let response = await request(primaryBase);
  // Accounts authenticate in their own region, even when the pasted link is from the other site.
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel();
    response = await request(alternateBase);
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(`S&S API rejected the account number or API key (${response.status})`);
  }
  if (response.status === 404) throw new Error(`S&S API found no style matching "${style}"`);
  if (!response.ok) throw new Error(`S&S API returned ${response.status}`);

  const styles = await response.json() as SsStyle[];
  const match = pickSsStyle(Array.isArray(styles) ? styles : [], style, brandSlug);
  if (!match) throw new Error(`S&S API found no style matching "${style}"`);
  return ssStyleToScrapedData(match);
}
