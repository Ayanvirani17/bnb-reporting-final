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

  // Debug-only states (temporary)
  const [rawRows, setRawRows] = useState<any[]>([])
  const [rawKeys, setRawKeys] = useState<string[]>([])

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus(`Reading ${file.name}...`)
    const reader = new FileReader()

    reader.onload = (evt: ProgressEvent<FileReader>) => {
      try {
        const data = evt.target?.result
        if (!data) throw new Error("No file data")
        const workbook = XLSX.read(data as ArrayBuffer, { type: "array" })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]

        // Use range:5 because your header is on row 6 (0-indexed)
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { range: 5, defval: "" })

        // Save raw for debug view
        setRawRows(rows.slice(0, 50))
        setRawKeys(Object.keys(rows[0] ?? {}))

        // If the first returned row looks like a header row (contains words like Account / Debit / Credit),
        // use it to detect which internal key (e.g., __EMPTY, __EMPTY_2, ...) maps to which column,
        // then drop that header row from the data before parsing.
        let dataRows = rows
        let accountKey: string | null = null
        let debitKey: string | null = null
        let creditKey: string | null = null

        if (rows.length > 0) {
          const headerRow = rows[0]
          const headerValues = Object.values(headerRow).map((v: any) => String(v ?? "").trim().toLowerCase())

          const looksLikeHeader =
            headerValues.some((v: string) => /account|acct|description|name/.test(v)) ||
            headerValues.some((v: string) => /debit|dr/.test(v)) ||
            headerValues.some((v: string) => /credit|cr/.test(v))

          if (looksLikeHeader) {
            // find keys by matching header values
            for (const k of Object.keys(headerRow)) {
              const hv = String(headerRow[k] ?? "").trim().toLowerCase()
              if (!accountKey && /account|acct|description|name/.test(hv)) accountKey = k
              if (!debitKey && /debit|dr/.test(hv)) debitKey = k
              if (!creditKey && /credit|cr/.test(hv)) creditKey = k
            }
            // drop header row from data
            dataRows = rows.slice(1)
          }
        }

        // Fallback: if we didn't find keys from headerRow, try to infer keys from data row keys
        const sampleKeys = Object.keys(rows[0] ?? {})
        if (!accountKey) accountKey = sampleKeys.find(k => /acc|account|desc|name/i.test(k)) ?? null
        if (!debitKey) debitKey = sampleKeys.find(k => /deb|dr|amount/i.test(k)) ?? null
        if (!creditKey) creditKey = sampleKeys.find(k => /cred|cr|amount/i.test(k)) ?? null

        // Now parse using the detected keys
        const parsed: PreviewRow[] = dataRows
          .map((r) => {
            const accountName = String((accountKey ? r[accountKey] : r["Account Name"] ?? r["Account"] ?? r["Description"]) ?? "").trim()
            const debit = Number(debitKey ? r[debitKey] : r["Debit"] ?? r["Dr"] ?? 0) || 0
            const credit = Number(creditKey ? r[creditKey] : r["Credit"] ?? r["Cr"] ?? 0) || 0
            return { accountName, debit, credit }
          })
          .filter((r) =>
            Boolean(r.accountName) &&
            !/total/i.test(r.accountName) &&
            r.accountName.toLowerCase() !== "difference" &&
            (r.debit !== 0 || r.credit !== 0)
          )

        // Save parsed preview and status
        setPreviewRows(parsed)
        setStatus(`Parsed ${parsed.length} rows from ${file.name}`)
      } catch (err: any) {
        console.error(err)
        setStatus("Failed to parse file: " + (err?.message ?? String(err)))
      }
    }

    reader.onerror = (err) => {
      console.error("File read error", err)
      setStatus("File read error")
    }

    reader.readAsArrayBuffer(file)
  }

  async function uploadToDatabase() {
    if (!period) return setStatus("Please enter a period (e.g., March 2026)")
    if (previewRows.length === 0) return setStatus("No rows to upload — please upload and preview a file first.")

    const supabase = getSupabaseClient()
    if (!supabase) return setStatus("Supabase client not available. Check env vars in Vercel / local .env.local")

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

      setStatus(`SUCCESS: P&L generated for ${period}`)
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
      return (
        mappings.find((m: any) => m.account_code && String(m.account_code) === String(accountName)) ||
        mappings.find((m: any) => {
          if (!m.account_name) return false
          return accountName.toLowerCase().includes(String(m.account_name).toLowerCase())
        }) ||
        null
      )
    }

    const agg = new Map<string, number>()
    for (const r of rows) {
      const mapping = findMapping(r.accountName)
      if (!mapping) continue
      const sign = mapping.sign_convention ?? 1
      const amt = (Number(r.debit) - Number(r.credit)) * Number(sign)
      const key = `${mapping.pl_category}||${mapping.pl_line_item}`
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
        <input
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="March 2026"
          className="w-full bg-black border border-gray-800 rounded-xl p-3 mb-4"
        />

        <label className="block mb-2 text-sm text-gray-400">Upload Trial Balance (.xlsx / .xls)</label>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="mb-4" />

        <div className="mb-4">
          <button
            onClick={uploadToDatabase}
            disabled={isUploading}
            className="px-6 py-3 bg-white text-black rounded-2xl font-bold"
          >
            {isUploading ? "Uploading..." : "Upload & Generate P&L"}
          </button>
        </div>

        {status && <div className="p-3 rounded-lg bg-gray-900/40 mb-4">{status}</div>}

        {previewRows.length > 0 && (
          <div className="bg-gray-900 rounded-xl p-4 mb-6">
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

        {/* DEBUG DUMP - TEMPORARY: shows raw sheet rows and parsed preview JSON */}
        <div className="bg-white text-black rounded-xl p-4">
          <div className="font-bold mb-2">Debug output (temporary)</div>

          <div className="mb-2">
            <div className="text-xs text-gray-600 mb-1">Raw sheet rows (first 30):</div>
            {rawRows.length === 0 ? (
              <div className="text-sm text-gray-500 italic">No raw rows captured yet (upload a file).</div>
            ) : (
              <pre className="text-xs max-h-40 overflow-auto p-2 bg-black text-white rounded">{JSON.stringify(rawRows, null, 2)}</pre>
            )}
          </div>

          <div>
            <div className="text-xs text-gray-600 mb-1">Detected sheet keys (first row):</div>
            {rawKeys.length === 0 ? (
              <div className="text-sm text-gray-500 italic">No keys yet</div>
            ) : (
              <div className="text-sm mb-2">{rawKeys.join(", ")}</div>
            )}
          </div>

          <div>
            <div className="text-xs text-gray-600 mb-1">Parsed preview rows (what will be uploaded):</div>
            <pre className="text-sm max-h-40 overflow-auto p-2 bg-black text-white rounded">{JSON.stringify(previewRows.slice(0, 50), null, 2)}</pre>
          </div>

          <div className="text-xs text-gray-500 mt-2">When done debugging, remove this debug block.</div>
        </div>
      </div>
    </div>
  )
}