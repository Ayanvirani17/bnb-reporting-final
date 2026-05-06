"use client";

import React, { useState } from "react";
import * as XLSX from "xlsx";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function AdminPage() {
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [status, setStatus] = useState<string>("Ready");
  const [period, setPeriod] = useState<string>("");
  const [entityId, setEntityId] = useState<string>("");

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setStatus("Scanning spreadsheet for data...");
    setPreviewRows([]);

    const data = await f.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // Convert sheet to a simple 2D Array
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    const results: any[] = [];

    // Scan every row
    rows.forEach((row) => {
      // Find the first string that looks like an account name (usually index 1)
      const accountName = String(row[1] || "").trim();
      
      // Look for numbers in the most common positions for your file (Indexes 4, 5, 6)
      const debit = parseFloat(String(row[4]).replace(/[^0-9.-]+/g, "")) || 0;
      const credit = parseFloat(String(row[5]).replace(/[^0-9.-]+/g, "")) || 0;

      // VALIDATION: If we have a name and a number, keep it
      if (accountName.length > 3 && (debit !== 0 || credit !== 0)) {
        // Skip grand totals
        if (!accountName.toLowerCase().includes("total") && !accountName.toLowerCase().includes("balance")) {
          results.push({ accountName, debit, credit });
        }
      }
    });

    if (results.length === 0) {
      // LAST RESORT: Scan row index 0 instead of 1
      rows.forEach((row) => {
        const altName = String(row[0] || "").trim();
        const altDebit = parseFloat(String(row[3]).replace(/[^0-9.-]+/g, "")) || 0;
        if (altName.length > 3 && altDebit !== 0) {
            results.push({ accountName: altName, debit: altDebit, credit: 0 });
        }
      });
    }

    setPreviewRows(results);
    setStatus(results.length > 0 ? `Detected ${results.length} accounts!` : "Still no rows detected. Please check the 'Debug' console.");
    console.log("Parsed Results:", results);
  }

  async function uploadToDatabase() {
    if (previewRows.length === 0) { setStatus("Nothing to upload."); return; }
    const supabase = getSupabaseClient();
    setStatus("Connecting to Database...");

    const { data: tb, error: tbErr } = await supabase
      .from("trial_balances")
      .insert([{ entity_id: entityId || null, period: period }])
      .select().single();

    if (tbErr) { setStatus("Error: " + tbErr.message); return; }

    const lines = previewRows.map(r => ({
        trial_balance_id: tb.id,
        account_name: r.accountName,
        debit: r.debit,
        credit: r.credit
    }));
    
    const { error: lineErr } = await supabase.from("trial_balance_lines").insert(lines);
    if (lineErr) { setStatus("Error saving lines: " + lineErr.message); return; }

    // Final P&L creation
    const plData = previewRows.map(r => ({
        trial_balance_id: tb.id,
        entity_id: entityId || null,
        period: period,
        pl_category: (r.accountName.toLowerCase().includes("revenue") || r.accountName.toLowerCase().includes("income")) ? "Revenue" : "Expense",
        pl_line_item: r.accountName,
        amount: r.debit - r.credit
    }));
    await supabase.from("pl_results").insert(plData);

    setStatus("SUCCESS! Check your Dashboard now.");
  }

  return (
    <div style={{ padding: '50px', background: '#fafafa', minHeight: '100vh' }}>
      <div style={{ background: 'white', padding: '30px', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <h1 style={{ margin: 0, color: '#333' }}>Step 1: Upload Trial Balance</h1>
        <p style={{ color: '#666' }}>Fill details and select your .xls file</p>
        
        <div style={{ marginTop: '20px' }}>
            <input type="text" placeholder="Entity ID (Optional)" value={entityId} onChange={e => setEntityId(e.target.value)} style={{ padding: '12px', width: '200px', marginRight: '10px', border: '1px solid #ddd' }} />
            <input type="text" placeholder="Reporting Period" value={period} onChange={e => setPeriod(e.target.value)} style={{ padding: '12px', width: '200px', border: '1px solid #ddd' }} />
        </div>

        <div style={{ marginTop: '20px' }}>
          <input type="file" onChange={handleFileUpload} style={{ display: 'block', marginBottom: '20px' }} />
          <button onClick={uploadToDatabase} style={{ background: '#007bff', color: 'white', padding: '15px 40px', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px' }}>
            UPLOAD & UPDATE DASHBOARD
          </button>
        </div>

        <p style={{ marginTop: '20px', fontWeight: 'bold' }}>Status: {status}</p>

        {previewRows.length > 0 && (
          <div style={{ marginTop: '30px' }}>
            <h3>Previewing Data:</h3>
            <table border={1} style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ background: '#eee' }}>
                <tr><th style={{ padding: '10px' }}>Account</th><th style={{ padding: '10px' }}>Debit</th><th style={{ padding: '10px' }}>Credit</th></tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 5).map((r, i) => (
                  <tr key={i}><td style={{ padding: '10px' }}>{r.accountName}</td><td style={{ padding: '10px' }}>{r.debit}</td><td style={{ padding: '10px' }}>{r.credit}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}