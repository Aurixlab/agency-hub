import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSiteMetrics, getKeywordRankings, getIndexingStatus } from '@/lib/gsc';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // `days` controls the historical backfill window.
  // Manual "Sync Now" passes days=30 to populate chart history.
  // Cron jobs default to 5 days to catch GSC delay without over-fetching.
  const days = Math.min(parseInt(searchParams.get('days') || '5'), 90);

  const today = new Date();
  // GSC data is typically 2 days delayed
  const end = new Date(today);
  end.setDate(today.getDate() - 2);
  const start = new Date(today);
  start.setDate(today.getDate() - days - 1);

  const startStr = start.toISOString().split('T')[0];
  const endStr = end.toISOString().split('T')[0];

  console.log(`SEO Sync: ${startStr} → ${endStr} (${days}-day window)`);

  const { data: clients, error: clientError } = await supabase.from('seo_clients').select('*');
  if (clientError) {
    return NextResponse.json({ success: false, error: clientError.message }, { status: 500 });
  }

  const results: any[] = [];

  for (const client of clients) {
    const clientResult: any = { client: client.name, status: 'ok', metricsCount: 0, keywordsCount: 0, error: null };

    try {
      // 1. Sync site metrics (fills the trend chart)
      const metrics = await getSiteMetrics(client.gsc_property_url, startStr, endStr);
      if (metrics.length > 0) {
        const snapshots = metrics.map((row: any) => ({
          client_id: client.id,
          date: row.keys[0],
          clicks: Math.round(row.clicks),
          impressions: Math.round(row.impressions),
          ctr: row.ctr,
          avg_position: row.position,
        }));
        await supabase.from('seo_daily_snapshots').upsert(snapshots, { onConflict: 'client_id,date' });
        clientResult.metricsCount = metrics.length;
      }

      // 2. Sync top keywords for the most recent available day (endStr)
      const keywords = await getKeywordRankings(client.gsc_property_url, endStr, endStr, 50);
      if (keywords.length > 0) {
        const kwRows = keywords.map((row: any) => ({
          client_id: client.id,
          date: endStr,
          keyword: row.keys[0],
          position: row.position,
          clicks: Math.round(row.clicks),
          impressions: Math.round(row.impressions),
          ctr: Math.round(row.ctr * 10000) / 10000,
        }));
        await supabase.from('seo_keyword_rankings').upsert(kwRows, { onConflict: 'client_id,date,keyword' });
        clientResult.keywordsCount = kwRows.length;
      }

      // 3. Sync indexing status
      const indexing = await getIndexingStatus(client.gsc_property_url);
      if (indexing) {
        await supabase.from('seo_indexing').upsert({
          client_id: client.id,
          date: endStr,
          indexed_pages: indexing.indexed,
          not_indexed_pages: Math.max(0, indexing.submitted - indexing.indexed),
          coverage_issues: { source: 'Sitemaps API' },
        }, { onConflict: 'client_id,date' });
      }

      // 4. Write daily report entry
      const { data: snapshot } = await supabase
        .from('seo_daily_snapshots')
        .select('*')
        .eq('client_id', client.id)
        .eq('date', endStr)
        .single();

      const { data: topKeywords } = await supabase
        .from('seo_keyword_rankings')
        .select('keyword, position, clicks')
        .eq('client_id', client.id)
        .eq('date', endStr)
        .order('clicks', { ascending: false })
        .limit(10);

      await supabase.from('seo_reports').upsert({
        client_id: client.id,
        report_type: 'daily',
        period_start: endStr,
        period_end: endStr,
        summary: {
          clicks: snapshot?.clicks ?? 0,
          impressions: snapshot?.impressions ?? 0,
          ctr: snapshot?.ctr ?? 0,
          avg_position: snapshot?.avg_position ?? 0,
          top_keywords: topKeywords ?? [],
        },
      }, { onConflict: 'client_id,report_type,period_start' });

    } catch (err: any) {
      console.error(`SEO Sync error for ${client.name}:`, err.message);
      clientResult.status = 'error';
      clientResult.error = err.message;
    }

    results.push(clientResult);
  }

  const anySuccess = results.some(r => r.status === 'ok');
  return NextResponse.json({ success: anySuccess, results });
}
