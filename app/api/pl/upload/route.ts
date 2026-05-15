// app/api/pl/upload/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Row = {
  account_name?: string;
  account_code?: string;
  debit?: number;
  credit?: number;
  [k: string]: any;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const period = body.period;
    const rows: Row[] = Array.isArray(body.rows) ? body.rows : [];

    if (!period || !rows.length) {
      return NextResponse.json({ error: "period and rows are required" }, { status: 400 });
    }

    const { data: tbData, error: tbErr } = await supabase
      .from("trial_balances")
      .insert({ period })
      .select("id, period")
      .single();

    if (tbErr || !tbData) {
      console.error("create TB error", tbErr);
      return NextResponse.json({ error: "Failed to create trial balance" }, { status: 500 });
    }
    const trial_balance_id = tbData.id;

    const lines = rows.map((r) => ({
      trial_balance_id,
      account_name: (r.account_name || "").toString().trim(),
      account_code: (r.account_code || "").toString().trim() || null,
      debit: r.debit ?? 0,
      credit: r.credit ?? 0,
      raw: JSON.stringify(r),
      created_at: new Date().toISOString(),
    }));

    const chunkSize = 200;
    for (let i = 0; i < lines.length; i += chunkSize) {
      const chunk = lines.slice(i, i + chunkSize);
      const { error: linesErr } = await supabase.from("trial_balance_lines").insert(chunk);
      if (linesErr) {
        console.error("insert lines error", linesErr);
        return NextResponse.json({ error: "Failed to insert lines" }, { status: 500 });
      }
    }

    const { data: mappings } = await supabase.from("account_mapping").select("*");
    const mapList = mappings || [];

    const { data: tbLines } = await supabase
      .from("trial_balance_lines")
      .select("id, account_name, account_code, debit, credit")
      .eq("trial_balance_id", trial_balance_id);

    const tbLinesArr = tbLines || [];

    function findMappingForLine(line: any) {
      if (line.account_code) {
        const byCode = mapList.find((m: any) => m.account_code && String(m.account_code).trim() === String(line.account_code).trim());
        if (byCode) return byCode;
      }
      const lname = (line.account_name || "").toString().toLowerCase();
      const candidates = mapList
        .filter((m: any) => m.account_name)
        .sort((a: any, b: any) => (String(b.account_name).length - String(a.account_name).length));
      for (const m of candidates) {
        const mname = (m.account_name || "").toString().toLowerCase();
        if (!mname) continue;
        if (lname.includes(mname)) return m;
      }
      return null;
    }

    const agg = new Map<string, { pl_category: string; pl_line_item: string; amount: number }>();

    for (const line of tbLinesArr) {
      const mapping = findMappingForLine(line);
      if (!mapping) continue; // skip unmapped lines
      if (mapping.statement_type !== "pl") continue; // only explicit PL mappings
      const pl_cat = mapping.pl_category || "uncategorized";
      const pl_item = mapping.pl_line_item || "uncategorized";
      const amount = (Number(line.credit || 0) - Number(line.debit || 0)) || 0;
      const key = `${pl_cat}|||${pl_item}`;
      const prev = agg.get(key);
      if (prev) {
        prev.amount += amount;
      } else {
        agg.set(key, { pl_category: pl_cat, pl_line_item: pl_item, amount });
      }
    }

    const plRows = Array.from(agg.entries()).map(([k, v]) => ({
      trial_balance_id,
      period,
      pl_category: v.pl_category,
      pl_line_item: v.pl_line_item,
      amount: v.amount,
      created_at: new Date().toISOString(),
    }));

    if (plRows.length) {
      for (let i = 0; i < plRows.length; i += chunkSize) {
        const chunk = plRows.slice(i, i + chunkSize);
        const { error: insertPlErr } = await supabase.from("pl_results").insert(chunk);
        if (insertPlErr) {
          console.error("insert pl_results error", insertPlErr);
          return NextResponse.json({ error: "Failed to insert pl_results" }, { status: 500 });
        }
      }
    }

    return NextResponse.json({
      trial_balance_id,
      inserted_lines: tbLinesArr.length,
      pl_rows_inserted: plRows.length,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}