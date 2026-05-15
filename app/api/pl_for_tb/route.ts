import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export async function GET(req: NextRequest) {
  const tb = req.nextUrl.searchParams.get('tb');
  if (!tb) return NextResponse.json({ error: 'Missing tb parameter' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('pl_totals_v2')
    .select('*')
    .eq('tb_id', tb);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
