import * as XLSX from 'xlsx';

function toNumberClean(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  const s = String(v).trim();
  const neg = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[\s,£$€₦()]/g, '');
  const num = Number(cleaned === '' ? 0 : cleaned);
  return neg ? -Math.abs(num) : (isNaN(num) ? 0 : num);
}

export function parseSheetAuto(sheet: XLSX.WorkSheet, maxHeaderScan = 10) {
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  let headerIndex = 0;
  const upTo = Math.min(maxHeaderScan, rows.length);
  for (let r = 0; r < upTo; r++) {
    const row = (rows[r] || []).map((c: any) => String(c || '').toLowerCase());
    const hasAccount = row.some((c: string) => c.includes('account'));
    const hasDebit = row.some((c: string) => c.includes('debit') || c === 'dr' || c.includes('dr '));
    const hasCredit = row.some((c: string) => c.includes('credit') || c === 'cr' || c.includes('cr '));
    if (hasAccount && (hasDebit || hasCredit)) {
      headerIndex = r;
      break;
    }
  }

  const raw: any[] = XLSX.utils.sheet_to_json(sheet, { range: headerIndex, defval: '' });

  const normalized = raw.map((row: any) => {
    const out: any = {};
    for (const k of Object.keys(row)) {
      const key = String(k).trim().toLowerCase();
      const val = row[k];

      if (key.includes('account code') || key === 'code' || key.includes('acct code')) {
        out.account_code = String(val || '').trim() || null;
      } else if (key.includes('account name') || key === 'account' || key.includes('acct name')) {
        out.account_name = String(val || '').trim();
      } else if (key.includes('debit') || key === 'dr' || key === 'debit amount') {
        out.debit = toNumberClean(val);
      } else if (key.includes('credit') || key === 'cr' || key === 'credit amount') {
        out.credit = toNumberClean(val);
      } else if (key.includes('amount') && (out.debit === undefined && out.credit === undefined)) {
        out.debit = toNumberClean(val);
      } else {
        out[key.replace(/\s+/g, '_')] = val;
      }
    }

    out.account_code = out.account_code ?? null;
    out.account_name = out.account_name ?? '';
    out.debit = typeof out.debit === 'number' ? out.debit : 0;
    out.credit = typeof out.credit === 'number' ? out.credit : 0;

    return out;
  });

  const filtered = normalized.filter((r: any) => {
    const name = String(r.account_name || '').toLowerCase();
    if (!name) return false;
    if (name.includes('total') || name.includes('subtotal') || name.includes('difference')) return false;
    if ((Number(r.debit) === 0) && (Number(r.credit) === 0)) return false;
    return true;
  });

  return { headerIndex, parsed: filtered };
}
