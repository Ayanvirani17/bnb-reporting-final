"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"; // or your supabase client import
import { Database } from "@/lib/supabaseTypes"; // optional: if you have typed DB
import { format as formatDate } from "date-fns";

const supabase = createClientComponentClient<Database>(); // or import your client

function formatCurrency(n: number) {
  return n === null || n === undefined
    ? "-"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export default function DashboardPage() {
  const [trialBalances, setTrialBalances] = useState<{ id: string; period_name: string }[]>([]);
  const [selectedTbId, setSelectedTbId] = useState<string | null>(null);
  const [plRows, setPlRows] = useState<
    { pl_category: string; pl_line_item: string; amount: number | null }[]
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // load available periods
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

  // Aggregate by category and compute derived totals
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
  const finance = grouped["Non Opex"]?.lines?.find(l => /finance/i.test(l.item))?.amount ?? grouped["Finance"]?.total ?? 0;
  // Derived calculations (adjust as your accounting rules require)
  const grossProfit = revenue - cogs;
  const contribution = grossProfit - variable;
  const operatingProfit = contribution - opex; // or grossProfit - (variable + opex)
  const preTax = operatingProfit + nonOpex - (finance || 0); // if nonOpex is positive, adjust sign rules as needed
  const netIncome = preTax; // simplification (taxes not included)

  const sectionsOrder = [
    "Revenue",
    "COGS",
    "Variable Cost",
    "Opex",
    "Non Opex",
    "Other"
  ];

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
          <div className="mb-6 px-4 py-3 bg-slat