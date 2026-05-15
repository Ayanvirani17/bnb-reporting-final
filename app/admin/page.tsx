'use client';

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabaseClient';
import { v4 as uuidv4 } from 'uuid';

type ParsedRow = {
  account_code: string;
  account_name: string;
  year_amount: number;
  debit: number;
  credit: number;
};

export default function AdminPage() {
  const [file, setFile] = useState<File | null>(null);
  const [period, setPeriod] = useState('');
  const [status, setStatus] = useState('Ready');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ mapped: number; unmapped: number; unmappedCodes: string[] } | null>(null);

  async function handleUpload() {
    if (!file || !period.trim()) {
      setStatus('❌ Please enter a period and select a file.');
      return;
    }

    setLoading(true);
    setPreview(null);
    setStatus('Reading file...');

    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        // Find header row
        let headerRowIndex = -1;
        for (let i = 0; i < raw.length; i++) {
          const cell = String(raw[i]?.[0] ?? '').trim().toLowerCase();
          if (cell === 'gl account') {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          throw new Error('Could not find "GL Account" header row. Check your file format.');
        }

        const headers = raw[headerRowIndex];
        console.log('Headers found:', headers);

        // Column positions (based on your TB file structure)
        // 0 = GL Account, 1 = GL Account Name, 2 = Year, 6 = Debit.1, 7 = Credit.1
        const COL_CODE   = 0;
        const COL_NAME   = 1;
        const COL_YEAR   = 2;
        const COL_DEBIT  = 6;
        const COL_CREDIT = 7;

        const skipPhrases = [
  'assets', 'liability', 'liabilities',
  'sub total', 'subtotal', 'total', 'grand total',
  'balance sheet', 'profit and loss', 'prologic',
  'difference', 'provision for taxation',
];

        const parsedRows: ParsedRow[] = raw
          .slice(headerRowIndex + 1)
          .map((row) => {
            // Use raw code with leading zeros preserved
            const code = String(row[COL_CODE] ?? '').trim();
            const name = String(row[COL_NAME] ?? '').trim();

            if (!code || !name) return null;

            // Skip non-numeric codes (section headers)
            if (!/^\d+$/.test(code)) return null;

            // Skip summary/header rows
            const lower = name.toLowerCase();
            if (skipPhrases.some((p) => lower.includes(p))) return null;

            const yearAmount = parseFloat(String(row[COL_YEAR] ?? '0').replace(/,/g, '')) || 0;
            const debit      = parseFloat(String(row[COL_DEBIT] ?? '0').replace(/,/g, '')) || 0;
            const credit     = parseFloat(String(row[COL_CREDIT] ?? '0').replace(/,/g, '')) || 0;

            return { account_code: code, account_name: name, year_amount: yearAmount, debit, credit };
          })
          .filter((r): r is ParsedRow => r !== null);

        if (parsedRows.length === 0) {
          throw new Error('No valid rows found. Check your file format.');
        }

        setStatus(`Parsed ${parsedRows.length} rows. Saving trial balance...`);

        // Create trial balance record
        const tbId = uuidv4();
        const { error: tbError } = await supabase.from('trial_balances').insert({
          id: tbId,
          period: period.trim(),
          status: 'completed',
        });
        if (tbError) throw tbError;

        // Insert trial balance lines in batches of 50
        const tbLines = parsedRows.map((row) => ({
          id: uuidv4(),
          trial_balance_id: tbId,
          account_code: row.account_code,
          account_name: row.account_name,
          debit: row.debit,
          credit: row.credit,
        }));

        for (let i = 0; i < tbLines.length; i += 50) {
          const { error } = await supabase.from('trial_balance_lines').insert(tbLines.slice(i, i + 50));
          if (error) throw error;
        }

        setStatus('Trial balance saved. Matching account mappings...');

        // Fetch all account mappings
        const { data: mappings, error: mapError } = await supabase
          .from('account_mapping')
          .select('account_code, pl_category, pl_line_item, sign_convention');
        if (mapError) throw mapError;

        // Build lookup map — raw code as key
        const mappingMap = new Map(
          (mappings ?? []).map((m) => [String(m.account_code).trim(), m])
        );

        // Generate P&L rows
        const unmappedCodes: string[] = [];
        const plResults = parsedRows
          .map((row) => {
            const mapping = mappingMap.get(row.account_code);
            if (!mapping) {
              unmappedCodes.push(`${row.account_code} (${row.account_name})`);
              return null;
            }

            // Revenue accounts in TB are stored as negative (credit nature),
            // so flip sign. All other categories use year_amount as-is.
            const amount =
              mapping.pl_category === 'revenue'
                ? row.year_amount * -1
                : row.year_amount;

            return {
              id: uuidv4(),
              trial_balance_id: tbId,
              period: period.trim(),
              pl_category: mapping.pl_category,
              pl_line_item: mapping.pl_line_item,
              amount,
            };
          })
          .filter(Boolean);

        if (plResults.length === 0) {
          throw new Error('No P&L rows generated. Check account_mapping table has correct codes.');
        }

        // Insert P&L results
        const { error: plError } = await supabase.from('pl_results').insert(plResults.filter((r): r is NonNullable<typeof r> => r !== null));
        if (plError) throw plError;

        setPreview({
          mapped: plResults.length,
          unmapped: unmappedCodes.length,
          unmappedCodes: unmappedCodes.slice(0, 10),
        });

        setStatus(`✅ Done! ${parsedRows.length} TB rows uploaded, ${plResults.length} P&L entries generated.`);
        setFile(null);
        setPeriod('');
        const input = document.getElementById('fileInput') as HTMLInputElement | null;
        if (input) input.value = '';

      } catch (err: any) {
        setStatus(`❌ Error: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    reader.readAsArrayBuffer(file);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fb', padding: 24 }}>
      <div style={{ background: '#fff', padding: 40, borderRadius: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.08)', width: 500 }}>

        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, color: '#111827' }}>BNB Admin Portal</h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 28 }}>Upload a trial balance to generate the P&L dashboard.</p>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#374151' }}>Period</label>
        <input
          type="text"
          placeholder="e.g. June 2025"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, marginBottom: 18, boxSizing: 'border-box' }}
        />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#374151' }}>Trial Balance File (XLS / XLSX)</label>
        <input
          id="fileInput"
          type="file"
          accept=".xls,.xlsx"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ width: '100%', fontSize: 13, marginBottom: 24 }}
        />

        <button
          onClick={handleUpload}
          disabled={loading}
          style={{
            width: '100%', padding: 14,
            background: loading ? '#9ca3af' : '#111827',
            color: '#fff', border: 'none', borderRadius: 10,
            fontWeight: 700, fontSize: 15,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Processing...' : 'Upload & Generate Dashboard →'}
        </button>

        {/* Status box */}
        <div style={{
          marginTop: 18, padding: '12px 14px',
          background: status.startsWith('✅') ? '#ecfdf5' : status.startsWith('❌') ? '#fef2f2' : '#f9fafb',
          border: `1px solid ${status.startsWith('✅') ? '#86efac' : status.startsWith('❌') ? '#fca5a5' : '#e5e7eb'}`,
          borderRadius: 10, fontSize: 13, color: '#374151', lineHeight: 1.6,
        }}>
          <strong>Status:</strong> {status}
        </div>

        {/* Unmapped accounts warning */}
        {preview && preview.unmapped > 0 && (
          <div style={{ marginTop: 14, padding: '12px 14px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, fontSize: 12, color: '#92400e' }}>
            <strong>⚠️ {preview.unmapped} unmapped account(s) excluded from P&L:</strong>
            <ul style={{ margin: '6px 0 0 0', paddingLeft: 18 }}>
              {preview.unmappedCodes.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
            {preview.unmapped > 10 && <p style={{ margin: '4px 0 0 0' }}>...and {preview.unmapped - 10} more</p>}
          </div>
        )}

      </div>
    </div>
  );
}