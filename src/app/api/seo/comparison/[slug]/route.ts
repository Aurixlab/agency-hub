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

  try {
    // 1. Get client ID
    const { data: client, error: clientError } = await supabase
      .from('seo_clients')
      .select('id')
      .eq('slug', slug)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // 2. Query the pre-computed view for month-over-month comparison
    // Note: The view is named 'seo_monthly_keyword_comparison' in your guide
    const { data, error } = await supabase
      .from('seo_monthly_keyword_comparison')
      .select('*')
      .eq('client_id', client.id)
      .order('position_delta', { ascending: false })
      .limit(20);

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Comparison API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
