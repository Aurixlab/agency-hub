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
  const { slug } = params;
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get('period') || '30');
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startStr = startDate.toISOString().split('T')[0];

  try {
    // 1. Get client info
    const { data: client, error: clientError } = await supabase
      .from('seo_clients')
      .select('*')
      .eq('slug', slug)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // 2. Get snapshots for chart
    const { data: snapshots, error: snapshotError } = await supabase
      .from('seo_daily_snapshots')
      .select('*')
      .eq('client_id', client.id)
      .gte('date', startStr)
      .order('date', { ascending: true });

    if (snapshotError) throw snapshotError;

    // 3. Get top keywords for the period (aggregated)
    const { data: keywords, error: kwError } = await supabase
      .from('seo_keyword_rankings')
      .select('*')
      .eq('client_id', client.id)
      .gte('date', startStr)
      .order('clicks', { ascending: false })
      .limit(50);

    if (kwError) throw kwError;

    return NextResponse.json({
      client,
      snapshots,
      keywords
    });
  } catch (error: any) {
    console.error('Client API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
