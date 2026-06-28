import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getFilteredQueries } from '@/lib/gsc';

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
  const { searchParams } = new URL(req.url);
  const period = parseInt(searchParams.get('period') || '7');
  const filter = searchParams.get('filter') || '';

  if (!filter.trim()) {
    return NextResponse.json({ success: false, error: 'filter param required' }, { status: 400 });
  }

  try {
    const { data: client, error: clientError } = await supabase
      .from('seo_clients')
      .select('gsc_property_url')
      .eq('slug', slug)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 });
    }

    const today = new Date();
    const end = new Date(today);
    end.setDate(today.getDate() - 2);
    const start = new Date(end);
    start.setDate(end.getDate() - (period - 1));

    const prevEnd = new Date(start);
    prevEnd.setDate(start.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevEnd.getDate() - (period - 1));

    const [currentRows, previousRows] = await Promise.all([
      getFilteredQueries(client.gsc_property_url, fmt(start), fmt(end), filter, 100),
      getFilteredQueries(client.gsc_property_url, fmt(prevStart), fmt(prevEnd), filter, 100),
    ]);

    const prevMap = new Map(previousRows.map((r: any) => [r.keys[0], r.clicks]));

    const data = currentRows.map((row: any) => {
      const query = row.keys[0];
      const clicks = Math.round(row.clicks || 0);
      const impressions = Math.round(row.impressions || 0);
      const ctr = parseFloat(((row.ctr || 0) * 100).toFixed(2));
      const position = parseFloat((row.position || 0).toFixed(1));
      const prevClicks = Math.round(Number(prevMap.get(query)) || 0);
      const isNew = prevClicks === 0;
      const trend = isNew ? 0 : Math.round(((clicks - prevClicks) / prevClicks) * 100);
      return { query, clicks, impressions, ctr, position, previousClicks: prevClicks, trend, isNew };
    });

    return NextResponse.json({
      success: true,
      filter,
      periods: { current: { start: fmt(start), end: fmt(end) }, previous: { start: fmt(prevStart), end: fmt(prevEnd) } },
      data,
    });
  } catch (error: any) {
    console.error('Query Search API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
