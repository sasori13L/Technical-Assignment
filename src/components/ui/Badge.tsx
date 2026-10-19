import { CheckCheck } from 'lucide-react';
import type { UserRole, WorkOrderStatus } from '@/lib/types';

const base = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium';

const STATUS_STYLE: Record<WorkOrderStatus, string> = {
  Open: 'bg-sky-100 text-sky-800',
  'In Progress': 'bg-amber-100 text-amber-800',
  Done: 'bg-emerald-100 text-emerald-800',
};

export function StatusBadge({ status, attested }: { status: WorkOrderStatus; attested?: boolean }) {
  if (status === 'Done' && attested) {
    return (
      <span className={`${base} bg-brand-100 text-brand-700`}>
        <CheckCheck className="size-3.5" aria-hidden /> Done · Attested
      </span>
    );
  }
  return <span className={`${base} ${STATUS_STYLE[status]}`}>{status}</span>;
}

const ROLE_STYLE: Record<UserRole, string> = {
  Admin: 'bg-violet-100 text-violet-800',
  Captain: 'bg-navy-900 text-white',
  Crew: 'bg-slate-200 text-slate-800',
};

export const RoleBadge = ({ role }: { role: UserRole }) => (
  <span className={`${base} ${ROLE_STYLE[role]}`}>{role}</span>
);

export const ActiveBadge = ({ active }: { active: boolean }) => (
  <span className={`${base} ${active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
    {active ? 'Active' : 'Inactive'}
  </span>
);
