import { getSwitcherSupabase } from '@/lib/supabase/client';
import { readAllRows } from './common';
import type { SwitcherMember, SwitcherVessel, UserRole } from '@/lib/types';

// Anonymous, read-only RPCs. They return only ids, names and roles of active records.

export async function fetchSwitcherVessels(signal?: AbortSignal): Promise<SwitcherVessel[]> {
  return readAllRows<SwitcherVessel>((from, to) => {
    const query = getSwitcherSupabase().rpc('switcher_vessels').order('name').order('id').range(from, to);
    return signal ? query.abortSignal(signal) : query;
  });
}

export async function fetchSwitcherMembers(vesselId: string | null, role: UserRole, signal?: AbortSignal): Promise<SwitcherMember[]> {
  if (role !== 'Admin' && !vesselId) return [];
  return readAllRows<SwitcherMember>((from, to) => {
    const query = getSwitcherSupabase().rpc('switcher_members', { p_vessel_id: vesselId, p_role: role })
      .order('full_name').order('id').range(from, to);
    return signal ? query.abortSignal(signal) : query;
  });
}
