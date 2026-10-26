import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { fetchSsActivewearProduct, isSsActivewearUrl, ssActivewearCredentials } from './ss-activewear';
import { isSanmarCanadaUrl, parseSanmarCanadaProduct } from './sanmar-canada';
import { fetchSanmarSportsProduct, isSanmarSportsUrl } from './sanmar-sports';
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

const privateIPv4 = (ip: string) => {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
};

const privateAddress = (address: string) => {
  const ip = address.toLowerCase();
  if (isIP(ip) === 4) return privateIPv4(ip);
  if (ip === '::' || ip === '::1') return true;
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateIPv4(mapped[1]);
  return ip.startsWith('::ffff:') || /^(fc|fd|fe[89ab])/.test(ip);
};

// The server fetches user-supplied links, so refuse loopback, private, link-local and metadata targets (SSRF).
async function assertPublicHttpUrl(url: URL) {
  const blocked = new Error('Product link must point to a public website');
  if (!['http:', 'https:'].includes(url.protocol)) throw blocked;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || /\.(localhost|local|internal|localdomain)$/.test(host)) throw blocked;
  if (isIP(host)) {
    if (privateAddress(host)) throw blocked;
    return;
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    return; // Unresolvable hosts fail in fetch with the usual error.
  }
  if (addresses.some(entry => privateAddress(entry.address))) throw blocked;
}

export async function scrapeProductPage(productLink: string): Promise<ScrapedProductData> {
  let url: URL;
  try {
    url = new URL(productLink);
  } catch {
    throw new Error('Product link must be a valid URL');
  }

  // S&S pages sit behind Cloudflare, so use their official API when credentials are configured.
  const ssCredentials = ssActivewearCredentials();
  if (ssCredentials && isSsActivewearUrl(url)) return fetchSsActivewearProduct(url, ssCredentials);
  if (isSanmarSportsUrl(url)) return fetchSanmarSportsProduct(url);

  // Follow redirects manually so every hop is checked against the same public-host rule.
  let target = url;
  let response: Response;
  for (let hops = 0; ; hops++) {
    await assertPublicHttpUrl(target);
    response = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'AgencyHub-SPAE/1.0 (+https://aurixlab.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'manual',
    });
    const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null;
    if (!location) break;
    if (hops >= 5) throw new Error('Supplier page redirected too many times');
    target = new URL(location, target);
  }
  if (!response.ok) {
    if (isSanmarCanadaUrl(url) && response.status === 403) {
      throw new Error('SanMar Canada blocked requests from the app server (403). Open the product page in your browser and click Send to Aurix, or use Paste page source in Scraped Data.');
    }
    if (/(^|\.)hellyhansen\.com$/i.test(url.hostname) && response.status === 403) {
      throw new Error('Helly Hansen blocked automated access (403). Open the product page in your browser and click Send to Aurix, or use Paste page source in Scraped Data.');
    }
    if (response.status === 403) {
      throw new Error('Supplier page returned 403. Open the product page in your browser and click Send to Aurix, or use Paste page source in Scraped Data.');
    }
    throw new Error(`Supplier page returned ${response.status}`);
  }

  return parseProductHtml(url, await response.text());
}

// Parses supplier HTML fetched by the server or captured from the user's browser.
export function parseProductHtml(url: URL, html: string): ScrapedProductData {
  if (isSanmarCanadaUrl(url)) return parseSanmarCanadaProduct(html);
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
