import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getKeywordRankings } from '@/lib/gsc';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function buildMap(rows: any[]): Map<string, { posSum: number; clicks: number; count: number }> {
  const map = new Map<string, { posSum: number; clicks: number; count: number }>();
  for (const row of rows) {
    // GSC rows use row.keys[0] for query, DB rows use row.keyword
    const keyword = row.keys ? row.keys[0] : row.keyword;
    const position = row.keys ? (row.position || 0) : (row.position || 0);
    const clicks = Math.round(row.clicks || 0);
    const existing = map.get(keyword);
    if (existing) {
      existing.posSum += position;
      existing.clicks += clicks;
      existing.count += 1;
    } else {
      map.set(keyword, { posSum: position, clicks, count: 1 });
    }
  }
  return map;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { slug } = params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'monthly'; // 'weekly' | 'monthly'

  try {
    const { data: client, error: clientError } = await supabase
      .from('seo_clients')
      .select('id, gsc_property_url')
      .eq('slug', slug)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const today = new Date();
    let currentStart: string, currentEnd: string, previousStart: string, previousEnd: string;
    let periodLabel: string, prevPeriodLabel: string;

    if (type === 'weekly') {
      // Current: last 7 days (with 2-day GSC delay)
      const ce = new Date(today);
      ce.setDate(today.getDate() - 2);
      const cs = new Date(ce);
      cs.setDate(ce.getDate() - 6);
      // Previous: 7 days before current
      const pe = new Date(cs);
      pe.setDate(cs.getDate() - 1);
      const ps = new Date(pe);
      ps.setDate(pe.getDate() - 6);

      currentStart = cs.toISOString().split('T')[0];
      currentEnd = ce.toISOString().split('T')[0];
      previousStart = ps.toISOString().split('T')[0];
      previousEnd = pe.toISOString().split('T')[0];
      periodLabel = `${currentStart} – ${currentEnd}`;
      prevPeriodLabel = `${previousStart} – ${previousEnd}`;
    } else {
      // Current: this calendar month up to 2 days ago (GSC delay)
      const ce = new Date(today);
      ce.setDate(today.getDate() - 2);
      const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      // Previous: full previous calendar month
      const prevMonthEnd = new Date(currentMonthStart);
      prevMonthEnd.setDate(prevMonthEnd.getDate() - 1);
      const prevMonthStart = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), 1);

      currentStart = currentMonthStart.toISOString().split('T')[0];
      currentEnd = ce.toISOString().split('T')[0];
      previousStart = prevMonthStart.toISOString().split('T')[0];
      previousEnd = prevMonthEnd.toISOString().split('T')[0];

      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      periodLabel = `${monthNames[today.getMonth()]} ${today.getFullYear()}`;
      prevPeriodLabel = `${monthNames[prevMonthEnd.getMonth()]} ${prevMonthEnd.getFullYear()}`;
    }

    // Fetch directly from GSC for both periods — no DB history required
    const [currentRows, previousRows] = await Promise.all([
      getKeywordRankings(client.gsc_property_url, currentStart, currentEnd, 200),
      getKeywordRankings(client.gsc_property_url, previousStart, previousEnd, 200),
    ]);

    const currentMap = buildMap(currentRows);
    const previousMap = buildMap(previousRows);

    const results: {
      keyword: string;
      current_position: number;
      prev_position: number;
      position_delta: number;
      clicks: number;
    }[] = [];

    for (const [keyword, curr] of Array.from(currentMap.entries())) {
      const prev = previousMap.get(keyword);
      if (!prev) continue;
      const currentPos = curr.posSum / curr.count;
      const prevPos = prev.posSum / prev.count;
      // Positive delta = improved (position number decreased)
      results.push({
        keyword,
        current_position: currentPos,
        prev_position: prevPos,
        position_delta: prevPos - currentPos,
        clicks: curr.clicks,
      });
    }

    results.sort((a, b) => b.position_delta - a.position_delta);

    return NextResponse.json({
      success: true,
      type,
      periodLabel,
      prevPeriodLabel,
      data: results.slice(0, 20),
    });
  } catch (error: any) {
    console.error('Comparison API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
