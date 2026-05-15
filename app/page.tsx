"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [periods, setPeriods] = useState<string[]>([]);
  const [periodA, setPeriodA] = useState("");
  const [periodB, setPeriodB] = useState("");
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/pl/periods")
      .then(res => res.json())
      .then(d => setPeriods(d.periods || []));
  }, []);

  const loadData = async () => {
    const res = await fetch(`/api/pl/aggregate?periodA=${periodA}&periodB=${periodB}`);
    const d = await res.json();
    setData(d);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>BNB P&L Dashboard</h1>

      <div style={{ marginBottom: 20 }}>
        <select onChange={e => setPeriodA(e.target.value)}>
          <option>Select Period A</option>
          {periods.map(p => <option key={p}>{p}</option>)}
        </select>

        <select onChange={e => setPeriodB(e.target.value)} style={{ marginLeft: 10 }}>
          <option>Select Period B</option>
          {periods.map(p => <option key={p}>{p}</option>)}
        </select>

        <button onClick={loadData} style={{ marginLeft: 10 }}>
          Compare
        </button>
      </div>

      {data && (
        <table border={1} cellPadding={10}>
          <thead>
            <tr>
              <th>Category</th>
              <th>{periodA}</th>
              <th>{periodB}</th>
            </tr>
          </thead>
          <tbody>
            {data.categories.map((cat: string, i: number) => (
              <tr key={cat}>
                <td>{cat}</td>
                <td>{data.seriesA[i]}</td>
                <td>{data.seriesB[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}