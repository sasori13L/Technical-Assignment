import { getSupabase } from '@/lib/supabase/client';
import { unwrap } from '@/lib/errors';
import type { AppUser, SessionVessel } from '@/lib/types';

/** The signed-in application profile linked to auth.uid(). */
export async function fetchCurrentProfile(signal?: AbortSignal): Promise<AppUser | null> {
  let query = getSupabase().from('users').select('*').limit(1);
  if (signal) query = query.abortSignal(signal);
  return unwrap(await query.maybeSingle()) as AppUser | null;
}

/** RLS returns every active vessel an admin may see, or only assigned vessels. */
export async function fetchSessionVessels(signal?: AbortSignal): Promise<SessionVessel[]> {
  let query = getSupabase().from('vessels').select('id, name, vessel_type').eq('is_active', true).order('name').order('id');
  if (signal) query = query.abortSignal(signal);
  return (unwrap(await query) ?? []) as SessionVessel[];
}
