import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const today = new Date();
    const thisWeekEnd = new Date(today);
    thisWeekEnd.setDate(today.getDate() - 1);
    const thisWeekStart = new Date(thisWeekEnd);
    thisWeekStart.setDate(thisWeekEnd.getDate() - 6);
    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setDate(thisWeekStart.getDate() - 1);
    const lastWeekStart = new Date(lastWeekEnd);
    lastWeekStart.setDate(lastWeekEnd.getDate() - 6);

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const { data: clients, error: clientError } = await supabase.from('seo_clients').select('*');
    if (clientError) throw clientError;

    for (const client of clients!) {
      const { data: thisWeek } = await supabase
        .from('seo_daily_snapshots')
        .select('clicks, impressions, ctr, avg_position')
        .eq('client_id', client.id)
        .gte('date', fmt(thisWeekStart))
        .lte('date', fmt(thisWeekEnd));

      const { data: lastWeek } = await supabase
        .from('seo_daily_snapshots')
        .select('clicks, impressions, ctr, avg_position')
        .eq('client_id', client.id)
        .gte('date', fmt(lastWeekStart))
        .lte('date', fmt(lastWeekEnd));

      const sum = (rows: any[] | null, key: string) =>
        rows?.reduce((acc, r) => acc + (r[key] ?? 0), 0) ?? 0;
      const avg = (rows: any[] | null, key: string) =>
        rows?.length ? sum(rows, key) / rows.length : 0;

      await supabase.from('seo_reports').insert({
        client_id: client.id,
        report_type: 'weekly',
        period_start: fmt(thisWeekStart),
        period_end: fmt(thisWeekEnd),
        summary: {
          this_week: {
            clicks: sum(thisWeek, 'clicks'),
            impressions: sum(thisWeek, 'impressions'),
            avg_position: avg(thisWeek, 'avg_position').toFixed(2)
          },
          last_week: {
            clicks: sum(lastWeek, 'clicks'),
            impressions: sum(lastWeek, 'impressions'),
            avg_position: avg(lastWeek, 'avg_position').toFixed(2)
          },
          delta: {
            clicks: sum(thisWeek, 'clicks') - sum(lastWeek, 'clicks'),
            impressions: sum(thisWeek, 'impressions') - sum(lastWeek, 'impressions'),
          }
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Weekly Digest Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
