'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { useSession } from '@/components/session/SessionProvider';
import { Button } from '@/components/ui/Button';
import { controlClass } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { useDebounce } from '@/hooks/useDebounce';
import type { SwitcherMember } from '@/lib/types';
import { listVesselCrew } from '@/services/assignments';
import { fetchWorkOrderStats, listWorkOrders, type WorkOrderFilters, type WorkOrderView } from '@/services/workOrders';
import { NewWorkOrderModal } from './NewWorkOrderModal';
import { WorkOrderDetailModal } from './WorkOrderDetailModal';
import { WorkOrderStatsTiles } from './WorkOrderStats';
import { WorkOrderTable } from './WorkOrderTable';

const PAGE_SIZE = 10;

/** Role-aware entry point. Everything below it is keyed to the active user and vessel, so switching resets all local state. */
export function WorkOrdersPage() {
  const { activeUser, loading, vesselId, vessels, role } = useSession();
  const vesselName = vessels.find((v) => v.id === vesselId)?.name ?? '';

  if (loading) {
    return <div className="overflow-hidden rounded-xl bg-white shadow-sm"><SkeletonRows rows={6} /></div>;
  }
  if (!activeUser || !vesselId) {
    return (
      <div className="rounded-xl bg-white shadow-sm">
        <EmptyState
          title={vesselId ? `No active ${role} on this vessel` : 'No vessels available'}
          description={activeUser?.role === 'Admin' && !vesselId
            ? 'Create a vessel or reactivate one to get started.' : 'Pick another role or vessel in the bar at the top.'}
          action={activeUser?.role === 'Admin' && !vesselId
            ? <Link href="/admin/vessels" className="inline-flex min-h-10 items-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Manage vessels</Link>
            : undefined} />
      </div>
    );
  }
  return <WorkOrdersBoard key={`${activeUser.id}:${activeUser.role}:${vesselId}`} user={activeUser} vesselId={vesselId} vesselName={vesselName} />;
}

interface BoardProps {
  user: SwitcherMember;
  vesselId: string;
  vesselName: string;
}

function WorkOrdersBoard({ user, vesselId, vesselName }: BoardProps) {
  const queryClient = useQueryClient();
  const isAdmin = user.role === 'Admin';
  const isCaptain = user.role === 'Captain';

  const [view, setView] = useState<WorkOrderView>('all');
  const [searchInput, setSearchInput] = useState('');
  const [assigneeId, setAssigneeId] = useState<string>('all');
  const [scope, setScope] = useState<'vessel' | 'all'>('vessel');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const search = useDebounce(searchInput, 300);
  const vesselFilter = isAdmin && scope === 'all' ? null : vesselId;

  const filters = useMemo<WorkOrderFilters>(
    () => ({ vesselId: vesselFilter, view, assigneeId, search, page, pageSize: PAGE_SIZE }),
    [vesselFilter, view, assigneeId, search, page],
  );

  const list = useQuery({
    queryKey: ['work-orders', user.id, filters],
    queryFn: () => listWorkOrders(filters),
    placeholderData: keepPreviousData,
  });
  const stats = useQuery({
    queryKey: ['wo-stats', user.id, vesselFilter],
    queryFn: () => fetchWorkOrderStats(vesselFilter),
  });
  const crew = useQuery({
    queryKey: ['vessel-crew', user.id, vesselId],
    queryFn: () => listVesselCrew(vesselId),
    enabled: isCaptain,
  });

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // If the list shrank under us (another user's change, a new filter), step back to the last real page.
  useEffect(() => {
    if (list.data && list.data.rows.length === 0 && total > 0 && page > pages) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPage(pages);
    }
  }, [list.data, total, page, pages]);

  const filtered = view !== 'all' || search.trim() !== '' || assigneeId !== 'all';
  const selectView = (v: WorkOrderView) => { setView(v); setPage(1); };
  const clearFilters = () => { setView('all'); setSearchInput(''); setAssigneeId('all'); setPage(1); };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    void queryClient.invalidateQueries({ queryKey: ['wo-stats'] });
  };

  const title = user.role === 'Crew' ? 'My work orders' : 'Work orders';
  const description = isAdmin
    ? 'Read-only overview. Captains create and review work orders; crew carry them out.'
    : isCaptain
      ? `Create, assign and review work on ${vesselName}.`
      : `Work assigned to you on ${vesselName}.`;

  return (
    <div>
      <PageHeader title={title} description={description}
        actions={<>
          <Button variant="secondary" onClick={refresh} aria-label="Refresh">
            <RefreshCw className={`size-4 ${list.isFetching ? 'animate-spin' : ''}`} aria-hidden />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {isCaptain && (
            <Button onClick={() => setCreating(true)} data-testid="new-work-order">
              <Plus className="size-4" aria-hidden /> New work order
            </Button>
          )}
        </>} />

      <WorkOrderStatsTiles stats={stats.data} view={view} role={user.role} onSelect={selectView} />

      <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input type="search" value={searchInput} aria-label="Search work orders"
              placeholder="Search by title or ID (e.g. WO-00012)"
              onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
              className={`${controlClass} pl-9`} />
          </div>

          {isCaptain && (
            <select aria-label="Filter by crew member" value={assigneeId} className={`${controlClass} w-auto min-w-[11rem]`}
              onChange={(e) => { setAssigneeId(e.target.value); setPage(1); }}>
              <option value="all">All crew</option>
              {(crew.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          )}

          {isAdmin && (
            <div role="group" aria-label="Vessel scope" className="flex rounded-md border border-slate-300 bg-white p-0.5 text-sm">
              {([['vessel', vesselName || 'This vessel'], ['all', 'All vessels']] as const).map(([key, label]) => (
                <button key={key} type="button" aria-pressed={scope === key}
                  onClick={() => { setScope(key); setPage(1); }}
                  className={`max-w-[10rem] truncate rounded px-3 py-1.5 font-medium ${scope === key ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {filtered && (
            <Button variant="ghost" onClick={clearFilters}><X className="size-4" aria-hidden /> Clear</Button>
          )}
        </div>

        {list.isPending ? <SkeletonRows rows={PAGE_SIZE / 2} />
          : list.isError ? <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
          : list.data.rows.length === 0 ? (
            filtered
              ? <EmptyState title="No work orders match" description="Try a different search or clear the filters."
                  action={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>} />
              : <EmptyState
                  title={isCaptain ? 'No work orders yet' : 'Nothing here yet'}
                  description={isCaptain ? 'Create the first work order for this vessel.'
                    : user.role === 'Crew' ? 'Work a captain assigns to you will show up here.' : 'No work orders exist yet.'}
                  action={isCaptain ? <Button onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden /> New work order</Button> : undefined} />
          ) : (
            <div aria-busy={list.isFetching && list.isPlaceholderData} className={list.isPlaceholderData ? 'opacity-60 transition-opacity' : ''}>
              <WorkOrderTable rows={list.data.rows} showVessel={isAdmin && scope === 'all'} onOpen={setOpenId} />
            </div>
          )}

        <div className="border-t border-slate-100 px-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
        </div>
      </div>

      {openId !== null && <WorkOrderDetailModal id={openId} user={user} onClose={() => setOpenId(null)} />}
      {isCaptain && (
        <NewWorkOrderModal open={creating} onClose={() => setCreating(false)}
          userId={user.id} vesselId={vesselId} vesselName={vesselName} />
      )}
    </div>
  );
}
