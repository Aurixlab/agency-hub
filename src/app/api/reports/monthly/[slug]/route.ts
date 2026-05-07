import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month'); // e.g. '2026-04'
  if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 });

  const [year, mon] = month.split('-').map(Number);
  const periodStart = `${month}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const periodEnd = `${month}-${lastDay}`;

  try {
    const { data: client } = await supabase
      .from('seo_clients').select('*').eq('slug', params.slug).single();

    if (!client) throw new Error('Client not found');

    const { data: snapshots } = await supabase
      .from('seo_daily_snapshots').select('*')
      .eq('client_id', client.id)
      .gte('date', periodStart).lte('date', periodEnd)
      .order('date');

    const { data: keywords } = await supabase
      .from('seo_keyword_rankings').select('*')
      .eq('client_id', client.id)
      .gte('date', periodStart).lte('date', periodEnd)
      .order('clicks', { ascending: false }).limit(20);

    // Get previous month's keywords for comparison
    const prevMonthStart = new Date(year, mon - 2, 1).toISOString().split('T')[0];
    const prevMonthEnd = new Date(year, mon - 1, 0).toISOString().split('T')[0];

    const { data: prevKeywords } = await supabase
      .from('seo_keyword_rankings').select('keyword, position')
      .eq('client_id', client.id)
      .gte('date', prevMonthStart)
      .lte('date', prevMonthEnd);

    const totalClicks = snapshots?.reduce((a, r) => a + r.clicks, 0) ?? 0;
    const totalImpressions = snapshots?.reduce((a, r) => a + r.impressions, 0) ?? 0;
    const avgPosition = snapshots?.length
      ? (snapshots.reduce((a, r) => a + r.avg_position, 0) / snapshots.length).toFixed(1)
      : 'N/A';

    const kwComparison = keywords?.map(kw => {
      const prev = prevKeywords?.find(p => p.keyword === kw.keyword);
      return {
        keyword: kw.keyword,
        position: kw.position,
        prevPosition: prev?.position ?? null,
        delta: prev ? (prev.position - kw.position).toFixed(1) : null,
        clicks: kw.clicks
      };
    });

    return NextResponse.json({
      client: client.name,
      period: { start: periodStart, end: periodEnd },
      summary: { totalClicks, totalImpressions, avgPosition },
      keywords: kwComparison,
      dailyData: snapshots
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
