import { getSupabase } from '@/lib/supabase/client';
import { unwrap, unwrapRow, toServiceError } from '@/lib/errors';
import type { Page, WorkOrderEvent, WorkOrderRow } from '@/lib/types';
import type { WorkOrderInput } from '@/lib/validation';
import { pageRange, runPage, sanitizeSearch } from './common';
import { workOrderCode } from '@/lib/format';

/** "Done" is split in two for review: waiting for the captain, or attested (closed). */
export type WorkOrderView = 'all' | 'Open' | 'In Progress' | 'review' | 'attested';

export interface WorkOrderFilters {
  vesselId: string | null; // null = every vessel the user can see (admin only in practice)
  view: WorkOrderView;
  assigneeId: string | 'all';
  search: string;
  page: number;
  pageSize: number;
}

const ROW_SELECT = `*,
  assignee:users!work_orders_assigned_to_fkey(full_name),
  creator:users!work_orders_created_by_fkey(full_name),
  attester:users!work_orders_attested_by_fkey(full_name),
  vessel:vessels(name)`;

/** One place that turns a UI view into filters, shared by the list and the stat tiles. */
interface Filterable<Q> {
  eq(column: string, value: string): Q;
  is(column: string, value: null): Q;
  not(column: string, operator: string, value: null): Q;
}

function applyView<Q extends Filterable<Q>>(query: Q, view: WorkOrderView): Q {
  switch (view) {
    case 'Open':
    case 'In Progress': return query.eq('status', view);
    case 'review':      return query.eq('status', 'Done').is('attested_at', null);
    case 'attested':    return query.not('attested_at', 'is', null);
    default:            return query;
  }
}

export async function listWorkOrders(f: WorkOrderFilters): Promise<Page<WorkOrderRow>> {
  let query = getSupabase().from('work_orders').select(ROW_SELECT, { count: 'exact' });
  if (f.vesselId) query = query.eq('vessel_id', f.vesselId);
  if (f.assigneeId !== 'all') query = query.eq('assigned_to', f.assigneeId);
  query = applyView(query, f.view);

  const search = sanitizeSearch(f.search);
  // A complete displayed code maps to the numeric PK, not the legacy stored code.
  const code = /^WO-(\d+)$/i.exec(search);
  if (code) query = query.eq('id', code[1]);
  else if (search) query = query.or(`title.ilike.*${search}*,code.ilike.*${search}*`);

  const [from, to] = pageRange(f.page, f.pageSize);
  const result = await runPage<WorkOrderRow>(
    query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to),
  );
  return { ...result, rows: result.rows.map((row) => ({ ...row, code: workOrderCode(row.id) })) };
}

export type WorkOrderStats = Record<'Open' | 'In Progress' | 'review' | 'attested', number>;

export async function fetchWorkOrderStats(vesselId: string | null): Promise<WorkOrderStats> {
  const views = ['Open', 'In Progress', 'review', 'attested'] as const;
  const counts = await Promise.all(
    views.map(async (view) => {
      let query = getSupabase().from('work_orders').select('id', { count: 'exact', head: true });
      if (vesselId) query = query.eq('vessel_id', vesselId);
      const { count, error } = await applyView(query, view);
      if (error) throw toServiceError(error);
      return count ?? 0;
    }),
  );
  return Object.fromEntries(views.map((v, i) => [v, counts[i]])) as WorkOrderStats;
}

export async function fetchWorkOrder(id: number): Promise<WorkOrderRow> {
  const res = await getSupabase().from('work_orders').select(ROW_SELECT).eq('id', id).maybeSingle();
  const row = unwrapRow(res, 'Work order not found, or you do not have access to it.') as WorkOrderRow;
  return { ...row, code: workOrderCode(row.id) };
}

export async function fetchWorkOrderEvents(id: number): Promise<WorkOrderEvent[]> {
  const res = await getSupabase()
    .from('work_order_events')
    .select('*, actor:users!work_order_events_actor_id_fkey(full_name)')
    .eq('work_order_id', id)
    .order('created_at')
    .order('id');
  return (unwrap(res) ?? []) as WorkOrderEvent[];
}

export async function createWorkOrder(vesselId: string, input: WorkOrderInput) {
  const res = await getSupabase()
    .from('work_orders')
    .insert({ vessel_id: vesselId, title: input.title, issue: input.issue, assigned_to: input.assigned_to })
    .select('id, code')
    .single();
  const row = unwrap(res) as { id: number; code: string };
  return { ...row, code: workOrderCode(row.id) };
}

const CHANGED =
  'This work order changed or is no longer available. Review the latest record before retrying. Your draft has been kept.';

export type WorkOrderSnapshot = Pick<WorkOrderRow, 'id' | 'status' | 'updated_at'>;

/**
 * Compare the database timestamp verbatim, including its sub-millisecond precision.
 * This guards same-status edits as well as transitions without a schema change.
 */
async function transition(
  expected: WorkOrderSnapshot,
  patch: Record<string, unknown>,
): Promise<WorkOrderSnapshot> {
  const query = getSupabase().from('work_orders').update(patch)
    .eq('id', expected.id).eq('status', expected.status)
    .eq('updated_at', expected.updated_at).is('attested_at', null);
  return unwrapRow(await query.select('id, status, updated_at').maybeSingle(), CHANGED) as WorkOrderSnapshot;
}

export const startWorkOrder = (expected: WorkOrderSnapshot) => transition(expected, { status: 'In Progress' });

export const saveSolution = (expected: WorkOrderSnapshot, solution: string) =>
  transition(expected, { solution });

export const completeWorkOrder = (expected: WorkOrderSnapshot, solution: string) =>
  transition(expected, { status: 'Done', solution });

export const attestWorkOrder = (expected: WorkOrderSnapshot) =>
  transition(expected, { attested_at: new Date().toISOString() });

export const rejectWorkOrder = (expected: WorkOrderSnapshot, reason: string) =>
  transition(expected, { status: 'In Progress', rejection_reason: reason });

export async function editWorkOrder(
  expected: WorkOrderSnapshot,
  patch: Partial<WorkOrderInput>,
) {
  return transition(expected, patch);
}
