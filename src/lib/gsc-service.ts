import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { analyticsSchema, type AnalyticsInput } from './gsc-query';
import { prisma } from './prisma';
import { decryptToken } from './posting/crypto';

export async function gscApi() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error('Google Search Console credentials are not configured');
  let refreshToken = GOOGLE_REFRESH_TOKEN;
  try {
    const connection = await prisma.gscConnection.findUnique({ where: { id: 'agency' } });
    if (connection) refreshToken = decryptToken(connection.ciphertext, connection.iv, connection.tag);
  } catch (error) {
    // Preserve existing environment-based installations until the table is provisioned.
    if (!refreshToken) throw error;
  }
  if (!refreshToken) throw new Error('Connect Google Search Console as an administrator first');
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.searchconsole({ version: 'v1', auth });
}

export async function approvedClients() {
  const allowed = (process.env.GSC_ALLOWED_CLIENT_SLUGS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.length) throw new Error('GSC_ALLOWED_CLIENT_SLUGS must explicitly allow the client slugs');
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await db.from('seo_clients').select('slug,name,gsc_property_url').in('slug', allowed);
  if (error) throw new Error('Unable to load approved GSC clients');
  return data || [];
}

export async function clientProperty(slug: string) {
  const client = (await approvedClients()).find(c => c.slug === slug);
  if (!client?.gsc_property_url) throw new Error('Client is not approved or has no GSC property');
  return client;
}

export async function listClients() {
  const clients = await approvedClients();
  const { data } = await (await gscApi()).sites.list({}, { timeout: 15000, retry: false });
  return clients.map(c => ({ ...c, permissionLevel: data.siteEntry?.find(s => s.siteUrl === c.gsc_property_url)?.permissionLevel ?? 'notAccessible' }));
}

export async function queryAnalytics(input: AnalyticsInput) {
  const args = analyticsSchema.parse(input);
  const client = await clientProperty(args.client);
  const { data } = await (await gscApi()).searchanalytics.query({
    siteUrl: client.gsc_property_url,
    requestBody: {
      startDate: args.startDate, endDate: args.endDate, dimensions: args.dimensions,
      dataState: args.dataState, type: args.type, rowLimit: args.rowLimit, startRow: args.startRow,
      ...(args.filters.length ? { dimensionFilterGroups: [{ filters: args.filters }] } : {}),
    },
  }, { timeout: 15000, retry: false });
  const rows = data.rows || [];
  // googleapis' older generated types omit hourly metadata, but the REST API returns it.
  const metadata = (data as typeof data & { metadata?: unknown }).metadata ?? null;
  return {
    client, startDate: args.startDate, endDate: args.endDate, dimensions: args.dimensions,
    type: args.type, filters: args.filters, dataState: args.dataState, retrievedAt: new Date().toISOString(),
    timezone: 'America/Los_Angeles', ctrUnit: 'fraction', metadata,
    provisional: args.dataState !== 'final', rows,
    nextStartRow: rows.length === args.rowLimit ? args.startRow + rows.length : null,
    limitations: 'GSC returns top rows, omits private query text, and has daily export limits. Grouped rows may not sum to property totals. Fresh data is delayed and may change. Hour rows include timezone offsets.',
  };
}

export async function inspectUrl(slug: string, inspectionUrl: string) {
  const client = await clientProperty(slug);
  const url = new URL(inspectionUrl);
  const property = client.gsc_property_url as string;
  const domain = property.startsWith('sc-domain:') ? property.slice(10) : null;
  if (!['http:', 'https:'].includes(url.protocol) || (domain ? url.hostname !== domain && !url.hostname.endsWith(`.${domain}`) : !url.href.startsWith(property))) throw new Error('URL is outside the approved property');
  const { data } = await (await gscApi()).urlInspection.index.inspect({ requestBody: { siteUrl: property, inspectionUrl: url.href } }, { timeout: 15000, retry: false });
  return { client, retrievedAt: new Date().toISOString(), ...data, note: 'Reports Google’s indexed version; this is not a live URL test.' };
}
