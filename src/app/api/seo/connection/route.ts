import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSessionFromRequestFull } from '@/lib/auth';
import { gscApi } from '@/lib/gsc-service';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';

// Admin diagnostic: which properties the agency's stored Google connection can read,
// compared against the property URLs configured for each SEO client.
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequestFull(req);
  if (!session || session.role !== 'ADMIN' || session.mustChangePassword) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const headers = { 'Cache-Control': 'no-store' };
  const stored = await prisma.gscConnection.findUnique({ where: { id: 'agency' }, select: { updatedAt: true } }).catch(() => null);
  const connection = stored ? { source: 'database', connectedAt: stored.updatedAt } : { source: process.env.GOOGLE_REFRESH_TOKEN ? 'environment (GOOGLE_REFRESH_TOKEN)' : 'none' };
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: clients } = await db.from('seo_clients').select('slug,name,gsc_property_url');
  try {
    const { data } = await (await gscApi()).sites.list({}, { timeout: 15000, retry: false });
    const sites = (data.siteEntry || []).map(s => ({ siteUrl: s.siteUrl, permissionLevel: s.permissionLevel }));
    return NextResponse.json({
      connection,
      accessibleSites: sites,
      clients: (clients || []).map(c => ({ ...c, permissionLevel: sites.find(s => s.siteUrl === c.gsc_property_url)?.permissionLevel ?? 'notAccessible' })),
    }, { headers });
  } catch (error) {
    const e = error as { message?: string; response?: { status?: number; data?: { error?: unknown; error_description?: unknown } } };
    const googleError = e.response?.data?.error;
    return NextResponse.json({
      connection,
      clients,
      error: { status: e.response?.status, google: typeof googleError === 'object' ? googleError : { error: googleError, description: e.response?.data?.error_description }, message: e.message },
    }, { status: 502, headers });
  }
}
