"use client"

import React, { useEffect, useState } from "react"
import { getSupabaseClient } from "@/lib/supabaseClient"

type PLRow = {
  id?: string
  period: string
  pl_category: string
  pl_line_item: string
  amount: number
}

export default function DashboardPage() {
  const [periods, setPeriods] = useState<string[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<string>("")
  const [rows, setRows] = useState<PLRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchPeriods = async () => {
      const supabase = getSupabaseClient()
      if (!supabase) {
        console.warn("Supabase not available")
        return
      }
      const { data } = await supabase.from("pl_results").select("period")
      const unique = Array.from(new Set((data ?? []).map((d: any) => d.period))).sort().reverse()
      setPeriods(unique)
      if (unique.length > 0 && !selectedPeriod) setSelectedPeriod(unique[0])
    }
    fetchPeriods()
  }, [])

  useEffect(() => {
    if (!selectedPeriod) return
    const fetchData = async () => {
      setLoading(true)
      const supabase = getSupabaseClient()
      if (!supabase) {
        setRows([])
        setLoading(false)
        return
      }
      const { data, error } = await supabase.from("pl_results").select("*").eq("period", selectedPeriod).order("pl_category", { ascending: true })
      if (error) {
        console.error(error)
        setRows([])
      } else {
        setRows((data ?? []) as PLRow[])
      }
      setLoading(false)
    }
    fetchData()
  }, [selectedPeriod])

  return (
    <div className="min-h-screen p-10 bg-black text-white">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-black">BNB FINANCIALS</h1>
          <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} className="bg-gray-900 border border-gray-800 p-2 rounded-lg">
            {periods.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-gray-900 rounded-2xl p-4">
          {loading ? (
            <div className="text-gray-400">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="text-gray-500 italic">No data found for this period.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="p-4">Category</th>
                  <th className="p-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.pl_category}-${r.pl_line_item}`} className="border-t border-gray-800">
                    <td className="p-4">
                      <div className="text-xs text-indigo-400 uppercase font-bold">{r.pl_category}</div>
                      <div className="text-lg">{r.pl_line_item}</div>
                    </td>
                    <td className="p-4 text-right font-mono text-xl">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(r.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}