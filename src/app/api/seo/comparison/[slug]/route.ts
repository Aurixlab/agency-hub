import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function fmt(d: Date) {
  return d.toISOString().split('T')[0];
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { slug } = params;
  const type = req.nextUrl.searchParams.get('type') || 'monthly';

  const { data: client } = await supabase
    .from('seo_clients')
    .select('id, name')
    .eq('slug', slug === 'overview' ? 'cpc-clinics' : slug)
    .single();

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const now = new Date();
  let currentStart: Date, currentEnd: Date, prevStart: Date, prevEnd: Date;

  if (type === 'weekly') {
    const day = now.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    currentStart = new Date(now);
    currentStart.setDate(now.getDate() + diffToMon);
    currentEnd = new Date(currentStart);
    currentEnd.setDate(currentStart.getDate() + 6);

    prevStart = new Date(currentStart);
    prevStart.setDate(currentStart.getDate() - 7);
    prevEnd = new Date(currentStart);
    prevEnd.setDate(currentStart.getDate() - 1);
  } else {
    currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
    currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  }

  const [{ data: current }, { data: previous }] = await Promise.all([
    supabase
      .from('seo_keyword_rankings')
      .select('keyword, position, clicks, impressions')
      .eq('client_id', client.id)
      .gte('date', fmt(currentStart))
      .lte('date', fmt(currentEnd)),
    supabase
      .from('seo_keyword_rankings')
      .select('keyword, position, clicks')
      .eq('client_id', client.id)
      .gte('date', fmt(prevStart))
      .lte('date', fmt(prevEnd)),
  ]);

  const currentMap = new Map<string, { posSum: number; count: number; clicks: number; impressions: number }>();
  for (const row of current || []) {
    const ex = currentMap.get(row.keyword);
    if (ex) {
      ex.posSum += row.position;
      ex.count += 1;
      ex.clicks += row.clicks || 0;
      ex.impressions += row.impressions || 0;
    } else {
      currentMap.set(row.keyword, {
        posSum: row.position,
        count: 1,
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
      });
    }
  }

  const prevMap = new Map<string, { posSum: number; count: number }>();
  for (const row of previous || []) {
    const ex = prevMap.get(row.keyword);
    if (ex) {
      ex.posSum += row.position;
      ex.count += 1;
    } else {
      prevMap.set(row.keyword, { posSum: row.position, count: 1 });
    }
  }

  const allCurrent = Array.from(currentMap.entries()).map(([keyword, cur]) => {
    const prev = prevMap.get(keyword);
    const currentPos = cur.posSum / cur.count;
    const prevPos = prev ? prev.posSum / prev.count : null;
    const delta = prevPos !== null ? prevPos - currentPos : null;

    return {
      keyword,
      currentPosition: parseFloat(currentPos.toFixed(1)),
      previousPosition: prevPos !== null ? parseFloat(prevPos.toFixed(1)) : null,
      delta: delta !== null ? parseFloat(delta.toFixed(1)) : null,
      clicks: cur.clicks,
      impressions: cur.impressions,
    };
  });

  const comparison = allCurrent
    .filter(k => k.delta !== null)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));

  const newKeywords = allCurrent
    .filter(k => k.delta === null)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  return NextResponse.json({
    type,
    periods: {
      current: { start: fmt(currentStart), end: fmt(currentEnd) },
      previous: { start: fmt(prevStart), end: fmt(prevEnd) },
    },
    improved: comparison.filter(k => (k.delta ?? 0) > 0).slice(0, 10),
    declined: comparison.filter(k => (k.delta ?? 0) < 0).slice(0, 10),
    unchanged: comparison.filter(k => k.delta === 0).slice(0, 5),
    newKeywords,
    total: allCurrent.length,
  });
}
