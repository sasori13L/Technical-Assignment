import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAccessToken } from '@/lib/auth/token';

let client: SupabaseClient | null = null;
let publicClient: SupabaseClient | null = null;

/** Dropdown reads must remain available even if the previous user's token fails. */
export function getSwitcherSupabase(): SupabaseClient {
  if (publicClient) return publicClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Missing public Supabase configuration.');
  publicClient = createClient(url, anonKey, {
    accessToken: async () => anonKey,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return publicClient;
}

/**
 * The single browser Supabase client. There is no Supabase Auth: instead the
 * accessToken callback supplies the mock user's signed JWT (see lib/auth/token).
 * With nobody selected it falls back to the anon key, which can only call the
 * three read-only "switcher" RPCs.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  client = createClient(url, anonKey, {
    accessToken: async () => (await getAccessToken()) ?? anonKey,
  });
  return client;
}
