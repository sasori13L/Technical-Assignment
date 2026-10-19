import { formatDateTime } from '@/lib/format';
import type { WorkOrderEvent, WorkOrderEventType } from '@/lib/types';

const LABEL: Record<WorkOrderEventType, string> = {
  created: 'Created and assigned',
  started: 'Started work',
  solution_saved: 'Saved a solution draft',
  submitted: 'Marked Done and sent for review',
  attested: 'Attested and closed',
  rejected: 'Rejected and sent back',
  reassigned: 'Reassigned',
  edited: 'Edited title or issue',
};

const DOT: Partial<Record<WorkOrderEventType, string>> = {
  attested: 'bg-brand-600',
  rejected: 'bg-rose-500',
  submitted: 'bg-emerald-500',
  started: 'bg-amber-500',
};

export function WorkOrderTimeline({ events }: { events: WorkOrderEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-slate-500">No history yet.</p>;
  return (
    <ol className="space-y-4 border-l border-slate-200 pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className={`absolute -left-[26px] top-1.5 size-2.5 rounded-full ring-4 ring-white ${DOT[e.event_type] ?? 'bg-slate-400'}`} />
          <p className="text-sm font-medium text-slate-900">
            {LABEL[e.event_type]}
            {e.event_type === 'reassigned' && e.comment ? ` to ${e.comment}` : ''}
          </p>
          <p className="text-xs text-slate-500">{e.actor?.full_name ?? 'System'} · {formatDateTime(e.created_at)}</p>
          {e.event_type === 'rejected' && e.comment && (
            <p className="mt-1 whitespace-pre-wrap rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{e.comment}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
