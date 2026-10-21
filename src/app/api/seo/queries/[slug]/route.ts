import { NextRequest, NextResponse } from 'next/server';
import { requireSeoSession } from '@/lib/gsc-access';
import { createClient } from '@supabase/supabase-js';
import { getKeywordRankings } from '@/lib/gsc';

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
  const denied = await requireSeoSession(req);
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const period = parseInt(searchParams.get('period') || '7');

  try {
    const { data: client, error: clientError } = await supabase
      .from('seo_clients')
      .select('*')
      .eq('slug', slug)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 });
    }

    const today = new Date();
    const currentEnd = new Date(today);
    currentEnd.setDate(today.getDate() - 2);
    const currentStart = new Date(currentEnd);
    currentStart.setDate(currentEnd.getDate() - (period - 1));

    const previousEnd = new Date(currentStart);
    previousEnd.setDate(currentStart.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousEnd.getDate() - (period - 1));

    const [currentRows, previousRows] = await Promise.all([
      getKeywordRankings(client.gsc_property_url, fmt(currentStart), fmt(currentEnd), 100),
      getKeywordRankings(client.gsc_property_url, fmt(previousStart), fmt(previousEnd), 100),
    ]);

    const previousMap = new Map(previousRows.map((r: any) => [r.keys[0], r.clicks]));

    const processedData = currentRows.map((row: any) => {
      const query = row.keys[0];
      const clicks = Math.round(row.clicks || 0);
      const impressions = Math.round(row.impressions || 0);
      const ctr = parseFloat(((row.ctr || 0) * 100).toFixed(2));
      const position = parseFloat((row.position || 0).toFixed(1));
      const prevClicks = Math.round(Number(previousMap.get(query)) || 0);
      const isNew = prevClicks === 0;
      const trend = isNew ? 0 : Math.round(((clicks - prevClicks) / prevClicks) * 100);

      return { query, clicks, impressions, ctr, position, previousClicks: prevClicks, trend, isNew };
    });

    return NextResponse.json({
      success: true,
      periods: {
        current: { start: fmt(currentStart), end: fmt(currentEnd) },
        previous: { start: fmt(previousStart), end: fmt(previousEnd) },
      },
      data: {
        top: [...processedData].sort((a, b) => b.clicks - a.clicks).slice(0, 10),
        up: [...processedData].filter(i => i.trend > 0 || i.isNew).sort((a, b) => b.trend - a.trend).slice(0, 10),
        down: [...processedData].filter(i => i.trend < 0).sort((a, b) => a.trend - b.trend).slice(0, 10),
      },
    });
  } catch (error: any) {
    console.error('Queries API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
