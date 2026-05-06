import { NextResponse } from "next/server";
import { getSupabaseServer } from '../../../../lib/supabaseServer';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const periodA = url.searchParams.get("periodA") || "";
    const periodB = url.searchParams.get("periodB") || "";

    const supabase = getSupabaseServer();
    const periods = [periodA, periodB].filter(Boolean);

    const { data: rows, error } = await supabase
      .from("pl_results")
      .select("pl_category, pl_line_item, amount, period")
      .in("period", periods);

    if (error) throw error;

    const rowsArr = rows || [];
    const cats = Array.from(new Set(rowsArr.map((r: any) => r.pl_category))).sort();

    const getSeries = (p: string) => cats.map(c => 
      rowsArr.filter((r: any) => r.period === p && r.pl_category === c)
             .reduce((sum, r) => sum + Number(r.amount), 0)
    );

    const drill: any = {};
    cats.forEach(c => {
      drill[c] = [
        { period: periodA, rows: rowsArr.filter((r: any) => r.period === periodA && r.pl_category === c) },
        { period: periodB, rows: rowsArr.filter((r: any) => r.period === periodB && r.pl_category === c) }
      ];
    });

    return NextResponse.json({
      categories: cats,
      seriesA: getSeries(periodA),
      seriesB: getSeries(periodB),
      drill,
      totals: {
        totalA: getSeries(periodA).reduce((a, b) => a + b, 0),
        totalB: getSeries(periodB).reduce((a, b) => a + b, 0),
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}