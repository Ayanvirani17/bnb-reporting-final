"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"

export default function Dashboard() {
  const [data, setData] = useState<any[]>([])
  const [periods, setPeriods] = useState<string[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState("")

  // 1. Fetch the list of available months/periods
  useEffect(() => {
    const fetchPeriods = async () => {
      const { data } = await supabase
        .from("pl_results")
        .select("period")
      
      if (data) {
        const uniquePeriods = Array.from(new Set(data.map(p => p.period)))
        setPeriods(uniquePeriods)
        if (uniquePeriods.length > 0) setSelectedPeriod(uniquePeriods[0])
      }
    }
    fetchPeriods()
  }, [])

  // 2. Fetch the actual P&L for the selected month
  useEffect(() => {
    if (!selectedPeriod) return

    const fetchData = async () => {
      const { data, error } = await supabase
        .from("pl_results")
        .select("*")
        .eq("period", selectedPeriod)

      if (error) console.error("Error fetching P&L:", error)
      setData(data || [])
    }

    fetchData()
  }, [selectedPeriod])

  return (
    <div className="min-h-screen bg-black text-white p-10 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-4xl font-black tracking-tighter">BNB FINANCIALS</h1>
          
          {/* Period Selector */}
          <select 
            value={selectedPeriod} 
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="bg-gray-900 border border-gray-800 p-2 rounded-lg text-sm outline-none"
          >
            {periods.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {data.length === 0 ? (
          <div className="text-gray-500 italic">No data found for this period.</div>
        ) : (
          <div className="grid gap-6">
            {/* Simple P&L Table */}
            <div className="border border-gray-800 rounded-2xl overflow-hidden bg-gray-900/30">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-900 text-[10px] uppercase tracking-widest text-gray-500">
                    <th className="p-4">Category</th>
                    <th className="p-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.map((row, i) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="p-4">
                        <div className="text-xs text-indigo-400 font-bold uppercase">{row.pl_category}</div>
                        <div className="text-lg font-medium">{row.pl_line_item}</div>
                      </td>
                      <td className="p-4 text-right text-xl font-mono">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 