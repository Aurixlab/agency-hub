import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getKeywordRankings } from '@/lib/gsc';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { slug } = params;

  const { searchParams } = new URL(req.url);
  const period = parseInt(searchParams.get('period') || '7');

  try {
    // 1. Get client info
    const { data: client, error: clientError } = await supabase
      .from('seo_clients')
      .select('*')
      .eq('slug', slug)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 });
    }

    // Define periods based on selected period length, with 2-day GSC delay
    const today = new Date();

    const currentEnd = new Date(today);
    currentEnd.setDate(today.getDate() - 2);
    const currentStart = new Date(currentEnd);
    currentStart.setDate(currentEnd.getDate() - (period - 1));

    const previousEnd = new Date(currentStart);
    previousEnd.setDate(currentStart.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousEnd.getDate() - (period - 1));

    const currentStartStr = currentStart.toISOString().split('T')[0];
    const currentEndStr = currentEnd.toISOString().split('T')[0];
    const previousStartStr = previousStart.toISOString().split('T')[0];
    const previousEndStr = previousEnd.toISOString().split('T')[0];

    // 2. Fetch real-time data from GSC
    const [currentRows, previousRows] = await Promise.all([
      getKeywordRankings(client.gsc_property_url, currentStartStr, currentEndStr, 100),
      getKeywordRankings(client.gsc_property_url, previousStartStr, previousEndStr, 100)
    ]);

    // 3. Process and calculate trends
    const previousMap = new Map(previousRows.map((r: any) => [r.keys[0], r.clicks]));

    const processedData = currentRows.map((row: any) => {
      const query = row.keys[0];
      const clicks = Math.round(row.clicks);
      const prevClicks = Math.round(previousMap.get(query) || 0);
      const isNew = prevClicks === 0;
      
      let trend = 0;
      if (!isNew) {
        trend = Math.round(((clicks - prevClicks) / prevClicks) * 100);
      }

      return {
        query,
        clicks,
        previousClicks: prevClicks,
        trend,
        isNew
      };
    });

    // Sort into categories
    const top = [...processedData].sort((a, b) => b.clicks - a.clicks).slice(0, 10);
    const up = [...processedData]
      .filter(item => item.trend > 0 || item.isNew)
      .sort((a, b) => b.trend - a.trend)
      .slice(0, 10);
    const down = [...processedData]
      .filter(item => item.trend < 0)
      .sort((a, b) => a.trend - b.trend)
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      data: { top, up, down }
    });

  } catch (error: any) {
    console.error('Queries API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
