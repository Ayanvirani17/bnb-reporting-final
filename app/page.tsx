"use client";
import { useEffect, useState } from "react";

export default function Home() {
  const [periods, setPeriods] = useState<string[]>([]);
  const [periodA, setPeriodA] = useState("");
  const [periodB, setPeriodB] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/pl/periods")
      .then(res => res.json())
      .then(d => setPeriods(d.periods || []));
  }, []);

  const loadData = async () => {
    if (!periodA) return alert("Please select at least Period A");
    setLoading(true);
    const res = await fetch(`/api/pl/aggregate?periodA=${periodA}&periodB=${periodB}`);
    const d = await res.json();
    setData(d);
    setLoading(false);
  };

  const fmt = (n: number) => n?.toLocaleString("en-AE", { minimumFractionDigits: 2 });

  return (
    <div style={{ fontFamily: "sans-serif", background: "#0f172a", minHeight: "100vh", color: "#f1f5f9", padding: "32px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#38bdf8", margin: 0 }}>📊 BNB P&L Dashboard</h1>
          <p style={{ color: "#94a3b8", marginTop: 4 }}>Compare profit & loss across periods</p>
        </div>

        {/* Controls */}
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 32, display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 12, marginBottom: 6 }}>PERIOD A</label>
            <select value={periodA} onChange={e => setPeriodA(e.target.value)}
              style={{ background: "#0f172a", color: "#f1f5f9", border: "1px solid #334155", borderRadius: 8, padding: "10px 16px", fontSize: 14, minWidth: 160 }}>
              <option value="">Select Period A</option>
              {periods.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 12, marginBottom: 6 }}>PERIOD B (optional)</label>
            <select value={periodB} onChange={e => setPeriodB(e.target.value)}
              style={{ background: "#0f172a", color: "#f1f5f9", border: "1px solid #334155", borderRadius: 8, padding: "10px 16px", fontSize: 14, minWidth: 160 }}>
              <option value="">Select Period B</option>
              {periods.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <button onClick={loadData}
            style={{ background: "#38bdf8", color: "#0f172a", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            {loading ? "Loading..." : "Compare →"}
          </button>
        </div>

        {/* Totals Cards */}
        {data && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
            {periodA && (
              <div style={{ background: "#1e293b", borderRadius: 12, padding: 20, borderLeft: "4px solid #38bdf8" }}>
                <p style={{ color: "#94a3b8", fontSize: 12, margin: 0 }}>NET P&L — {periodA}</p>
                <p style={{ fontSize: 24, fontWeight: 700, margin: "8px 0 0", color: data.totals.totalA >= 0 ? "#4ade80" : "#f87171" }}>
                  AED {fmt(data.totals.totalA)}
                </p>
              </div>
            )}
            {periodB && (
              <div style={{ background: "#1e293b", borderRadius: 12, padding: 20, borderLeft: "4px solid #818cf8" }}>
                <p style={{ color: "#94a3b8", fontSize: 12, margin: 0 }}>NET P&L — {periodB}</p>
                <p style={{ fontSize: 24, fontWeight: 700, margin: "8px 0 0", color: data.totals.totalB >= 0 ? "#4ade80" : "#f87171" }}>
                  AED {fmt(data.totals.totalB)}
                </p>
              </div>
            )}
            {periodA && periodB && (
              <div style={{ background: "#1e293b", borderRadius: 12, padding: 20, borderLeft: "4px solid #fb923c" }}>
                <p style={{ color: "#94a3b8", fontSize: 12, margin: 0 }}>VARIANCE</p>
                <p style={{ fontSize: 24, fontWeight: 700, margin: "8px 0 0", color: (data.totals.totalA - data.totals.totalB) >= 0 ? "#4ade80" : "#f87171" }}>
                  AED {fmt(data.totals.totalA - data.totals.totalB)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Table */}
        {data && (
          <div style={{ background: "#1e293b", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#0f172a" }}>
                  <th style={{ padding: "14px 20px", textAlign: "left", color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>CATEGORY</th>
                  {periodA && <th style={{ padding: "14px 20px", textAlign: "right", color: "#38bdf8", fontSize: 12, fontWeight: 600 }}>{periodA}</th>}
                  {periodB && <th style={{ padding: "14px 20px", textAlign: "right", color: "#818cf8", fontSize: 12, fontWeight: 600 }}>{periodB}</th>}
                  {periodA && periodB && <th style={{ padding: "14px 20px", textAlign: "right", color: "#fb923c", fontSize: 12, fontWeight: 600 }}>VARIANCE</th>}
                </tr>
              </thead>
              <tbody>
                {data.categories.map((cat: string, i: number) => {
                  const a = data.seriesA[i] || 0;
                  const b = data.seriesB[i] || 0;
                  const variance = a - b;
                  return (
                    <tr key={cat} style={{ borderTop: "1px solid #334155" }}>
                      <td style={{ padding: "14px 20px", color: "#f1f5f9", textTransform: "capitalize" }}>{cat.replace(/_/g, " ")}</td>
                      {periodA && <td style={{ padding: "14px 20px", textAlign: "right", color: "#e2e8f0" }}>AED {fmt(a)}</td>}
                      {periodB && <td style={{ padding: "14px 20px", textAlign: "right", color: "#e2e8f0" }}>AED {fmt(b)}</td>}
                      {periodA && periodB && <td style={{ padding: "14px 20px", textAlign: "right", color: variance >= 0 ? "#4ade80" : "#f87171", fontWeight: 600 }}>AED {fmt(variance)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!data && !loading && (
          <div style={{ textAlign: "center", color: "#475569", padding: 60 }}>
            Select a period above and click Compare to view your P&L
          </div>
        )}
      </div>
    </div>
  );
}
ENDOFFILE