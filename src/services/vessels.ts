import { getSupabase } from '@/lib/supabase/client';
import { unwrap, unwrapRow } from '@/lib/errors';
import type { Page, Vessel, VesselWithCounts } from '@/lib/types';
import type { VesselInput } from '@/lib/validation';
import { pageRange, runPage, sanitizeSearch } from './common';

export interface VesselFilters {
  search: string;
  status: 'active' | 'inactive' | 'all';
  page: number;
  pageSize: number;
}

export async function listVessels(f: VesselFilters): Promise<Page<VesselWithCounts>> {
  let query = getSupabase().from('vessels').select('*, vessel_assignments(count)', { count: 'exact' });
  if (f.status !== 'all') query = query.eq('is_active', f.status === 'active');
  const search = sanitizeSearch(f.search);
  if (search) query = query.or(`name.ilike.*${search}*,imo_number.ilike.*${search}*`);

  const [from, to] = pageRange(f.page, f.pageSize);
  return runPage<VesselWithCounts>(query.order('name').order('id').range(from, to));
}

/** Searchable vessel pages for assignment pickers. */
export async function listVesselOptions(search: string, page: number, activeOnly = false, signal?: AbortSignal, excludeId?: string): Promise<Page<Vessel>> {
  let query = getSupabase().from('vessels').select('*', { count: 'exact' });
  if (activeOnly) query = query.eq('is_active', true);
  if (excludeId) query = query.neq('id', excludeId);
  const term = sanitizeSearch(search);
  if (term) query = query.or(`name.ilike.*${term}*,imo_number.ilike.*${term}*`);
  const [from, to] = pageRange(page, 25);
  query = query.order('is_active', { ascending: false }).order('name').order('id').range(from, to);
  return runPage<Vessel>(signal ? query.abortSignal(signal) : query);
}

export async function getVessel(id: string, signal?: AbortSignal): Promise<Vessel> {
  const query = getSupabase().from('vessels').select('*').eq('id', id);
  return unwrapRow(await (signal ? query.abortSignal(signal) : query).maybeSingle(), 'Vessel not found.') as Vessel;
}

export async function createVessel(input: VesselInput): Promise<Vessel> {
  const res = await getSupabase().from('vessels').insert({ ...input, is_active: true }).select().single();
  return unwrap(res) as Vessel;
}

export async function updateVessel(id: string, patch: Partial<VesselInput> & { is_active?: boolean }): Promise<Vessel> {
  const res = await getSupabase().from('vessels').update(patch).eq('id', id).select().maybeSingle();
  return unwrapRow(res, 'Vessel not found, or you do not have permission to change it.') as Vessel;
}
