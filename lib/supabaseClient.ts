import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env variables");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Named getter kept for any files that import { getSupabaseClient }
 * and for easier future testing.
 */
export function getSupabaseClient() {
  return supabase;
}

// Default export for files that import supabase as default
export default supabase;
