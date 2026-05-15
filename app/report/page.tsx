'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function ReportPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchReport() {
      // Get the latest trial balance and its P&L results
      const { data: results, error } = await supabase
        .from('pl_results')
        .select('*')
        .order('amount', { ascending: false });

      if (error) console.error(error);
      else setData(results || []);
      setLoading(false);
    }
    fetchReport();
  }, []);

  const revenue = data.filter(item => item.pl_category.toLowerCase() === 'revenue');
  const expenses = data.filter(item => item.pl_category.toLowerCase().includes('expenses') || item.pl_category.toLowerCase() === 'opex');

  const totalRevenue = revenue.reduce((sum, item) => sum + item.amount, 0);
  const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);
  const netProfit = totalRevenue - totalExpenses;

  if (loading) return <div className="p-10 text-center">Loading Report...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-10 font-sans">
      <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-lg overflow-hidden border border-gray-200">
        
        {/* Header */}
        <div className="bg-slate-800 p-8 text-white text-center">
          <h1 className="text-3xl font-bold tracking-tight">BNB Reporting Portal</h1>
          <p className="text-slate-400 mt-2 italic">Profit & Loss Statement</p>
          <div className="mt-4 inline-block px-4 py-1 bg-slate-700 rounded-full text-sm">
            Period: {data[0]?.period || 'No Data Found'}
          </div>
        </div>

        <div className="p-8">
          {/* Revenue Section */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-slate-700 border-b-2 border-slate-100 pb-2 mb-4 uppercase tracking-wider">Revenue</h2>
            {revenue.map((item, i) => (
              <div key={i} className="flex justify-between py-2 border-b border-gray-50 hover:bg-gray-50 px-2 transition">
                <span className="text-gray-600">{item.pl_line_item}</span>
                <span className="font-semibold text-gray-900">{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
            <div className="flex justify-between mt-4 p-3 bg-emerald-50 text-emerald-800 font-bold rounded">
              <span>Total Revenue</span>
              <span>{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </section>

          {/* Expenses Section */}
          <section className="mb-10">
            <h2 className="text-xl font-bold text-slate-700 border-b-2 border-slate-100 pb-2 mb-4 uppercase tracking-wider">Expenses</h2>
            {expenses.map((item, i) => (
              <div key={i} className="flex justify-between py-2 border-b border-gray-50 hover:bg-gray-50 px-2 transition">
                <span className="text-gray-600">{item.pl_line_item}</span>
                <span className="font-medium text-gray-900">{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
            <div className="flex justify-between mt-4 p-3 bg-rose-50 text-rose-800 font-bold rounded">
              <span>Total Expenses</span>
              <span>{totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </section>

          {/* Net Profit Footer */}
          <div className="mt-12 border-t-4 border-slate-800 pt-6">
            <div className={`flex justify-between p-6 rounded-lg ${netProfit >= 0 ? 'bg-slate-800 text-white' : 'bg-rose-600 text-white'}`}>
              <span className="text-2xl font-bold uppercase tracking-widest">Net Profit</span>
              <span className="text-3xl font-black italic">
                {netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-gray-100 p-4 text-center text-gray-500 text-xs">
          Generated automatically by BNB-App Database Core • Confidential Financial Document
        </div>
      </div>
      
      {/* Print Button */}
      <div className="max-w-4xl mx-auto mt-6 text-right no-print">
        <button 
          onClick={() => window.print()}
          className="bg-white border border-gray-300 px-6 py-2 rounded shadow hover:bg-gray-50 transition font-medium text-gray-700"
        >
          Print / Save as PDF
        </button>
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none; }
          body { background: white; padding: 0; }
          .shadow-xl { shadow: none; border: none; }
        }
      `}</style>
    </div>
  );
}