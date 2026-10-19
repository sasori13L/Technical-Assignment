'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertOctagon } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/Badge';
import { ErrorState, SkeletonRows } from '@/components/ui/States';
import { formatDateTime } from '@/lib/format';
import type { SwitcherMember } from '@/lib/types';
import { fetchWorkOrder, fetchWorkOrderEvents } from '@/services/workOrders';
import { WorkOrderActions } from './WorkOrderActions';
import { WorkOrderTimeline } from './WorkOrderTimeline';

const Meta = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
  </div>
);

export function WorkOrderDetailModal({ id, user, onClose }: { id: number; user: SwitcherMember; onClose: () => void }) {
  const order = useQuery({ queryKey: ['wo', user.id, id], queryFn: () => fetchWorkOrder(id), staleTime: 0 });
  const events = useQuery({ queryKey: ['wo-events', user.id, id], queryFn: () => fetchWorkOrderEvents(id), staleTime: 0 });
  const o = order.data;

  return (
    <Modal open onClose={onClose} size="lg"
      title={o ? o.title : 'Work order'}
      description={o ? `${o.code} · ${o.vessel?.name ?? ''}` : undefined}>
      {order.isPending && <SkeletonRows rows={4} />}
      {order.isError && <ErrorState message={order.error.message} onRetry={() => void order.refetch()} />}
      {o && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={o.status} attested={o.attested_at !== null} />
          </div>

          {o.status === 'In Progress' && o.rejection_reason && (
            <div role="note" className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <AlertOctagon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Sent back by the captain</p>
                <p className="mt-0.5 whitespace-pre-wrap">{o.rejection_reason}</p>
              </div>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Meta label="Assigned to">{o.assignee?.full_name ?? 'Unknown'}</Meta>
            <Meta label="Created by">{o.creator?.full_name ?? 'Unknown'}</Meta>
            <Meta label="Created">{formatDateTime(o.created_at)}</Meta>
            <Meta label="Last updated">{formatDateTime(o.updated_at)}</Meta>
            {o.attested_at && <Meta label="Attested">{o.attester?.full_name ?? 'Captain'} · {formatDateTime(o.attested_at)}</Meta>}
          </dl>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">Issue</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{o.issue}</p>
          </section>

          {!(user.role === 'Crew' && o.status === 'In Progress' && o.assigned_to === user.id) && (
            <section>
              <h3 className="text-sm font-semibold text-slate-900">Solution</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {o.solution ?? <span className="text-slate-400">Not documented yet.</span>}
              </p>
            </section>
          )}

          <WorkOrderActions key={`${user.id}-${o.id}`} order={o} user={user} />

          <section>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">History</h3>
            {events.isPending ? <SkeletonRows rows={2} />
              : events.isError ? <ErrorState message={`Could not load history: ${events.error.message}`} onRetry={() => void events.refetch()} />
              : <WorkOrderTimeline events={events.data ?? []} />}
          </section>
        </div>
      )}
    </Modal>
  );
}
