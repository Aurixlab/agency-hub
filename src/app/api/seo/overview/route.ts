import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get('period') || '30');
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days - 1);
  const startStr = startDate.toISOString().split('T')[0];

  try {
    // Get daily snapshots for all clients
    const { data: snapshots, error: snapshotError } = await supabase
      .from('seo_daily_snapshots')
      .select('*, seo_clients(name, slug)')
      .gte('date', startStr)
      .order('date', { ascending: true });

    if (snapshotError) throw snapshotError;

    // Get the latest metrics per client for the summary cards
    const { data: latestMetrics, error: latestError } = await supabase
      .from('seo_daily_snapshots')
      .select('*, seo_clients(name, slug)')
      .order('date', { ascending: false })
      .limit(10); // Get enough to find the latest for each of our 3 clients

    if (latestError) throw latestError;

    return NextResponse.json({
      snapshots,
      latestMetrics
    });
  } catch (error: any) {
    console.error('Overview API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
