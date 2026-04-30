"use client"

import React, { useState } from "react"
import * as XLSX from "xlsx"
import { getSupabaseClient } from "@/lib/supabaseClient"

type PreviewRow = {
  accountName: string
  debit: number
  credit: number
}

export default function AdminPage() {
  const [period, setPeriod] = useState<string>("")
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [status, setStatus] = useState<string>("")
  const [isUploading, setIsUploading] = useState(false)

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus(\`Reading \${file.name}...\`)
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result
        if (!data) throw new Error("No file data")
        const workbook = XLSX.read(data, { type: "array" })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]

        // Header is on row 6 in your sample -> range: 5 (0-based)
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { range: 5, defval: "" })

        const parsed: PreviewRow[] = rows
          .map((r) => ({
            accountName: String(r["Account Name"] ?? r["Account"] ?? "").trim(),
            debit: Number(r["Debit"] ?? 0) || 0,
            credit: Number(r["Credit"] ?? 0) || 0,
          }))
          .filter((r) => r.accountName && !/total/i.test(r.accountName) && r.accountName.toLowerCase() !== "difference")

        setPreviewRows(parsed)
        setStatus(\`Parsed \${parsed.length} rows from \${file.name}\`)
      } catch (err: any) {
        console.error(err)
        setStatus("Failed to parse file: " + (err?.message ?? err))
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function uploadToDatabase() {
    if (!period) return setStatus("Please enter a period (e.g., March 2026)")
    if (previewRows.length === 0) return setStatus("No rows to upload — please upload and preview a file first.")

    const supabase = getSupabaseClient()
    if (!supabase) return setStatus("Supabase client not available. Check env vars in Vercel.")

    try {
      setIsUploading(true)
      setStatus("Creating trial balance record...")
      const { data: tbData, error: tbError } = await supabase
        .from("trial_balances")
        .insert([{ period, created_at: new Date().toISOString() }])
        .select()
        .limit(1)
      if (tbError) throw tbError
      const trial_balance_id = tbData?.[0]?.id ?? null

      setStatus("Uploading trial balance lines...")
      const formattedLines = previewRows.map((r) => ({
        trial_balance_id,
        account_code: null,
        account_name: r.accountName,
        debit: r.debit,
        credit: r.credit,
      }))

      const { error: linesError } = await supabase.from("trial_balance_lines").insert(formattedLines)
      if (linesError) throw linesError

      setStatus("Generating P&L...")
      await generatePLFromLines(supabase, trial_balance_id, period, previewRows)

      setStatus(\`SUCCESS: P&L generated for \${period}\`)
    } catch (err: any) {
      console.error(err)
      setStatus("Upload failed: " + (err?.message ?? JSON.stringify(err)))
    } finally {
      setIsUploading(false)
    }
  }

  async function generatePLFromLines(supabase: any, trial_balance_id: string | null, periodVal: string, rows: PreviewRow[]) {
    const { data: mappings, error: mapErr } = await supabase.from("account_mapping").select("*")
    if (mapErr) {
      console.warn("account_mapping fetch error:", mapErr)
    }

    function findMapping(accountName: string) {
      if (!mappings) return null
      return mappings.find((m: any) => {
        if (m.account_code && String(m.account_code) === String(accountName)) return true
        if (!m.account_code && accountName.toLowerCase().includes(String(m.account_name ?? "").toLowerCase())) return true
        return false
      }) ?? null
    }

    const agg = new Map<string, number>()
    for (const r of rows) {
      const mapping = findMapping(r.accountName)
      if (!mapping) continue
      const sign = mapping.sign_convention ?? 1
      const amt = (Number(r.debit) - Number(r.credit)) * Number(sign)
      const key = \`\${mapping.pl_category}||\${mapping.pl_line_item}\`
      agg.set(key, (agg.get(key) ?? 0) + amt)
    }

    const inserts: any[] = []
    for (const [key, amount] of agg.entries()) {
      const [pl_category, pl_line_item] = key.split("||")
      inserts.push({
        trial_balance_id,
        period: periodVal,
        pl_category,
        pl_line_item,
        amount,
      })
    }

    if (inserts.length === 0) {
      await supabase.from("pl_results").insert([{
        trial_balance_id,
        period: periodVal,
        pl_category: "Unmapped",
        pl_line_item: "Unmapped Lines",
        amount: rows.reduce((s, r) => s + (Number(r.debit) - Number(r.credit)), 0),
      }])
      return
    }

    if (trial_balance_id) {
      await supabase.from("pl_results").delete().eq("trial_balance_id", trial_balance_id)
    } else {
      await supabase.from("pl_results").delete().eq("period", periodVal)
    }

    const { error: plErr } = await supabase.from("pl_results").insert(inserts)
    if (plErr) console.warn("pl_results insert error:", plErr)
  }

  return (
    <div className="min-h-screen p-8 bg-black text-white">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-black mb-6">Admin Portal</h1>

        <label className="block mb-2 text-sm text-gray-400">PERIOD NAME</label>
        <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="March 2026" className="w-full bg-black border border-gray-800 rounded-xl p-3 mb-4" />

        <label className="block mb-2 text-sm text-gray-400">Upload Trial Balance (.xlsx)</label>
        <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="mb-4" />

        <div className="mb-4">
          <button onClick={uploadToDatabase} disabled={isUploading} className="px-6 py-3 bg-white text-black rounded-2xl font-bold">
            {isUploading ? "Uploading..." : "Upload & Generate P&L"}
          </button>
        </div>

        {status && <div className="p-3 rounded-lg bg-gray-900/40 mb-4">{status}</div>}

        {previewRows.length > 0 && (
          <div className="bg-gray-900 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-2">Preview (first 20 rows)</div>
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs text-gray-500">
                  <th className="p-2">Account</th>
                  <th className="p-2 text-right">Debit</th>
                  <th className="p-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 20).map((r, i) => (
                  <tr key={i} className="odd:bg-black/0 even:bg-white/2">
                    <td className="p-2">{r.accountName}</td>
                    <td className="p-2 text-right">{r.debit.toFixed(2)}</td>
                    <td className="p-2 text-right">{r.credit.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
