import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSiteMetrics, getKeywordRankings, getIndexingStatus } from '@/lib/gsc';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  // Security check: Verify Cron Secret if set, or just rely on service role
  // const authHeader = req.headers.get('authorization');
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return new Response('Unauthorized', { status: 401 });
  // }

  try {
    console.log('🚀 Starting SEO Data Sync...');
    
    // GSC data is typically 2-3 days delayed; sync the last 3 days to be safe
    const today = new Date();
    const end = new Date(today);
    end.setDate(today.getDate() - 2);
    const start = new Date(today);
    start.setDate(today.getDate() - 5);

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    const { data: clients, error: clientError } = await supabase.from('seo_clients').select('*');
    if (clientError) throw clientError;

    const results = [];

    for (const client of clients) {
      console.log(`  Syncing ${client.name}...`);
      
      // 1. Sync Site Metrics
      const metrics = await getSiteMetrics(client.gsc_property_url, startStr, endStr);
      if (metrics.length > 0) {
        const snapshots = metrics.map((row: any) => ({
          client_id: client.id,
          date: row.keys[0],
          clicks: Math.round(row.clicks),
          impressions: Math.round(row.impressions),
          ctr: row.ctr,
          avg_position: row.position
        }));

        await supabase.from('seo_daily_snapshots').upsert(snapshots, { onConflict: 'client_id,date' });
      }

      // 2. Sync Top Keywords (for the latest available date)
      const keywords = await getKeywordRankings(client.gsc_property_url, endStr, endStr);
      if (keywords.length > 0) {
        const kwRows = keywords.map((row: any) => ({
          client_id: client.id,
          date: endStr,
          keyword: row.keys[0],
          position: row.position,
          clicks: Math.round(row.clicks),
          impressions: Math.round(row.impressions),
          ctr: row.ctr
        }));

        await supabase.from('seo_keyword_rankings').upsert(kwRows, { onConflict: 'client_id,date,keyword' });
      }

      // 3. Sync Indexing Status
      const indexing = await getIndexingStatus(client.gsc_property_url);
      if (indexing) {
        await supabase.from('seo_indexing').upsert({
          client_id: client.id,
          date: endStr,
          indexed_pages: indexing.indexed,
          not_indexed_pages: Math.max(0, indexing.submitted - indexing.indexed),
          coverage_issues: { source: 'Sitemaps API' }
        }, { onConflict: 'client_id,date' });
      }

      // 4. Generate Daily Overview (as specified in Phase 9)
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
          top_keywords: topKeywords ?? []
        }
      }, { onConflict: 'client_id,report_type,period_start' });

      results.push({
        client: client.name,
        metricsCount: metrics.length,
        keywordsCount: keywords.length,
        indexingStatus: indexing ? 'Success' : 'Failed'
      });
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('SEO Sync Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
