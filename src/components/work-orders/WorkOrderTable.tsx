import { RotateCcw } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { timeAgo } from '@/lib/format';
import type { WorkOrderRow } from '@/lib/types';

interface Props {
  rows: WorkOrderRow[];
  showVessel: boolean;
  onOpen: (id: number) => void;
}

/** Crew spot work a captain sent back: it is In Progress again with a reason attached. */
const SentBack = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">
    <RotateCcw className="size-3" aria-hidden /> Sent back
  </span>
);

const sentBack = (r: WorkOrderRow) => r.status === 'In Progress' && !!r.rejection_reason;

export function WorkOrderTable({ rows, showVessel, onOpen }: Props) {
  return (
    <>
      {/* Tablet and desktop */}
      <table className="hidden w-full text-left text-sm md:table">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">ID</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Title</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Assigned to</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} onClick={() => onOpen(r.id)} data-testid="wo-row"
              className="cursor-pointer hover:bg-slate-50 focus-within:bg-slate-50">
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">{r.code}</td>
              <td className="max-w-md px-4 py-3">
                <button type="button" className="block max-w-full truncate text-left font-medium text-slate-900 hover:text-brand-700">
                  {r.title}
                </button>
                {showVessel && <span className="text-xs text-slate-500">{r.vessel?.name}</span>}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-700">{r.assignee?.full_name ?? 'Unknown'}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={r.status} attested={r.attested_at !== null} />
                  {sentBack(r) && <SentBack />}
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{timeAgo(r.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Phone */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onOpen(r.id)} data-testid="wo-row"
              className="flex w-full flex-col gap-1.5 px-4 py-3 text-left active:bg-slate-50">
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-slate-500">{r.code}</span>
                <span className="flex items-center gap-1.5">
                  {sentBack(r) && <SentBack />}
                  <StatusBadge status={r.status} attested={r.attested_at !== null} />
                </span>
              </span>
              <span className="font-medium text-slate-900">{r.title}</span>
              <span className="text-xs text-slate-500">
                {r.assignee?.full_name ?? 'Unknown'}{showVessel && r.vessel ? ` · ${r.vessel.name}` : ''} · {timeAgo(r.updated_at)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
