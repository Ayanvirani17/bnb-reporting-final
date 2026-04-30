"use client";

import { useEffect, useState } from "react";
import supabase from "@/lib/supabaseClient";

function formatCurrency(n: number | null | undefined) {
  if (n === null || n === undefined) return "-";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export default function DashboardPage() {
  const [trialBalances, setTrialBalances] = useState<{ id: string; period_name: string }[]>([]);
  const [selectedTbId, setSelectedTbId] = useState<string | null>(null);
  const [plRows, setPlRows] = useState<
    { pl_category: string; pl_line_item: string; amount: number | null }[]
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("trial_balances")
        .select("id, period_name, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("load TBs error", error);
        return;
      }
      setTrialBalances((data || []).map((r: any) => ({ id: r.id, period_name: r.period_name })));
      if (data && data.length > 0) setSelectedTbId(data[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!selectedTbId) return;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("pl_results")
        .select("pl_category,pl_line_item,amount")
        .eq("trial_balance_id", selectedTbId)
        .order("pl_category", { ascending: true })
        .order("pl_line_item", { ascending: true });

      if (error) {
        console.error("fetch pl_results error", error);
        setPlRows([]);
        setLoading(false);
        return;
      }
      setPlRows((data || []).map((r: any) => ({ pl_category: r.pl_category, pl_line_item: r.pl_line_item, amount: r.amount })));
      setLoading(false);
    })();
  }, [selectedTbId]);

  const grouped = plRows.reduce<Record<string, { lines: { item: string; amount: number }[]; total: number }>>((acc, r) => {
    const cat = r.pl_category || "Uncategorized";
    const amt = Number(r.amount || 0);
    if (!acc[cat]) acc[cat] = { lines: [], total: 0 };
    acc[cat].lines.push({ item: r.pl_line_item || "Unnamed", amount: amt });
    acc[cat].total += amt;
    return acc;
  }, {});

  const revenue = grouped["Revenue"]?.total ?? 0;
  const cogs = grouped["COGS"]?.total ?? 0;
  const variable = grouped["Variable Cost"]?.total ?? 0;
  const opex = grouped["Opex"]?.total ?? 0;
  const nonOpex = grouped["Non Opex"]?.total ?? 0;
  const grossProfit = revenue - cogs;
  const contribution = grossProfit - variable;
  const operatingProfit = contribution - opex;
  const preTax = operatingProfit + nonOpex;
  const netIncome = preTax;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Profit & Loss</h1>

        <div>
          <label className="mr-2">Period</label>
          <select
            value={selectedTbId ?? ""}
            onChange={(e) => setSelectedTbId(e.target.value)}
            className="px-3 py-1 rounded border"
          >
            {trialBalances.map(tb => (
              <option key={tb.id} value={tb.id}>
                {tb.period_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <>
          {/* Revenue */}
          <section className="mb-4">
            <h2 className="text-sm text-indigo-300 uppercase">Revenue</h2>
            <div className="bg-slate-800 rounded divide-y">
              {(grouped["Revenue"]?.lines || []).map(line => (
                <div key={line.item} className="flex justify-between px-4 py-3">
                  <div>{line.item}</div>
                  <div className="font-medium">{formatCurrency(line.amount)}</div>
                </div>
              ))}
              <div className="flex justify-between px-4 py-3 font-semibold">
                <div>Total Revenue</div>
                <div>{formatCurrency(revenue)}</div>
              </div>
            </div>
          </section>

          {/* COGS */}
          <section className="mb-4">
            <h2 className="text-sm text-indigo-300 uppercase">Cost of Goods Sold</h2>
            <div className="bg-slate-800 rounded divide-y">
              {(grouped["COGS"]?.lines || []).map(line => (
                <div key={line.item} className="flex justify-between px-4 py-3">
                  <div>{line.item}</div>
                  <div className="font-medium">{formatCurrency(line.amount)}</div>
                </div>
              ))}
              <div className="flex justify-between px-4 py-3 font-semibold">
                <div>Total COGS</div>
                <div>{formatCurrency(cogs)}</div>
              </div>
            </div>
          </section>

          {/* Gross Profit */}
          <div className="mb-6 px-4 py-3 bg-slate-900 rounded flex justify-between items-center">
            <div className="text-sm text-indigo-300 uppercase">Gross Profit</div>
            <div className="text-lg font-bold">{formatCurrency(grossProfit)}</div>
          </div>

          {/* Variable costs */}
          <section className="mb-4">
            <h2 className="text-sm text-indigo-300 uppercase">Variable Costs</h2>
            <div className="bg-slate-800 rounded divide-y">
              {(grouped["Variable Cost"]?.lines || []).map(line => (
                <div key={line.item} className="flex justify-between px-4 py-3">
                  <div>{line.item}</div>
                  <div className="font-medium">{formatCurrency(line.amount)}</div>
                </div>
              ))}
              <div className="flex justify-between px-4 py-3 font-semibold">
                <div>Total Variable Costs</div>
                <div>{formatCurrency(variable)}</div>
              </div>
            </div>
          </section>

          {/* Contribution */}
          <div className="mb-6 px-4 py-3 bg-slate-900 rounded flex justify-between items-center">
            <div className="text-sm text-indigo-300 uppercase">Contribution</div>
            <div className="text-lg font-bold">{formatCurrency(contribution)}</div>
          </div>

          {/* Opex */}
          <section className="mb-4">
            <h2 className="text-sm text-indigo-300 uppercase">Operating Expenses</h2>
            <div className="bg-slate-800 rounded divide-y">
              {(grouped["Opex"]?.lines || []).map(line => (
                <div key={line.item} className="flex justify-between px-4 py-3">
                  <div>{line.item}</div>
                  <div className="font-medium">{formatCurrency(line.amount)}</div>
                </div>
              ))}
              <div className="flex justify-between px-4 py-3 font-semibold">
                <div>Total Opex</div>
                <div>{formatCurrency(opex)}</div>
              </div>
            </div>
          </section>

          {/* Operating profit */}
          <div className="mb-6 px-4 py-3 bg-slate-900 rounded flex justify-between items-center">
            <div className="text-sm text-indigo-300 uppercase">Operating Profit (EBITDA)</div>
            <div className="text-lg font-bold">{formatCurrency(operatingProfit)}</div>
          </div>

          {/* Non-Op & Finance */}
          <section className="mb-4">
            <h2 className="text-sm text-indigo-300 uppercase">Non-operating / Finance</h2>
            <div className="bg-slate-800 rounded divide-y">
              {(grouped["Non Opex"]?.lines || []).map(line => (
                <div key={line.item} className="flex justify-between px-4 py-3">
                  <div>{line.item}</div>
                  <div className="font-medium">{formatCurrency(line.amount)}</div>
                </div>
              ))}
              <div className="flex justify-between px-4 py-3 font-semibold">
                <div>Total Non-Op</div>
                <div>{formatCurrency(nonOpex)}</div>
              </div>
            </div>
          </section>

          <div className="mb-6 px-4 py-3 bg-slate-900 rounded flex justify-between items-center">
            <div className="text-sm text-indigo-300 uppercase">Net Income (Approx)</div>
            <div className="text-lg font-bold">{formatCurrency(netIncome)}</div>
          </div>
        </>
      )}
    </div>
  );
}
