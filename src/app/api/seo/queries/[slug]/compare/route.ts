import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getQueryTimeSeries } from '@/lib/gsc';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function fmt(d: Date) {
  return d.toISOString().split('T')[0];
}

function normaliseRows(rows: any[]) {
  return rows.map((row: any) => ({
    date: row.keys[0],
    clicks: Math.round(row.clicks || 0),
    impressions: Math.round(row.impressions || 0),
    ctr: parseFloat(((row.ctr || 0) * 100).toFixed(2)),
    position: parseFloat((row.position || 0).toFixed(1)),
  }));
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { slug } = params;
  const { searchParams } = new URL(req.url);
  const period = parseInt(searchParams.get('period') || '28');
  const query1 = searchParams.get('query1') || '';
  const query2 = searchParams.get('query2') || '';

  if (!query1.trim()) {
    return NextResponse.json({ success: false, error: 'query1 param required' }, { status: 400 });
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
    // Compare always uses at least 28 days for a meaningful chart
    start.setDate(end.getDate() - Math.max(period - 1, 27));

    const startStr = fmt(start);
    const endStr = fmt(end);

    const [series1, series2] = await Promise.all([
      getQueryTimeSeries(client.gsc_property_url, startStr, endStr, query1.trim()),
      query2.trim()
        ? getQueryTimeSeries(client.gsc_property_url, startStr, endStr, query2.trim())
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      success: true,
      periods: { start: startStr, end: endStr },
      data: {
        query1: { label: query1.trim(), series: normaliseRows(series1) },
        ...(query2.trim() ? { query2: { label: query2.trim(), series: normaliseRows(series2) } } : {}),
      },
    });
  } catch (error: any) {
    console.error('Query Compare API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
