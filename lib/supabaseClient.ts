import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// default client (can be used in client components)
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// helper to create a fresh client (for server/client usages that expect a factory)
export function getSupabaseClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey);
}
