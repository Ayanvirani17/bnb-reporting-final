"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "../../lib/supabaseClient";

type Mapping = {
  id: string;
  account_code?: string | null;
  account_name?: string | null;
  pl_category?: string | null;
  pl_line_item?: string | null;
  sign_convention?: any;
};

type TBLine = {
  id: string;
  trial_balance_id: string;
  account_code?: string | null;
  account_name?: string | null;
  debit?: number | null;
  credit?: number | null;
};

const fmt = (n: number) =>
  Math.round(Math.abs(n)).toLocaleString(undefined, { maximumFractionDigits: 0 });

const fmtSigned = (n: number) => {
  const v = Math.round(n);
  if (v === 0) return "0";
  return v < 0 ? `(${Math.abs(v).toLocaleString()})` : v.toLocaleString();
};

export default function DashboardPage() {
  const supabase = getSupabaseClient();

  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [periodFilter, setPeriodFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [aggByCategory, setAggByCategory] = useState<
    Map<string, { signedTotal: number; lines: { name?: string | null; signed: number }[] }>
  >(new Map());
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Stable mapping snapshot key to avoid effect re-run loops
  const mappingKey = useMemo(() => {
    return JSON.stringify(
      (mappings || []).map((m) =>
        [
          m.id ?? "",
          m.account_code ?? "",
          m.account_name ?? "",
          m.pl_category ?? "",
          String(m.sign_convention ?? ""),
        ].join("|")
      )
    );
  }, [mappings]);

  // Build mapping lookup using mappingKey to ensure stability
  const mappingLookup = useMemo(() => {
    const lookup: { [k: string]: Mapping } = {};
    for (const m of mappings || []) {
      if (m.account_code) lookup[String(m.account_code).toLowerCase().trim()] = m;
      if (m.account_name) lookup[String(m.account_name).toLowerCase().trim()] = m;
    }
    return lookup;
  }, [mappingKey]);

  // Parse sign convention robustly
  const parseSign = (v: any) => {
    if (v === null || v === undefined) return 1;
    if (typeof v === "number") return v === 0 ? 1 : Math.sign(v);
    const s = String(v).toLowerCase().trim();
    if (s === "credit" || s === "-1" || s === "-1.0") return -1;
    if (s === "debit" || s === "1" || s === "1.0") return 1;
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s) === 0 ? 1 : Math.sign(parseFloat(s));
    return 1;
  };

  // Canonical grouping
  const canonicalSection = (cat: string) => {
    const c = (cat || "unmapped").toLowerCase();
    if (c.includes("revenue") || c.includes("sales") || c.includes("income")) return "Revenue";
    if (c.includes("cogs") || c.includes("cost of goods") || c.includes("food") || c.includes("raw")) return "COGS";
    if (c.includes("variable")) return "Variable";
    if (c.includes("opex") || c.includes("operating") || c.includes("expense") || c.includes("wage") || c.includes("salar")) return "Operating";
    if (c.includes("depre") || c.includes("amortiz") || c.includes("amort")) return "Depreciation";
    if (c.includes("interest") || c.includes("finance")) return "Interest";
    if (c.includes("tax")) return "Tax";
    if (c.includes("non") && c.includes("op")) return "NonOperating";
    return "Other";
  };

  // Initialize mappings + periods and choose a period that actually has TB lines
  useEffect(() => {
    let mounted = true;
    async function init() {
      setLoading(true);
      setErrorMsg("");
      try {
        const { data: mapData, error: mapErr } = await supabase.from("account_mapping").select("*");
        if (mapErr) throw mapErr;
        if (mounted) setMappings((mapData as Mapping[]) || []);

        // all distinct periods (may include nulls)
        const { data: tbPeriods, error: pErr } = await supabase.from("trial_balances").select("period");
        if (pErr) throw pErr;
        const uniquePeriodsAll = Array.from(new Set(((tbPeriods as any[]) || []).map((p) => p.period)));
        const uniquePeriods = uniquePeriodsAll.filter(Boolean).sort().reverse();

        // find a recent period that actually has lines:
        const { data: tbLineRows, error: tbLineErr } = await supabase.from("trial_balance_lines").select("trial_balance_id");
        if (tbLineErr) throw tbLineErr;
        const tbIdsWithLines = Array.from(new Set((tbLineRows || []).map((r: any) => r.trial_balance_id))).filter(Boolean);

        let preferredPeriod: string | undefined;
        if (tbIdsWithLines.length) {
          // fetch periods for TB ids that have lines
          const { data: periodsWithLines, error: pwErr } = await supabase.from("trial_balances").select("period").in("id", tbIdsWithLines);
          if (!pwErr && periodsWithLines && periodsWithLines.length) {
            const uniq = Array.from(new Set((periodsWithLines || []).map((p: any) => p.period))).filter(Boolean).sort().reverse();
            if (uniq.length) preferredPeriod = uniq[0];
          }
        }

        if (mounted) {
          setPeriods(uniquePeriods);
          if (!periodFilter) {
            if (preferredPeriod) setPeriodFilter(preferredPeriod);
            else if (uniquePeriods.length) setPeriodFilter(uniquePeriods[0]);
          }
        }
      } catch (err: any) {
        console.error("init error", err);
        if (mounted) setErrorMsg(String(err?.message || err || "Init failed"));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    init();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Avoid repeated reloads by tracking last loaded period + mapping snapshot
  const lastLoadedPeriodRef = useRef<string | null>(null);
  const lastMappingKeyRef = useRef<string | null>(null);

  // Aggregation effect (guarded)
  useEffect(() => {
    let mounted = true;

    // Quick early cleanups
    if (!periodFilter) {
      // ensure we clear aggregation if no period is chosen
      setAggByCategory(new Map());
      setLoading(false);
      return;
    }

    // If we've already loaded this exact (period + mapping snapshot), skip
    if (lastLoadedPeriodRef.current === periodFilter && lastMappingKeyRef.current === mappingKey) {
      setLoading(false);
      return;
    }

    async function loadAndAggregate() {
      setLoading(true);
      setErrorMsg("");
      try {
        const { data: tbList, error: tbErr } = await supabase.from("trial_balances").select("id").eq("period", periodFilter);
        if (tbErr) throw tbErr;
        const tbIds = ((tbList || []) as any[]).map((t) => t.id);
        if (!tbIds.length) {
          if (mounted) {
            setAggByCategory(new Map());
            setLoading(false);
          }
          return;
        }

        const { data: linesData, error: linesErr } = await supabase.from("trial_balance_lines").select("*").in("trial_balance_id", tbIds);
        if (linesErr) throw linesErr;
        const lines = (linesData || []) as TBLine[];

        const agg = new Map<string, { signedTotal: number; lines: { name?: string | null; signed: number }[] }>();
        for (const ln of lines) {
          const codeKey = String(ln.account_code || "").toLowerCase().trim();
          const nameKey = String(ln.account_name || "").toLowerCase().trim();
          const m = mappingLookup[codeKey] || mappingLookup[nameKey] || null;
          const cat = (m?.pl_category || ln.account_name || "Unmapped").toString();
          const sign = parseSign(m?.sign_convention);
          const raw = (Number(ln.debit || 0) - Number(ln.credit || 0)) || 0;
          const signed = raw * sign;

          if (!agg.has(cat)) agg.set(cat, { signedTotal: 0, lines: [] });
          const g = agg.get(cat)!;
          g.signedTotal += signed;
          g.lines.push({ name: ln.account_name, signed });
        }

        if (mounted) {
          setAggByCategory(agg);
          lastLoadedPeriodRef.current = periodFilter;
          lastMappingKeyRef.current = mappingKey;
        }
      } catch (err: any) {
        console.error("aggregate error", err);
        if (mounted) setErrorMsg(String(err?.message || err || "Aggregate failed"));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadAndAggregate();

    return () => {
      mounted = false;
    };
  }, [periodFilter, mappingKey, mappingLookup, supabase]);

  // compute totals from aggregated categories
  const totals = useMemo(() => {
    let revenueSigned = 0;
    let cogsSigned = 0;
    let variableSigned = 0;
    let opexSigned = 0;
    let depreciationSigned = 0;
    let nonOpSigned = 0;
    let interestSigned = 0;
    let taxSigned = 0;

    for (const [cat, g] of aggByCategory.entries()) {
      const sec = canonicalSection(cat);
      if (sec === "Revenue") revenueSigned += g.signedTotal;
      else if (sec === "COGS") cogsSigned += g.signedTotal;
      else if (sec === "Variable") variableSigned += g.signedTotal;
      else if (sec === "Operating") opexSigned += g.signedTotal;
      else if (sec === "Depreciation") depreciationSigned += g.signedTotal;
      else if (sec === "NonOperating") nonOpSigned += g.signedTotal;
      else if (sec === "Interest") interestSigned += g.signedTotal;
      else if (sec === "Tax") taxSigned += g.signedTotal;
      else nonOpSigned += g.signedTotal; // treat Other as non-op
    }

    const grossSigned = revenueSigned - cogsSigned - variableSigned;
    const ebitdaSigned = grossSigned - opexSigned;
    const netSigned = ebitdaSigned - depreciationSigned + nonOpSigned - interestSigned - taxSigned;

    return {
      revenueSigned,
      cogsSigned,
      variableSigned,
      opexSigned,
      depreciationSigned,
      nonOpSigned,
      interestSigned,
      taxSigned,
      grossSigned,
      ebitdaSigned,
      netSigned,
    };
  }, [aggByCategory]);

  const renderSectionItems = (sectionMatcher: (cat: string) => boolean) => {
    const rows: { cat: string; amt: number }[] = [];
    for (const [cat, g] of aggByCategory.entries()) {
      if (sectionMatcher(cat)) rows.push({ cat, amt: g.signedTotal });
    }
    if (rows.length === 0) return <div className="text-sm text-slate-400 italic pl-4">No items</div>;
    return rows.map((r) => (
      <div key={r.cat} className="flex justify-between items-center py-1 pl-4">
        <div className="text-slate-700">{r.cat}</div>
        <div className="font-medium text-slate-900">{fmt(r.amt)}</div>
      </div>
    ));
  };

  return (
    <div className="p-8 max-w-7xl mx-auto bg-white min-h-screen text-slate-900">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-slate-800">Income Statement</h1>
          <div className="text-sm text-slate-500">BNB Restaurant and Cafe — {periodFilter || "—"}</div>
        </div>

        <div className="flex items-center gap-4">
          <select
            className="border rounded px-3 py-2 bg-white"
            value={periodFilter || ""}
            onChange={(e) => {
              // when user manually chooses a period, clear lastLoaded refs so it forces reload
              lastLoadedPeriodRef.current = null;
              lastMappingKeyRef.current = null;
              setPeriodFilter(e.target.value);
            }}
          >
            {periods.length === 0 ? <option value="">— no periods —</option> : null}
            {periods.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded">
            Export PDF
          </button>
        </div>
      </div>

      {errorMsg ? (
        <div className="text-red-600 mb-6">{errorMsg}</div>
      ) : loading ? (
        <div className="py-28 text-center text-slate-400">Loading statement...</div>
      ) : aggByCategory.size === 0 ? (
        <div className="py-28 text-center text-slate-500">No trial balance lines found for this period.</div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-baseline border-b pb-3">
            <div className="text-sm text-slate-600 uppercase tracking-wide font-semibold">Total Revenue</div>
            <div className="text-xl font-bold text-slate-900">{fmt(totals.revenueSigned)}</div>
          </div>

          <div className="pl-4">
            <div className="flex justify-between text-slate-600 py-1">
              <div>Cost of Goods Sold (COGS)</div>
              <div>{fmt(totals.cogsSigned)}</div>
            </div>
            <div className="flex justify-between text-slate-600 py-1">
              <div>Variable Costs</div>
              <div>{fmt(totals.variableSigned)}</div>
            </div>
          </div>

          <div className="flex justify-between items-center bg-slate-50 py-3 px-4 rounded">
            <div className="font-semibold">Gross Profit</div>
            <div className="font-bold text-emerald-700">{fmt(totals.grossSigned)}</div>
          </div>

          <div>
            <div className="text-sm text-slate-500 uppercase tracking-wide font-medium mb-2">Operating Expenses</div>
            {renderSectionItems((cat) => canonicalSection(cat) === "Operating")}
          </div>

          <div className="flex justify-between items-center border-t pt-4">
            <div className="font-semibold">EBITDA</div>
            <div className="font-bold">{fmt(totals.ebitdaSigned)}</div>
          </div>

          <div>
            <div className="text-sm text-slate-500 uppercase tracking-wide font-medium mb-2 mt-4">Non-Operating & Other</div>
            {renderSectionItems((cat) => {
              const s = canonicalSection(cat);
              return s === "NonOperating" || s === "Depreciation" || s === "Interest" || s === "Tax" || s === "Other";
            })}
          </div>

          <div className="mt-6 p-5 rounded-lg bg-slate-900 text-white flex justify-between items-center">
            <div className="font-bold">Net Income</div>
            <div className={`text-2xl font-extrabold ${totals.netSigned >= 0 ? "text-emerald-300" : "text-red-300"}`}>
              {fmtSigned(totals.netSigned)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}