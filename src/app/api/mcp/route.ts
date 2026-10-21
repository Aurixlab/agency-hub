import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { analyticsShape, analyticsSchema } from '@/lib/gsc-query';
import { queryAnalytics, listClients, inspectUrl, clientProperty, gscApi } from '@/lib/gsc-service';
import { verifyAccess, oauthConfig } from '@/lib/mcp-auth';
import { readMcpBody } from '@/lib/mcp-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
async function result(work: () => Promise<unknown>) {
  try { return { content: [{ type: 'text' as const, text: JSON.stringify(await work()) }] }; }
  catch (error) {
    // Never serialize upstream errors: Google client errors may contain credentials.
    const message = error instanceof z.ZodError ? error.issues.map(i => i.message).join('; ') : 'GSC request failed. Check the approved client, Google access, credentials and quotas in Agency Hub.';
    return { isError: true, content: [{ type: 'text' as const, text: message }] };
  }
}
function createServer() {
  const server = new McpServer({ name: 'aurixlab-gsc', version: '1.0.0' });
  server.registerTool('list_clients', { description: 'List explicitly approved clients and verify Google property access.', inputSchema: {}, annotations }, () => result(listClients));
  server.registerTool('get_performance', { description: 'Fetch GSC metrics by date, hour, query, page, country or device. CTR is a fraction. Request dimensions=[] for property totals; paginate using nextStartRow. Fresh data is delayed and provisional.', inputSchema: analyticsShape, annotations }, args => result(() => queryAnalytics(analyticsSchema.parse(args))));
  for (const [name, dimension] of [['get_queries', 'query'], ['get_pages', 'page']] as const) {
    const { dimensions: _dimensions, ...shape } = analyticsShape;
    server.registerTool(name, { description: `Fetch ${dimension} performance with filters and explicit pagination. Daily data only; use get_performance for hourly data.`, inputSchema: { ...shape, dataState: z.enum(['final', 'all']).default('final') }, annotations }, args => result(() => queryAnalytics(analyticsSchema.parse({ ...args, dimensions: [dimension] }))));
  }
  server.registerTool('compare_periods', { description: 'Compare property totals for two explicit date ranges using identical filters. CTR changes are percentage points; position change is current minus previous (negative improves).', inputSchema: { ...analyticsShape, previousStartDate: analyticsShape.startDate, previousEndDate: analyticsShape.endDate }, annotations }, args => result(async () => {
    const currentArgs = analyticsSchema.parse({ ...args, dimensions: [] });
    if (currentArgs.dataState === 'hourly_all') throw new Error('Use daily data for property totals');
    const [current, previous] = await Promise.all([
      queryAnalytics(currentArgs),
      queryAnalytics(analyticsSchema.parse({ ...currentArgs, startDate: args.previousStartDate, endDate: args.previousEndDate })),
    ]);
    const a = current.rows[0]; const b = previous.rows[0];
    const percent = (x?: number | null, y?: number | null) => y ? ((x || 0) - y) / y * 100 : null;
    return { current, previous, changes: a && b ? { clicksPercent: percent(a.clicks, b.clicks), impressionsPercent: percent(a.impressions, b.impressions), ctrPercentagePoints: ((a.ctr || 0) - (b.ctr || 0)) * 100, position: (a.position || 0) - (b.position || 0) } : null };
  }));
  server.registerTool('inspect_url', { description: 'Inspect Google’s indexed version of a URL within an approved property. This does not run a live test.', inputSchema: { client: analyticsShape.client, url: z.string().url() }, annotations }, args => result(() => inspectUrl(args.client, args.url)));
  server.registerTool('get_sitemaps', { description: 'List submitted sitemaps. These are not complete site indexing coverage totals.', inputSchema: { client: analyticsShape.client }, annotations }, args => result(async () => {
    const client = await clientProperty(args.client);
    const { data } = await (await gscApi()).sitemaps.list({ siteUrl: client.gsc_property_url }, { timeout: 15000, retry: false });
    return { client, retrievedAt: new Date().toISOString(), sitemaps: data.sitemap || [] };
  }));
  return server;
}

async function authenticatedHandler(req: Request) {
  try {
    const config = oauthConfig();
    if (req.headers.get('origin') && req.headers.get('origin') !== config.origin) return Response.json({ error: 'Invalid origin' }, { status: 403 });
    const header = req.headers.get('authorization') || '';
    const auth = await verifyAccess(header.startsWith('Bearer ') ? header.slice(7) : undefined);
    if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store', 'WWW-Authenticate': `Bearer resource_metadata="${config.origin}/.well-known/oauth-protected-resource/api/mcp", scope="gsc:read"` } });
    let parsedBody: unknown;
    if (req.method === 'POST') {
      try { parsedBody = await readMcpBody(req); }
      catch { return Response.json({ error: 'Invalid JSON, request too large or too deeply nested' }, { status: 400 }); }
    }
    const server = createServer();
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(req, { authInfo: auth, parsedBody });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } finally { await server.close(); }
  } catch { return Response.json({ error: 'MCP is not configured' }, { status: 503 }); }
}
export { authenticatedHandler as GET, authenticatedHandler as POST, authenticatedHandler as DELETE };
