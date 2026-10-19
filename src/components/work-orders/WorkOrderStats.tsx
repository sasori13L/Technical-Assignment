'use client';

import type { UserRole } from '@/lib/types';
import type { WorkOrderStats as Stats, WorkOrderView } from '@/services/workOrders';

interface Props {
  stats: Stats | undefined;
  view: WorkOrderView;
  role: UserRole;
  onSelect: (view: WorkOrderView) => void;
}

const REVIEW_LABEL: Record<UserRole, string> = {
  Captain: 'Needs your review',
  Crew: 'Submitted',
  Admin: 'Awaiting review',
};

/** Summary tiles that double as the main filter. Clicking the active tile clears it. */
export function WorkOrderStatsTiles({ stats, view, role, onSelect }: Props) {
  const tiles: { key: WorkOrderView; label: string; value: number | undefined; tone: string }[] = [
    { key: 'all', label: 'All', value: stats && stats.Open + stats['In Progress'] + stats.review + stats.attested, tone: 'text-slate-900' },
    { key: 'Open', label: 'Open', value: stats?.Open, tone: 'text-sky-700' },
    { key: 'In Progress', label: 'In progress', value: stats?.['In Progress'], tone: 'text-amber-700' },
    { key: 'review', label: REVIEW_LABEL[role], value: stats?.review, tone: 'text-emerald-700' },
    { key: 'attested', label: 'Attested', value: stats?.attested, tone: 'text-brand-700' },
  ];

  return (
    <div role="group" aria-label="Filter by status" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t) => {
        const active = view === t.key;
        const attention = role === 'Captain' && t.key === 'review' && (t.value ?? 0) > 0;
        return (
          <button key={t.key} type="button" aria-pressed={active}
            onClick={() => onSelect(active && t.key !== 'all' ? 'all' : t.key)}
            data-testid={`tile-${t.key}`}
            className={`rounded-xl border p-3 text-left shadow-sm transition-colors ${
              active ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
                : attention ? 'border-amber-300 bg-amber-50 hover:bg-amber-100'
                : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
            <span className="block text-xs font-medium text-slate-600">{t.label}</span>
            <span className={`mt-1 block text-2xl font-semibold tabular-nums ${t.tone}`} data-testid={`tile-${t.key}-count`}>
              {t.value === undefined ? '…' : t.value.toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
