import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSiteMetrics, getKeywordRankings } from '@/lib/gsc';
import { getSessionFromRequestFull } from '@/lib/auth';
import { matches } from '@/lib/mcp-auth';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Explain failures without exposing tokens or raw Google responses.
function syncFailure(error: unknown) {
  const e = error as { message?: string; code?: unknown; response?: { status?: number; data?: { error?: unknown } } };
  const status = e.response?.status;
  const googleError = e.response?.data?.error;
  if (googleError === 'invalid_grant') return 'The Google connection has expired or was revoked. An admin must click Connect Google again.';
  if (googleError === 'invalid_client') return 'Google rejected the OAuth client credentials. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.';
  if (status === 403) return 'The connected Google account has no access to this Search Console property. Add it as a user in Search Console or reconnect with an account that has access.';
  if (status === 401) return 'Google rejected the stored credentials. An admin must click Connect Google again.';
  if (status === 429) return 'Google Search Console quota exceeded. Try again later.';
  if (/not configured|Connect Google/.test(e.message || '')) return e.message!;
  if (typeof e.code === 'string' && /^(P\d{4}|\d{5}|PGRST)/.test(e.code)) return 'Could not save the synced data to the database.';
  if (/timeout|ETIMEDOUT|aborted/i.test(e.message || '')) return 'Google Search Console took too long to respond. Try a shorter date range.';
  return 'Sync failed; check Google access, credentials, quotas and database configuration.';
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const cron = secret && matches(req.headers.get('authorization') || '', `Bearer ${secret}`);
  const session = cron ? null : await getSessionFromRequestFull(req);
  if (!cron && (!session || !['ADMIN', 'MEMBER'].includes(session.role) || session.mustChangePassword)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.session.deleteMany({ where: { token: { startsWith: 'mcp:' }, expiresAt: { lt: new Date() } } });
  const days = Number(req.nextUrl.searchParams.get('days') || 5);
  if (!Number.isInteger(days) || days < 1 || days > 90) return NextResponse.json({ error: 'days must be 1–90' }, { status: 400 });
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  // Use Pacific calendar dates to match GSC; final data may lag further than two days.
  const today = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) + 'T00:00:00Z');
  const endStr = new Date(today.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const startStr = new Date(Date.parse(endStr) - (days - 1) * 86400000).toISOString().slice(0, 10);
  const { data: clients, error } = await db.from('seo_clients').select('id,name,slug,gsc_property_url');
  if (error) return NextResponse.json({ error: 'Unable to load clients' }, { status: 500 });
  const slug = req.nextUrl.searchParams.get('client');
  const selected = (clients || []).filter(c => !slug || c.slug === slug);
  if (selected.length > 3) return NextResponse.json({ error: 'Sync one client at a time using ?client=slug' }, { status: 400 });
  if (!selected.length) return NextResponse.json({ error: 'No matching clients' }, { status: 404 });
  const results = await Promise.all(selected.map(async client => {
    try {
      const [metrics, keywords] = await Promise.all([
        getSiteMetrics(client.gsc_property_url, startStr, endStr),
        getKeywordRankings(client.gsc_property_url, endStr, endStr, 50),
      ]);
      if (metrics.length) {
        const { error } = await db.from('seo_daily_snapshots').upsert(metrics.map(r => ({ client_id: client.id, date: r.keys![0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, avg_position: r.position })), { onConflict: 'client_id,date' });
        if (error) throw error;
      }
      if (keywords.length) {
        const { error } = await db.from('seo_keyword_rankings').upsert(keywords.map(r => ({ client_id: client.id, date: endStr, keyword: r.keys![0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })), { onConflict: 'client_id,date,keyword' });
        if (error) throw error;
      }
      const last = metrics.find(r => r.keys?.[0] === endStr);
      if (last) {
        const { error } = await db.from('seo_reports').upsert({ client_id: client.id, report_type: 'daily', period_start: endStr, period_end: endStr, summary: { clicks: last.clicks, impressions: last.impressions, ctr: last.ctr, avg_position: last.position, top_keywords: keywords.slice(0, 10).map(r => ({ keyword: r.keys?.[0], clicks: r.clicks, position: r.position })) } }, { onConflict: 'client_id,report_type,period_start' });
        if (error) throw error;
      }
      return { client: client.name, status: 'ok', metricsCount: metrics.length, keywordsCount: keywords.length, latestDataDate: metrics.map(r => r.keys?.[0] || '').sort().at(-1) || null };
    } catch (error) {
      const e = error as { message?: string; code?: unknown; response?: { status?: number } };
      console.error('SEO sync failed', { client: client.slug, status: e.response?.status, code: e.code, message: e.message });
      return { client: client.name, status: 'error', error: syncFailure(error) };
    }
  }));
  return NextResponse.json({ success: results.some(r => r.status === 'ok'), startDate: startStr, endDate: endStr, results });
}
