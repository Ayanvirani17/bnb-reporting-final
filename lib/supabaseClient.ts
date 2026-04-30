import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Return a Supabase client only when env vars exist.
 * This avoids creating the client during Next.js SSR/build.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
