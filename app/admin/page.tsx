"use client"

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabaseClient'

export default function AdminPage() {
  const [period, setPeriod] = useState('')
  const [data, setData] = useState<any[]>([])
  const [status, setStatus] = useState('')
  const [logs, setLogs] = useState<string[]>([])

  const log = (msg: string) => setLogs(prev => [...prev, msg])

  const handleFileUpload = (e: any) => {
    const file = e.target.files[0]
    const reader = new FileReader()
    reader.onload = (evt) => {
      const bstr = evt.target?.result
      const wb = XLSX.read(bstr, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      // Header is on row 6 (range: 5)
      const json = XLSX.utils.sheet_to_json(ws, { range: 5, defval: 0 })
      setData(json)
      log(`✅ File loaded. ${json.length} rows found`)
    }
    reader.readAsBinaryString(file)
  }

  const smartMap = (name: string) => {
    const n = name.toLowerCase()
    if (n.includes('sale') || n.includes('income') || n.includes('service charge')) 
      return { cat: 'Revenue', line: 'Sales Revenue', sign: 'credit' }
    if (n.includes('purchases') || n.includes('cost of') || n.includes('raw material') || n.includes('food') || n.includes('beverage'))
      return { cat: 'COGS', line: 'Direct Costs', sign: 'debit' }
    if (n.includes('wage') || n.includes('salary') || n.includes('staff'))
      return { cat: 'Opex', line: 'Staff Costs', sign: 'debit' }
    if (n.includes('rent') || n.includes('utility') || n.includes('electricity') || n.includes('water'))
      return { cat: 'Opex', line: 'Rent & Utilities', sign: 'debit' }
    return { cat: 'Opex', line: 'General Admin', sign: 'debit' }
  }

  const uploadToDatabase = async () => {
    if (!period || data.length === 0) { 
        setStatus('❌ Please enter a period and choose a file.')
        return 
    }
    setLogs([])
    setStatus('Processing trial balance...')

    try {
      // 1. Get Entity ID (Picking the latest one we created)
      const { data: ent } = await supabase.from('entities').select('id').order('created_at', {ascending: false}).limit(1)
      const entityId = ent?.[0]?.id
      if (!entityId) throw new Error("Entity not found")

      // 2. Create Trial Balance
      const { data: tb, error: tbErr } = await supabase
        .from('trial_balances')
        .insert([{ entity_id: entityId, period_name: period }])
        .select()
      
      const tbId = tb?.[0]?.id || (await supabase.from('trial_balances').select('id').order('id', {ascending:false}).limit(1)).data?.[0].id
      log('✅ Trial Balance record created')

      // 3. Load Mappings
      const { data: mapping } = await supabase.from('account_mapping').select('*')

      // 4. Build and Insert Lines
      const filtered = data.filter((row: any) => 
        row['Account Name'] && 
        row['Account Name'] !== 'Totals' && 
        row['Account Name'] !== 'Difference'
      )

      const lines = filtered.map((row: any) => {
        const name = row['Account Name']
        const debit = parseFloat(row['Debit']) || 0
        const credit = parseFloat(row['Credit']) || 0
        const map = mapping?.find(m => m.account_name === name) || smartMap(name)
        const sign = map.sign_convention || map.sign
        
        // Final Amount calculation based on P&L sign convention
        const amount = sign === 'credit' ? (credit - debit) : (debit - credit)
        
        return {
          trial_balance_id: tbId,
          account_name: name,
          debit,
          credit,
          amount,
          pl_category: map.pl_category || map.cat,
          pl_line_item: map.pl_line_item || map.line
        }
      })

      const { error: lineErr } = await supabase.from('trial_balance_lines').insert(lines)
      if (lineErr) throw lineErr
      log(`✅ ${lines.length} account lines saved`)

      // 5. Generate P&L results summary
      const summary: any = {}
      lines.forEach(l => {
        const key = `${l.pl_category}|${l.pl_line_item}`
        summary[key] = (summary[key] || 0) + l.amount
      })

      const plResults = Object.keys(summary).map(key => {
        const [cat, line] = key.split('|')
        return { period, pl_category: cat, pl_line_item: line, amount: summary[key] }
      })

      const { error: plErr } = await supabase.from('pl_results').insert(plResults)
      if (plErr) throw plErr

      log('✅ P&L summary generated')
      setStatus(`SUCCESS! ${period} reports are live.`)

    } catch (err: any) {
      console.error(err)
      log('❌ ERROR: ' + err.message)
      setStatus('Failed at: ' + err.message)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-10 font-mono flex items-center justify-center">
      <div className="max-w-xl w-full border border-gray-800 p-10 rounded-3xl bg-gray-900/50 shadow-2xl backdrop-blur-sm">
        <h1 className="text-3xl font-black mb-8 text-center bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">BNB ADMIN PORTAL</h1>

        <div className="space-y-6">
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 block font-bold">Month & Year</label>
            <input 
              type="text" 
              value={period} 
              onChange={e => setPeriod(e.target.value)} 
              placeholder="March 2026"
              className="w-full bg-black border border-gray-800 rounded-xl p-4 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-lg"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 block font-bold">Upload Trial Balance (.xlsx)</label>
            <div className="border-2 border-dashed border-gray-800 rounded-xl p-8 text-center hover:border-gray-700 transition-all group">
              <input type="file" onChange={handleFileUpload} className="cursor-pointer text-sm text-gray-500 w-full" />
            </div>
          </div>

          <button 
            onClick={uploadToDatabase}
            className="w-full bg-white text-black font-black py-5 rounded-2xl hover:bg-indigo-400 hover:text-white transition-all transform active:scale-[0.98] uppercase text-lg shadow-lg shadow-white/5"
          >
            Run Financial Generator
          </button>
        </div>

        {status && (
          <div className={`mt-8 p-5 rounded-2xl text-center font-bold text-sm border ${
            status.includes('SUCCESS') ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
          }`}>
            {status}
          </div>
        )}

        {logs.length > 0 && (
          <div className="mt-6 space-y-2 p-4 bg-black/50 rounded-xl max-h-40 overflow-y-auto">
            {logs.map((l, i) => (
              <div key={i} className={`text-[10px] uppercase tracking-tighter ${l.includes('❌') ? 'text-red-400 font-bold' : 'text-gray-500'}`}>
                {l}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}