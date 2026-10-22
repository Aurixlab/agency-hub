import { parseProductHtml } from './scraper';
import type { ScrapedProductData } from './types';

// Vercel rejects request bodies over 4.5 MB; the bookmarklet strips scripts and styles first.
export const MAX_CAPTURE_HTML_LENGTH = 4_000_000;

const siteHost = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, '');

const httpUrl = (value: string, label: string) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${label} must be a valid URL`);
  return url;
};

// Parses a page the user captured in their own browser, for suppliers that block the app server.
export function parseCapturedPage(productLink: string, capturedUrl: unknown, html: unknown): ScrapedProductData {
  if (typeof html !== 'string' || !html.trim()) throw new Error('Captured page is empty. Copy the full page source and try again.');
  if (html.length > MAX_CAPTURE_HTML_LENGTH) throw new Error('Captured page is too large. Use Send to Aurix, which removes scripts and styles first.');

  const runUrl = httpUrl(productLink, 'Product link');
  // Pasted source has no URL of its own, so it is parsed as the run's product page.
  const pageUrl = typeof capturedUrl === 'string' && capturedUrl ? httpUrl(capturedUrl, 'Captured page URL') : runUrl;
  if (siteHost(pageUrl) !== siteHost(runUrl)) {
    throw new Error(`Captured page is from ${pageUrl.hostname}, but this run's product link is on ${runUrl.hostname}.`);
  }
  return parseProductHtml(pageUrl, html);
}
