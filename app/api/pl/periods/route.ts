import { NextResponse } from "next/server";
import { getSupabaseServer } from '../../../../lib/supabaseServer';

export async function GET(req: Request) {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("pl_results")
      .select("period")
      .order("period", { ascending: true });

    if (error) throw error;

    const periods = Array.from(new Set((data || []).map((r: any) => r.period))).filter(Boolean);
    return NextResponse.json({ periods });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}