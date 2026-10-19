'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Power, Search, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ActiveBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { controlClass } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { errorMessage } from '@/lib/errors';
import type { VesselWithCounts } from '@/lib/types';
import { createVessel, listVessels, updateVessel, type VesselFilters } from '@/services/vessels';
import { VesselFormModal } from './VesselFormModal';
import { useAdminRefresh } from './useAdminRefresh';

const PAGE_SIZE = 10;
const members = (v: VesselWithCounts) => v.vessel_assignments[0]?.count ?? 0;

export function VesselsPanel() {
  const toast = useToast();
  const refresh = useAdminRefresh();
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState<VesselFilters['status']>('all');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<VesselWithCounts | null>(null);
  const [toggling, setToggling] = useState<VesselWithCounts | null>(null);
  const search = useDebounce(searchInput, 300);

  const filters: VesselFilters = { search, status, page, pageSize: PAGE_SIZE };
  const query = useQuery({ queryKey: ['admin', 'vessels', filters], queryFn: () => listVessels(filters), placeholderData: keepPreviousData });
  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  useEffect(() => {
    const last = Math.max(1, Math.ceil(total / PAGE_SIZE));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (query.data && page > last) setPage(last);
  }, [total, page, query.data]);

  const filtered = search !== '' || status !== 'all';
  const reset = () => { setSearchInput(''); setStatus('all'); setPage(1); };

  return (
    <>
      <PageHeader title="Vessels" description="Add vessels and retire them when they leave the fleet. Vessels are never deleted, so work order history stays intact."
        actions={<Button data-testid="new-vessel" onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden /> New vessel</Button>} />

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input aria-label="Search vessels" className={`${controlClass} pl-9`} placeholder="Search name or IMO number" value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setPage(1); }} />
          </div>
          <select aria-label="Filter by status" className={`${controlClass} sm:w-36`} value={status}
            onChange={(e) => { setStatus(e.target.value as VesselFilters['status']); setPage(1); }}>
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {filtered && <Button variant="ghost" onClick={reset}><X className="size-4" aria-hidden /> Clear</Button>}
        </div>

        {query.isPending ? <SkeletonRows rows={5} />
          : query.isError ? <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
          : rows.length === 0 ? (
            <EmptyState title={filtered ? 'No vessels match' : 'No vessels yet'}
              description={filtered ? 'Try a different search or clear the filters.' : 'Create the first vessel to get started.'}
              action={filtered ? <Button variant="secondary" onClick={reset}>Clear filters</Button> : undefined} />
          ) : (
            <>
              <table className="hidden w-full text-left text-sm md:table">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Vessel</th>
                    <th className="px-4 py-2.5 font-medium">IMO</th>
                    <th className="px-4 py-2.5 font-medium">Type</th>
                    <th className="px-4 py-2.5 font-medium">People</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((v) => (
                    <tr key={v.id} data-testid="vessel-row" className={v.is_active ? '' : 'bg-slate-50/60 text-slate-500'}>
                      <td className="px-4 py-3 font-medium text-slate-900">{v.name}</td>
                      <td className="px-4 py-3 tabular-nums">{v.imo_number}</td>
                      <td className="px-4 py-3">{v.vessel_type}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/assignments?vessel=${v.id}`} className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                          <Users className="size-3.5" aria-hidden /> {members(v)}
                        </Link>
                      </td>
                      <td className="px-4 py-3"><ActiveBadge active={v.is_active} /></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(v)} aria-label={`Edit ${v.name}`}><Pencil className="size-3.5" aria-hidden /> Edit</Button>
                          <Button variant="ghost" size="sm" onClick={() => setToggling(v)} aria-label={`${v.is_active ? 'Deactivate' : 'Reactivate'} ${v.name}`}>
                            <Power className="size-3.5" aria-hidden /> {v.is_active ? 'Deactivate' : 'Reactivate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <ul className="divide-y divide-slate-100 md:hidden">
                {rows.map((v) => (
                  <li key={v.id} data-testid="vessel-card" className="space-y-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-900">{v.name}</p>
                        <p className="text-xs text-slate-500">IMO {v.imo_number} · {v.vessel_type}</p>
                      </div>
                      <ActiveBadge active={v.is_active} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/assignments?vessel=${v.id}`} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-300 px-2.5 text-xs font-medium text-slate-800">
                        <Users className="size-3.5" aria-hidden /> {members(v)} people
                      </Link>
                      <Button variant="secondary" size="sm" onClick={() => setEditing(v)}><Pencil className="size-3.5" aria-hidden /> Edit</Button>
                      <Button variant="secondary" size="sm" onClick={() => setToggling(v)}><Power className="size-3.5" aria-hidden /> {v.is_active ? 'Deactivate' : 'Reactivate'}</Button>
                    </div>
                  </li>
                ))}
              </ul>
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
            </>
          )}
      </div>

      <VesselFormModal open={creating} onClose={() => setCreating(false)}
        onSubmit={async (v) => { await createVessel(v); toast.success(`${v.name} was created.`); refresh(); setCreating(false); }} />
      <VesselFormModal open={!!editing} vessel={editing} onClose={() => setEditing(null)}
        onSubmit={async (v) => { await updateVessel(editing!.id, v); toast.success('Vessel updated.'); refresh(); setEditing(null); }} />
      <ConfirmDialog open={!!toggling} danger={!!toggling?.is_active}
        title={toggling?.is_active ? `Deactivate ${toggling.name}?` : `Reactivate ${toggling?.name}?`}
        message={toggling?.is_active
          ? 'It will disappear from the vessel dropdown and no new work orders or assignments can be made. This is refused while it still has active work orders.'
          : 'It will appear in the vessel dropdown again.'}
        confirmLabel={toggling?.is_active ? 'Deactivate' : 'Reactivate'}
        onClose={() => setToggling(null)}
        onConfirm={async () => {
          const v = toggling!;
          await updateVessel(v.id, { is_active: !v.is_active });
          toast.success(`${v.name} was ${v.is_active ? 'deactivated' : 'reactivated'}.`);
          refresh();
        }} />
    </>
  );
}
