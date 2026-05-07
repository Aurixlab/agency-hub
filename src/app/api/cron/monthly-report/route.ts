import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const today = new Date();
    // Get first day of current month
    const firstDayCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    // Get last day of previous month
    const lastDayPrevMonth = new Date(firstDayCurrentMonth);
    lastDayPrevMonth.setDate(0);
    // Get first day of previous month
    const firstDayPrevMonth = new Date(lastDayPrevMonth.getFullYear(), lastDayPrevMonth.getMonth(), 1);

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const { data: clients, error: clientError } = await supabase.from('seo_clients').select('*');
    if (clientError) throw clientError;

    for (const client of clients!) {
      const { data: snapshots } = await supabase
        .from('seo_daily_snapshots')
        .select('clicks, impressions, ctr, avg_position')
        .eq('client_id', client.id)
        .gte('date', fmt(firstDayPrevMonth))
        .lte('date', fmt(lastDayPrevMonth));

      const { data: keywords } = await supabase
        .from('seo_keyword_rankings')
        .select('keyword, position, clicks')
        .eq('client_id', client.id)
        .gte('date', fmt(firstDayPrevMonth))
        .lte('date', fmt(lastDayPrevMonth))
        .order('clicks', { ascending: false })
        .limit(10);

      const sum = (rows: any[] | null, key: string) =>
        rows?.reduce((acc, r) => acc + (r[key] ?? 0), 0) ?? 0;
      const avg = (rows: any[] | null, key: string) =>
        rows?.length ? sum(rows, key) / rows.length : 0;

      await supabase.from('seo_reports').insert({
        client_id: client.id,
        report_type: 'monthly',
        period_start: fmt(firstDayPrevMonth),
        period_end: fmt(lastDayPrevMonth),
        summary: {
          total_clicks: sum(snapshots, 'clicks'),
          total_impressions: sum(snapshots, 'impressions'),
          avg_ctr: avg(snapshots, 'ctr'),
          avg_position: avg(snapshots, 'avg_position').toFixed(2),
          top_keywords: keywords || []
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Monthly Report Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
