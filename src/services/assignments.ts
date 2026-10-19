import { getSupabase } from '@/lib/supabase/client';
import { unwrap, unwrapRow } from '@/lib/errors';
import type { AppUser, AssignmentWithUser } from '@/lib/types';
import { readAllRows } from './common';

export async function listAssignments(vesselId: string, signal?: AbortSignal): Promise<AssignmentWithUser[]> {
  return readAllRows<AssignmentWithUser>((from, to) => {
    const query = getSupabase()
    .from('vessel_assignments')
    .select('id, vessel_id, user_id, users(id, full_name, email, role, is_active)')
    .eq('vessel_id', vesselId)
    .order('created_at').order('id').range(from, to);
    return signal ? query.abortSignal(signal) : query;
  });
}

export async function addAssignment(vesselId: string, userId: string) {
  const res = await getSupabase()
    .from('vessel_assignments')
    .insert({ vessel_id: vesselId, user_id: userId })
    .select('id')
    .single();
  return unwrap(res);
}

export async function moveAssignment(id: string, vesselId: string) {
  const res = await getSupabase()
    .from('vessel_assignments')
    .update({ vessel_id: vesselId })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  return unwrapRow(res, 'Assignment not found.');
}

export async function removeAssignment(id: string) {
  const res = await getSupabase().from('vessel_assignments').delete().eq('id', id).select('id').maybeSingle();
  return unwrapRow(res, 'Assignment not found.');
}

/** Active crew on a vessel: the pool a captain assigns work orders to. */
export async function listVesselCrew(vesselId: string): Promise<Pick<AppUser, 'id' | 'full_name'>[]> {
  const rows = await readAllRows<{ users: Pick<AppUser, 'id' | 'full_name'> }>((from, to) => getSupabase()
    .from('vessel_assignments')
    .select('users!inner(id, full_name, role, is_active)')
    .eq('vessel_id', vesselId)
    .eq('users.role', 'Crew')
    .eq('users.is_active', true).order('id').range(from, to));
  return rows.map((r) => r.users).sort((a, b) => a.full_name.localeCompare(b.full_name));
}
