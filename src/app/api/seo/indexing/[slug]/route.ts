import { NextRequest, NextResponse } from 'next/server';
import { requireSeoSession } from '@/lib/gsc-access';
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
  const denied = await requireSeoSession(req);
  if (denied) return denied;

  try {
    const { data: client, error: clientError } = await supabase
      .from('seo_clients')
      .select('id')
      .eq('slug', slug)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('seo_indexing')
      .select('*')
      .eq('client_id', client.id)
      .order('date', { ascending: false })
      .limit(30);

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Indexing API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
