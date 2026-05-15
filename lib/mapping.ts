// server/mapping.ts (example)
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

// Normalizes strings for matching
function norm(s?: string) {
  return (s || "").toLowerCase().trim();
}

/**
 * Find or create mapping for an account.
 * Returns mapping row with id, statement_type, pl_category, mapping_confidence, etc.
 */
export async function findOrCreateMapping(account_code?: string | null, account_name?: string | null) {
  const code = norm(account_code ?? undefined);
  const name = norm(account_name ?? undefined);

  // 1) exact code match in account_mapping
  if (code) {
    const { data: byCode } = await supabase
      .from("account_mapping")
      .select("*")
      .eq("account_code", account_code)
      .limit(1)
      .maybeSingle();
    if (byCode) {
      return { ...byCode, mapping_confidence: byCode.mapping_confidence ?? 1, pattern_used: "exact_code" };
    }
  }

  // 2) exact name match in account_mapping
  if (name) {
    const { data: byName } = await supabase
      .from("account_mapping")
      .select("*")
      .ilike("account_name", account_name ?? "")
      .limit(1)
      .maybeSingle();
    if (byName) {
      return { ...byName, mapping_confidence: byName.mapping_confidence ?? 1, pattern_used: "exact_name" };
    }
  }

  // 3) pattern rules (ordered by priority)
  const { data: patterns } = await supabase
    .from("mapping_patterns")
    .select("*")
    .order("priority", { ascending: true });

  if (patterns && patterns.length) {
    for (const p of patterns) {
      try {
        if (p.is_regex) {
          const re = new RegExp(p.pattern, "i");
          if ((p.match_on === "name" || p.match_on === "both") && name && re.test(name)) {
            // found
            return await _insertAutoMapping(p, account_code, account_name, 0.95, "pattern");
          }
          if ((p.match_on === "code" || p.match_on === "both") && code && re.test(code)) {
            return await _insertAutoMapping(p, account_code, account_name, 0.95, "pattern");
          }
        } else {
          // substring ILIKE match
          const pat = p.pattern.toLowerCase();
          if ((p.match_on === "name" || p.match_on === "both") && name && name.includes(pat)) {
            return await _insertAutoMapping(p, account_code, account_name, 0.95, "pattern");
          }
          if ((p.match_on === "code" || p.match_on === "both") && code && code.includes(pat)) {
            return await _insertAutoMapping(p, account_code, account_name, 0.95, "pattern");
          }
        }
      } catch (err) {
        console.error("pattern test error", p, err);
      }
    }
  }

  // 4) lightweight heuristics (fallback)
  const bsKw = ["asset","cash","bank","receiv","payabl","loan","liabilit","creditor","debtor","deposit","prepay","gst","tax receiv","tax pay"];
  const plKw = ["sale","revenue","income","expense","cost","wage","salary","electric","rent","purchase","purchases","depreci","interest","tax"];

  const isBS = name ? bsKw.some(k => name.includes(k)) : false;
  const isPL = name ? plKw.some(k => name.includes(k)) : false;

  if (isBS) {
    return await _insertAutoMapping({ pattern: "heuristic", statement_type: "bs", pl_category: null }, account_code, account_name, 0.6, "heuristic");
  }
  if (isPL) {
    // attempt to choose a category from keywords (simple)
    let plcat = "other_income_or_expense";
    if (name.includes("electric")) plcat = "expenses_opex_electricity";
    else if (name.includes("wage") || name.includes("salary")) plcat = "expenses_opex_wages";
    else if (name.includes("rent")) plcat = "expenses_opex_rent";
    else if (name.includes("purchase")) plcat = "purchases";
    else if (name.includes("sale") || name.includes("revenue")) plcat = "revenue_sales";
    return await _insertAutoMapping({ pattern: "heuristic", statement_type: "pl", pl_category: plcat }, account_code, account_name, 0.6, "heuristic");
  }

  // 5) last resort: create an auto mapping as 'pl' with very low confidence and pl_category = 'uncategorized'
  return await _insertAutoMapping({ pattern: "fallback", statement_type: "pl", pl_category: "uncategorized" }, account_code, account_name, 0.2, "auto");
}

// helper: insert a mapping created by automation; returns the mapping row
async function _insertAutoMapping(patternRow: any, account_code?: string|null, account_name?: string|null, confidence = 0.5, source = "pattern") {
  // try to insert but avoid dupes (on account_code or exact name)
  try {
    if (account_code) {
      const { data: existing } = await supabase.from("account_mapping").select("*").eq("account_code", account_code).limit(1).maybeSingle();
      if (existing) return existing;
    }
    if (account_name) {
      const { data: existing2 } = await supabase.from("account_mapping").select("*").ilike("account_name", account_name ?? "").limit(1).maybeSingle();
      if (existing2) return existing2;
    }

    const insert = {
      account_code: account_code || null,
      account_name: account_name || null,
      pl_category: patternRow.pl_category || null,
      statement_type: patternRow.statement_type || 'pl',
      pattern_source: source,
      mapping_confidence: confidence,
      auto_created: true
    };

    const { data, error } = await supabase.from("account_mapping").insert(insert).select().maybeSingle();
    if (error) {
      console.error("insertAutoMapping error", error);
      // try to find again to avoid duplicates
      const { data: found } = await supabase.from("account_mapping").select("*").ilike("account_name", account_name || "").limit(1).maybeSingle();
      return found;
    }
    return data;
  } catch (err) {
    console.error("auto mapping insert failure", err);
    return null;
  }
}