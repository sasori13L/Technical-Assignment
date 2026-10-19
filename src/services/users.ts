import { getSupabase } from '@/lib/supabase/client';
import { unwrap, unwrapRow } from '@/lib/errors';
import type { AppUser, UserRole, UserWithVessels, Page } from '@/lib/types';
import type { UserInput } from '@/lib/validation';
import { pageRange, runPage, sanitizeSearch } from './common';

export interface UserFilters {
  search: string;
  role: UserRole | 'all';
  status: 'active' | 'inactive' | 'all';
  page: number;
  pageSize: number;
}

export async function listUsers(f: UserFilters): Promise<Page<UserWithVessels>> {
  let query = getSupabase()
    .from('users')
    .select('*, vessel_assignments(id, vessel_id, vessels(id, name))', { count: 'exact' });

  if (f.role !== 'all') query = query.eq('role', f.role);
  if (f.status !== 'all') query = query.eq('is_active', f.status === 'active');
  const search = sanitizeSearch(f.search);
  if (search) query = query.or(`full_name.ilike.*${search}*,email.ilike.*${search}*`);

  const [from, to] = pageRange(f.page, f.pageSize);
  return runPage<UserWithVessels>(query.order('full_name').order('id').range(from, to));
}

export async function createUser(input: UserInput): Promise<AppUser> {
  const res = await getSupabase().from('users').insert({ ...input, is_active: true }).select().single();
  return unwrap(res) as AppUser;
}

export async function updateUser(id: string, patch: Partial<UserInput> & { is_active?: boolean }): Promise<AppUser> {
  const res = await getSupabase().from('users').update(patch).eq('id', id).select().maybeSingle();
  return unwrapRow(res, 'User not found, or you do not have permission to change it.') as AppUser;
}

/** Active Captains and Crew, for the assignment picker. Admins need no assignment. */
export async function listAssignableUsers(search: string, page: number, signal?: AbortSignal): Promise<Page<Pick<AppUser, 'id' | 'full_name' | 'role'>>> {
  let query = getSupabase()
    .from('users')
    .select('id, full_name, role', { count: 'exact' })
    .eq('is_active', true)
    .in('role', ['Captain', 'Crew']);
  const term = sanitizeSearch(search);
  if (term) query = query.or(`full_name.ilike.*${term}*,email.ilike.*${term}*`);
  const [from, to] = pageRange(page, 25);
  query = query.order('full_name').order('id').range(from, to);
  return runPage(signal ? query.abortSignal(signal) : query);
}
