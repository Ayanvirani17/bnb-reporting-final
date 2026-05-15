'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────────────
type PlRow = { pl_category: string; pl_line_item: string; amount: number };
type TbOption = { id: string; period: string; created_at: string };
type PeriodData = { rows: PlRow[]; revenue: number; cogs: number; grossProfit: number; operating: number; netProfit: number; grossRevenue: number; discounts: number };

// ─── Constants ────────────────────────────────────────────────────────────────
const VAT = 1.05;
const exVat = (n: number) => n / VAT;

const fmt = (n: number) =>
  Math.abs(n).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtSigned = (n: number) => (n < 0 ? `(${fmt(n)})` : fmt(n));

const C = {
  bg: '#0f1117',
  card: '#1a1d27',
  border: '#2a2d3a',
  text: '#e8eaf0',
  muted: '#8b8fa8',
  green: '#22c55e',
  red: '#ef4444',
  blue: '#6366f1',
  amber: '#f59e0b',
  teal: '#14b8a6',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildPeriodData(rows: PlRow[]): PeriodData {
  const exRows = rows.map(r => ({ ...r, amount: exVat(r.amount) }));
  const sum = (cat: string) => exRows.filter(r => r.pl_category === cat).reduce((a, r) => a + r.amount, 0);

  const revenueRows = exRows.filter(r => r.pl_category === 'revenue');
  const grossRevenue = revenueRows.filter(r => r.amount > 0).reduce((a, r) => a + r.amount, 0);
  const discounts = revenueRows.filter(r => r.amount < 0).reduce((a, r) => a + r.amount, 0);
  const revenue = grossRevenue + discounts;
  const cogs = sum('cogs');
  const grossProfit = revenue - cogs;
  const operating = sum('operating');
  const netProfit = grossProfit - operating;

  return { rows: exRows, revenue, cogs, grossProfit, operating, netProfit, grossRevenue, discounts };
}

function variance(a: number, b: number) {
  const v = a - b;
  const pct = b !== 0 ? (v / Math.abs(b)) * 100 : 0;
  return { v, pct };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SummaryCard({ label, sub, value, color, anchor }: { label: string; sub: string; value: number; color: string; anchor: string }) {
  return (
    <a
      href={anchor}
      style={{ textDecoration: 'none', flex: '1 1 200px' }}
      onClick={e => { e.preventDefault(); document.getElementById(anchor.slice(1))?.scrollIntoView({ behavior: 'smooth' }); }}
    >
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', cursor: 'pointer', transition: 'border-color 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = '#4a4d5a')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
          {label} <span style={{ fontSize: 9, opacity: 0.5 }}>↓</span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color, margin: '8px 0 4px' }}>AED {fmtSigned(value)}</div>
        <div style={{ fontSize: 12, color: C.muted }}>{sub}</div>
      </div>
    </a>
  );
}

// ─── Grouped Bar Chart for P&L comparison ────────────────────────────────────
type ChartItem = { label: string; sub: string; a: number; b?: number };

function PLBarChart({ items, periodAName, periodBName, showComp }: {
  items: ChartItem[]; periodAName: string; periodBName: string; showComp: boolean;
}) {
  const allVals = items.flatMap(i => showComp && i.b !== undefined ? [Math.abs(i.a), Math.abs(i.b)] : [Math.abs(i.a)]);
  const maxVal = Math.max(...allVals, 1);
  const BAR_MAX_H = 160;
  const barW = showComp ? 28 : 42;
  const gap = showComp ? 5 : 0;
  const groupW = showComp ? barW * 2 + gap + 20 : barW + 24;

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      {/* Legend */}
      {showComp && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 11, color: C.muted }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#6366f1', display: 'inline-block' }} />
            {periodAName}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#475569', display: 'inline-block' }} />
            {periodBName}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
        {items.map((item, i) => {
          const hA = Math.max(4, (Math.abs(item.a) / maxVal) * BAR_MAX_H);
          const hB = item.b !== undefined ? Math.max(4, (Math.abs(item.b) / maxVal) * BAR_MAX_H) : 0;
          const isNegA = item.a < 0;
          const isNegB = item.b !== undefined && item.b < 0;
          // Net Rev = indigo, COGS = amber, Operating = blue, Net Profit = green/red
          const colMap: Record<number, string> = { 0: '#6366f1', 1: '#f59e0b', 2: '#6366f1', 3: '#22c55e' };
          const colA = isNegA ? '#ef4444' : (i === items.length - 1 ? (item.a >= 0 ? '#22c55e' : '#ef4444') : (colMap[i] ?? '#6366f1'));
          const colB = isNegB ? '#dc2626' : '#475569';

          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: groupW }}>
              {/* Value labels */}
              <div style={{ display: 'flex', gap: gap, alignItems: 'flex-end' }}>
                <div style={{ fontSize: 9, color: C.muted, textAlign: 'center', width: barW, lineHeight: 1.2 }}>
                  {(Math.abs(item.a) / 1000000).toFixed(1)}M
                </div>
                {showComp && item.b !== undefined && (
                  <div style={{ fontSize: 9, color: '#475569', textAlign: 'center', width: barW, lineHeight: 1.2 }}>
                    {(Math.abs(item.b) / 1000000).toFixed(1)}M
                  </div>
                )}
              </div>
              {/* Bars */}
              <div style={{ display: 'flex', gap, alignItems: 'flex-end' }}>
                <div style={{ width: barW, height: hA, background: colA, borderRadius: '3px 3px 0 0', opacity: isNegA ? 0.7 : 1 }} />
                {showComp && item.b !== undefined && (
                  <div style={{ width: barW, height: hB, background: colB, borderRadius: '3px 3px 0 0', opacity: isNegB ? 0.7 : 1 }} />
                )}
              </div>
              {/* Label */}
              <div style={{ textAlign: 'center', maxWidth: groupW + 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{item.label}</div>
                <div style={{ fontSize: 9, color: C.muted }}>{item.sub}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Baseline */}
      <div style={{ height: 1, background: C.border, marginTop: 2 }} />
    </div>
  );
}

function CollapsibleSection({
  id, title, color, bg, lines, total, totalLabel, compLines, compTotal, showComp, revenueA, revenueB,
}: {
  id: string; title: string; color: string; bg: string;
  lines: { name: string; amount: number }[];
  total: number; totalLabel: string;
  compLines?: { name: string; amount: number }[];
  compTotal?: number; showComp: boolean;
  revenueA: number; revenueB?: number;
}) {
  const [open, setOpen] = useState(true);
  const colCount = showComp ? 5 : 3; // account | A | A% | [B | variance]

  return (
    <>
      {/* Section header — clickable */}
      <tr id={id} onClick={() => setOpen(o => !o)} style={{ background: bg, cursor: 'pointer', userSelect: 'none' }}>
        <td style={{ padding: '11px 20px', fontWeight: 800, fontSize: 13, color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {open ? '▾' : '▸'} {title}
        </td>
        {Array.from({ length: colCount - 1 }).map((_, i) => (
          <td key={i} style={{ padding: '11px 20px' }} />
        ))}
      </tr>

      {/* Line items */}
      {open && lines.map((line, i) => {
        const comp = compLines?.find(c => c.name === line.name);
        const { v, pct } = showComp && comp ? variance(line.amount, comp.amount) : { v: 0, pct: 0 };
        const pctOfRevA = revenueA ? (line.amount / revenueA * 100) : 0;
        return (
          <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ padding: '8px 20px 8px 36px', color: C.text, fontSize: 13 }}>{line.name}</td>
            <td style={{ padding: '8px 20px', textAlign: 'right', color: C.text, fontSize: 13 }}>{fmtSigned(line.amount)}</td>
            <td style={{ padding: '8px 20px', textAlign: 'right', color: C.muted, fontSize: 11 }}>{pctOfRevA.toFixed(1)}%</td>
            {showComp && (
              <>
                <td style={{ padding: '8px 20px', textAlign: 'right', color: C.muted, fontSize: 13 }}>{comp ? fmtSigned(comp.amount) : '—'}</td>
                <td style={{ padding: '8px 20px', textAlign: 'right', fontSize: 12, color: v >= 0 ? C.green : C.red }}>
                  {comp ? `${v >= 0 ? '+' : ''}${fmtSigned(v)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)` : '—'}
                </td>
              </>
            )}
          </tr>
        );
      })}

      {/* Total row */}
      <tr style={{ background: C.card }}>
        <td style={{ padding: '10px 20px', fontWeight: 700, color, fontSize: 13 }}>{totalLabel}</td>
        <td style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 700, color, fontSize: 13 }}>{fmtSigned(total)}</td>
        <td style={{ padding: '10px 20px', textAlign: 'right', color: C.muted, fontSize: 11, fontWeight: 600 }}>
          {revenueA ? (total / revenueA * 100).toFixed(1) : '0.0'}%
        </td>
        {showComp && (
          <>
            <td style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 700, color: C.muted, fontSize: 13 }}>{compTotal !== undefined ? fmtSigned(compTotal) : '—'}</td>
            <td style={{ padding: '10px 20px', textAlign: 'right', fontSize: 12, color: (() => { const { v } = compTotal !== undefined ? variance(total, compTotal) : { v: 0 }; return v >= 0 ? C.green : C.red; })() }}>
              {compTotal !== undefined ? (() => { const { v, pct } = variance(total, compTotal); return `${v >= 0 ? '+' : ''}${fmtSigned(v)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`; })() : '—'}
            </td>
          </>
        )}
      </tr>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [tbOptions, setTbOptions] = useState<TbOption[]>([]);
  const [selectedA, setSelectedA] = useState('');
  const [selectedB, setSelectedB] = useState('');
  const [rawA, setRawA] = useState<PlRow[]>([]);
  const [rawB, setRawB] = useState<PlRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load period list
  useEffect(() => {
    supabase.from('trial_balances').select('id, period, created_at').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { setError(error.message); return; }
        const rows = data ?? [];
        setTbOptions(rows);
        if (rows.length > 0) setSelectedA(rows[0].id);
        if (rows.length > 1) setSelectedB(rows[1].id);
      });
  }, []);

  // Load P&L rows for a given TB id
  async function loadRows(tbId: string): Promise<PlRow[]> {
    if (!tbId) return [];
    const { data, error } = await supabase.from('pl_results').select('pl_category, pl_line_item, amount').eq('trial_balance_id', tbId);
    if (error) { setError(error.message); return []; }
    return (data ?? []).map(r => ({ ...r, amount: Number(r.amount) }));
  }

  useEffect(() => {
    if (!selectedA) return;
    setLoading(true);
    loadRows(selectedA).then(rows => { setRawA(rows); setLoading(false); });
  }, [selectedA]);

  useEffect(() => {
    if (!selectedB) return;
    loadRows(selectedB).then(rows => setRawB(rows));
  }, [selectedB]);

  const A = useMemo(() => rawA.length ? buildPeriodData(rawA) : null, [rawA]);
  const B = useMemo(() => rawB.length ? buildPeriodData(rawB) : null, [rawB]);

  const showComp = !!(A && B && selectedB);
  const periodAName = tbOptions.find(t => t.id === selectedA)?.period ?? '';
  const periodBName = tbOptions.find(t => t.id === selectedB)?.period ?? '';

  // Build line arrays for table
  function getLines(data: PeriodData | null, cat: string) {
    if (!data) return [];
    const map: Record<string, number> = {};
    data.rows.filter(r => r.pl_category === cat).forEach(r => {
      map[r.pl_line_item] = (map[r.pl_line_item] ?? 0) + r.amount;
    });
    return Object.entries(map).map(([name, amount]) => ({ name, amount })).sort((a, b) => a.name.localeCompare(b.name));
  }

  // Export to CSV
  function exportCSV() {
    if (!A) return;
    const rows: string[][] = [['Section', 'Account', periodAName + ' (ex-VAT)', ...(showComp ? [periodBName + ' (ex-VAT)', 'Variance'] : [])]];
    const addSection = (cat: string, label: string) => {
      getLines(A, cat).forEach(line => {
        const comp = showComp ? getLines(B!, cat).find(c => c.name === line.name) : null;
        rows.push([label, line.name, line.amount.toFixed(2), ...(showComp ? [comp ? comp.amount.toFixed(2) : '', comp ? (line.amount - comp.amount).toFixed(2) : ''] : [])]);
      });
    };
    addSection('revenue', 'Revenue');
    addSection('cogs', 'COGS');
    addSection('operating', 'Operating');
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `PL_${periodAName}.csv`; a.click();
  }

  // Export to PDF (print)
  function exportPDF() {
    window.print();
  }

  if (!A && !loading) return (
    <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontFamily: 'Inter, sans-serif' }}>
      No data uploaded yet. Go to <a href="/admin" style={{ color: C.blue, marginLeft: 6 }}>Admin Portal</a> to upload a trial balance.
    </div>
  );

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: 'Inter, sans-serif', color: C.text, padding: '32px 40px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: C.text }}>BNB Profit & Loss</h1>
          <p style={{ color: C.muted, margin: '6px 0 0', fontSize: 14 }}>All figures ex-VAT (÷1.05) · AED</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Period A */}
          <div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, fontWeight: 600 }}>PERIOD A</div>
            <select value={selectedA} onChange={e => setSelectedA(e.target.value)}
              style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
              {tbOptions.map(t => <option key={t.id} value={t.id}>{t.period}</option>)}
            </select>
          </div>
          {/* Period B */}
          <div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, fontWeight: 600 }}>COMPARE WITH</div>
            <select value={selectedB} onChange={e => setSelectedB(e.target.value)}
              style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
              <option value="">— None —</option>
              {tbOptions.map(t => <option key={t.id} value={t.id}>{t.period}</option>)}
            </select>
          </div>
          {/* Export buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button onClick={exportCSV} style={{ background: '#1e3a5f', color: '#93c5fd', border: '1px solid #2563eb', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              ↓ Excel / CSV
            </button>
            <button onClick={exportPDF} style={{ background: '#3b1f1f', color: '#fca5a5', border: '1px solid #dc2626', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              ↓ PDF
            </button>
          </div>
        </div>
      </div>

      {error && <div style={{ color: C.red, marginBottom: 16 }}>Error: {error}</div>}
      {loading && <div style={{ color: C.muted }}>Loading...</div>}

      {A && (
        <>
          {/* ── Summary Cards ── */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 28 }}>
            <SummaryCard label="Net Revenue" sub="Gross revenue less discounts" value={A.revenue} color={C.text} anchor="#section-revenue" />
            <SummaryCard label="Gross Margin" sub={`${A.revenue ? (A.grossProfit / A.revenue * 100).toFixed(1) : '0.0'}% of net revenue`} value={A.grossProfit} color={A.grossProfit >= 0 ? C.green : C.red} anchor="#section-cogs" />
            <SummaryCard label="Opex" sub="Total operating expenses" value={A.operating} color={C.text} anchor="#section-operating" />
            <SummaryCard label="Net Profit" sub={`${A.revenue ? (A.netProfit / A.revenue * 100).toFixed(1) : '0.0'}% net margin`} value={A.netProfit} color={A.netProfit >= 0 ? C.green : C.red} anchor="#section-netprofit" />
          </div>

          {/* ── Chart + Key Takeaways ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, marginBottom: 28 }}>

            {/* P&L Grouped Bar Chart */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 18, color: C.text }}>
                P&L Overview {showComp ? `— ${periodAName} vs ${periodBName}` : `— ${periodAName}`}
              </div>
              <PLBarChart
                periodAName={periodAName}
                periodBName={periodBName}
                showComp={showComp}
                items={[
                  { label: 'Net Revenue', sub: 'after discounts', a: A.revenue, b: B?.revenue },
                  { label: 'COGS', sub: 'direct costs', a: A.cogs, b: B?.cogs },
                  { label: 'Opex', sub: 'operating exp.', a: A.operating, b: B?.operating },
                  { label: 'Net Profit', sub: 'bottom line', a: A.netProfit, b: B?.netProfit },
                ]}
              />
            </div>

            {/* Key Takeaways */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: C.text }}>Key Takeaways</div>
              {[
                { label: 'Net Revenue', val: A.revenue, comp: B?.revenue },
                { label: 'COGS', val: A.cogs, comp: B?.cogs },
                { label: 'Gross Profit', val: A.grossProfit, comp: B?.grossProfit },
                { label: 'Opex', val: A.operating, comp: B?.operating },
                { label: 'Net Profit', val: A.netProfit, comp: B?.netProfit },
                { label: 'Gross Margin', val: null, pct: A.revenue ? (A.grossProfit / A.revenue * 100) : 0, compPct: B?.revenue ? (B.grossProfit / B.revenue * 100) : undefined },
                { label: 'Net Margin', val: null, pct: A.revenue ? (A.netProfit / A.revenue * 100) : 0, compPct: B?.revenue ? (B.netProfit / B.revenue * 100) : undefined },
              ].map((item, i) => {
                const isLast = i === 6;
                const varVal = showComp && B && item.val !== null && item.comp !== undefined ? variance(item.val!, item.comp) : null;
                const varPct = showComp && B && item.val === null && item.pct !== undefined && item.compPct !== undefined ? (item.pct - item.compPct) : null;
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: isLast ? 'none' : `1px solid ${C.border}` }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{item.label}</div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>
                        {item.val !== null && item.val !== undefined ? `AED ${fmtSigned(item.val)}` : `${item.pct!.toFixed(1)}%`}
                      </div>
                      {showComp && B && (
                        <div style={{ fontSize: 11, color: varVal ? (varVal.v >= 0 ? C.green : C.red) : varPct !== null ? (varPct >= 0 ? C.green : C.red) : C.muted }}>
                          {varVal ? `${varVal.v >= 0 ? '+' : ''}${fmtSigned(varVal.v)}` : varPct !== null ? `${varPct >= 0 ? '+' : ''}${varPct.toFixed(1)}pp` : ''}
                          {item.comp !== undefined && item.val !== null ? ` · ${fmtSigned(item.comp)}` : ''}
                          {item.compPct !== undefined && item.val === null ? ` · ${item.compPct.toFixed(1)}%` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Full P&L Table ── */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Full P&L Detail</div>
              <div style={{ fontSize: 12, color: C.muted }}>Click section headers to expand / collapse</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#12151f' }}>
                  <th style={{ padding: '12px 20px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>Account</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right', color: C.muted, fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>{periodAName} (AED)</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right', color: C.muted, fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>% Rev</th>
                  {showComp && <>
                    <th style={{ padding: '12px 20px', textAlign: 'right', color: C.muted, fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>{periodBName} (AED)</th>
                    <th style={{ padding: '12px 20px', textAlign: 'right', color: C.muted, fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>Variance</th>
                  </>}
                </tr>
              </thead>
              <tbody>
                <CollapsibleSection id="section-revenue" title="Revenue" color="#22c55e" bg="#0d2318" lines={getLines(A, 'revenue')} total={A.revenue} totalLabel="Net Revenue" compLines={showComp ? getLines(B!, 'revenue') : undefined} compTotal={showComp ? B!.revenue : undefined} showComp={showComp} revenueA={A.revenue} revenueB={B?.revenue} />

                <CollapsibleSection id="section-cogs" title="Cost of Sales (COGS)" color={C.amber} bg="#1f1a0d" lines={getLines(A, 'cogs')} total={A.cogs} totalLabel="Total COGS" compLines={showComp ? getLines(B!, 'cogs') : undefined} compTotal={showComp ? B!.cogs : undefined} showComp={showComp} revenueA={A.revenue} revenueB={B?.revenue} />

                {/* Gross Profit row */}
                <tr style={{ background: '#0d1a2e' }}>
                  <td style={{ padding: '12px 20px', fontWeight: 800, color: C.text, fontSize: 14 }}>Gross Profit</td>
                  <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 800, color: A.grossProfit >= 0 ? C.green : C.red, fontSize: 14 }}>{fmtSigned(A.grossProfit)}</td>
                  <td style={{ padding: '12px 20px', textAlign: 'right', color: C.muted, fontSize: 11, fontWeight: 600 }}>{A.revenue ? (A.grossProfit / A.revenue * 100).toFixed(1) : '0.0'}%</td>
                  {showComp && <>
                    <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: C.muted, fontSize: 13 }}>{fmtSigned(B!.grossProfit)}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 12, color: variance(A.grossProfit, B!.grossProfit).v >= 0 ? C.green : C.red }}>
                      {(() => { const { v, pct } = variance(A.grossProfit, B!.grossProfit); return `${v >= 0 ? '+' : ''}${fmtSigned(v)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`; })()}
                    </td>
                  </>}
                </tr>

                <CollapsibleSection id="section-operating" title="Operating Expenses" color={C.blue} bg="#0f1228" lines={getLines(A, 'operating')} total={A.operating} totalLabel="Total Opex" compLines={showComp ? getLines(B!, 'operating') : undefined} compTotal={showComp ? B!.operating : undefined} showComp={showComp} revenueA={A.revenue} revenueB={B?.revenue} />

                {/* Net Profit row */}
                <tr id="section-netprofit" style={{ background: A.netProfit >= 0 ? '#0d2318' : '#2d0f0f' }}>
                  <td style={{ padding: '14px 20px', fontWeight: 900, color: A.netProfit >= 0 ? C.green : C.red, fontSize: 15 }}>Net Profit</td>
                  <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 900, color: A.netProfit >= 0 ? C.green : C.red, fontSize: 15 }}>{fmtSigned(A.netProfit)}</td>
                  <td style={{ padding: '14px 20px', textAlign: 'right', color: C.muted, fontSize: 11, fontWeight: 700 }}>{A.revenue ? (A.netProfit / A.revenue * 100).toFixed(1) : '0.0'}%</td>
                  {showComp && <>
                    <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, color: C.muted, fontSize: 13 }}>{fmtSigned(B!.netProfit)}</td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', fontSize: 12, color: variance(A.netProfit, B!.netProfit).v >= 0 ? C.green : C.red }}>
                      {(() => { const { v, pct } = variance(A.netProfit, B!.netProfit); return `${v >= 0 ? '+' : ''}${fmtSigned(v)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`; })()}
                    </td>
                  </>}
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Print styles ── */}
          <style>{`
            @media print {
              body { background: white !important; color: black !important; }
              button { display: none !important; }
              select { display: none !important; }
            }
          `}</style>
        </>
      )}
    </div>
  );
}