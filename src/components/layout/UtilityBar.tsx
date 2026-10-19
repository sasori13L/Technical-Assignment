'use client';

import { Anchor, ChevronDown, UserRound } from 'lucide-react';
import { useId, useState } from 'react';
import { useSession } from '@/components/session/SessionProvider';
import { ROLES, type UserRole } from '@/lib/types';
import { initials } from '@/lib/format';

const selectClass =
  'select-on-dark w-full min-h-10 rounded-md border border-navy-700 bg-navy-800 px-2.5 py-2 text-sm text-white focus:border-brand-500 disabled:opacity-50';

/**
 * The sticky mock-authentication bar: Vessel -> Role -> Member. Each dropdown
 * depends on the one before it, and choosing a member switches the whole app to
 * that user (see SessionProvider).
 */
export function UtilityBar() {
  const s = useSession();
  const [open, setOpen] = useState(false);
  const id = useId();
  const vesselName = s.vessels.find((v) => v.id === s.vesselId)?.name;

  return (
    <header className="sticky top-0 z-40 bg-navy-950 text-white shadow-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <Anchor className="size-5 text-brand-500" aria-hidden />
          <span>FleetOps</span>
          <span className="hidden rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/70 sm:inline">
            Mock session
          </span>
        </div>

        {/* Phone: a one-line summary that expands the dropdowns. */}
        <button type="button" aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen((o) => !o)}
          className="ml-auto flex min-h-10 items-center gap-2 rounded-md bg-white/10 px-3 text-sm md:hidden">
          <UserRound className="size-4" aria-hidden />
          <span className="max-w-[10rem] truncate">{s.activeUser ? `${s.activeUser.full_name} · ${s.activeUser.role}` : 'Select user'}</span>
          <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>

        <div id={`${id}-panel`}
          className={`${open ? 'grid' : 'hidden'} w-full grid-cols-1 gap-2 pb-1 sm:grid-cols-3 md:order-last md:grid md:pb-1 lg:order-none lg:ml-auto lg:w-auto lg:grid-cols-[13rem_9rem_15rem] lg:pb-0`}>
          <div>
            <label htmlFor={`${id}-vessel`} className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-white/60">1 · Vessel</label>
            <select id={`${id}-vessel`} className={selectClass} value={s.vesselId ?? ''} disabled={s.vessels.length === 0}
              onChange={(e) => s.selectVessel(e.target.value)}>
              {s.vessels.length === 0 && <option value="">{s.loading ? 'Loading…' : 'No vessels'}</option>}
              {s.vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-role`} className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-white/60">2 · Role</label>
            <select id={`${id}-role`} className={selectClass} value={s.role} onChange={(e) => s.selectRole(e.target.value as UserRole)}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-member`} className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-white/60">3 · Member</label>
            <select id={`${id}-member`} className={selectClass} value={s.activeUser?.id ?? ''}
              disabled={s.members.length === 0} onChange={(e) => s.selectMember(e.target.value)}>
              {s.members.length === 0 && <option value="">{s.loading ? 'Loading…' : `No active ${s.role}`}</option>}
              {s.members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
        </div>

        {/* Desktop: who the whole app is acting as right now. */}
        <div data-testid="active-user" className="hidden items-center gap-2 border-l border-white/15 pl-4 lg:flex" aria-live="polite">
          <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-xs font-semibold">
            {s.activeUser ? initials(s.activeUser.full_name) : '?'}
          </span>
          <div className="text-xs leading-tight">
            <div className="font-medium">{s.activeUser?.full_name ?? 'No user selected'}</div>
            <div className="text-white/60">{s.activeUser ? `${s.activeUser.role}${s.activeUser.role === 'Admin' ? ' · all vessels' : vesselName ? ` · ${vesselName}` : ''}` : '—'}</div>
          </div>
        </div>
      </div>
      {s.error && <div role="alert" className="bg-rose-700 px-4 py-1.5 text-center text-xs">
        Could not load the session options: {s.error}{' '}
        <button type="button" onClick={s.retry} className="min-h-8 px-2 font-semibold underline">Retry</button>
      </div>}
    </header>
  );
}
