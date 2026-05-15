'use client';
import React, { useEffect, useState } from 'react';

type Row = {
  pl_category: string;
  pl_line_item: string;
  amount: number;
};

export default function Page() {
  const [tb, setTb] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tbParam = params.get('tb');
    setTb(tbParam);
    if (!tbParam) return;

    setLoading(true);
    fetch('/api/pl_for_tb?tb=' + encodeURIComponent(tbParam))
      .then(async (r) => {
        if (!r.ok) {
          const txt = await r.text();
          throw new Error('API error ' + r.status + ': ' + txt);
        }
        return r.json();
      })
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => setError(String(err?.message ?? err)))
      .finally(() => setLoading(false));
  }, []);

  const format = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let revenue = 0;
  let expenses = 0;
  if (rows) {
    for (const r of rows) {
      const cat = (r.pl_category || '').toLowerCase();
      const amt = Number(r.amount || 0);
      if (cat.includes('revenue') || cat.includes('sales') || cat.includes('cash')) revenue += amt;
      else expenses += amt;
    }
  }
  const net = revenue - expenses;

  return (
    <div style={{ padding: 28, fontFamily: 'Inter, system-ui, Arial, sans-serif', background: '#f3f4f6', minHeight: '100vh', color: '#111827' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ margin: '12px 0 6px' }}>P&L Demo</h1>
        <div style={{ color: '#6b7280', marginBottom: 18 }}>TB: <strong>{tb ?? '— (add ?tb=ID to URL)'}</strong></div>

        {loading && <div style={{ padding: 12 }}>Loading...</div>}
        {error && <div style={{ padding: 12, color: 'crimson' }}>Error: {error}</div>}

        {!loading && !error && rows && (
          <>
            <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
              <div style={{ flex: 1, background: '#fff', padding: 18, borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>TOTAL NET</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, color: net >= 0 ? '#047857' : '#b91c1c' }}>{format(net)}</div>
              </div>
              <div style={{ flex: 1, background: '#fff', padding: 18, borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>REVENUE</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{format(revenue)}</div>
              </div>
              <div style={{ flex: 1, background: '#fff', padding: 18, borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>TOTAL EXPENSES</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{format(expenses)}</div>
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 10, padding: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
              <h3 style={{ marginTop: 0, color: '#111827' }}>Detailed Lines</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#6b7280', borderBottom: '1px solid #e6e9ee' }}>
                      <th style={{ padding: '10px 8px' }}>Line Item</th>
                      <th style={{ padding: '10px 8px' }}>Category</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px 8px', color: '#111827' }}>{r.pl_line_item}</td>
                        <td style={{ padding: '10px 8px', color: '#6b7280' }}>{r.pl_category}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: '#111827' }}>{format(Number(r.amount || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ marginTop: 10, color: '#6b7280' }}>Rows: {rows.length}</div>
          </>
        )}
      </div>
    </div>
  );
}
