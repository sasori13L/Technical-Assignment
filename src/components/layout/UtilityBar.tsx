'use client';

import { Anchor, ChevronDown, LogOut, UserRound } from 'lucide-react';
import { useId, useState } from 'react';
import { useSession } from '@/components/session/SessionProvider';
import { initials } from '@/lib/format';

const selectClass =
  'select-on-dark w-full min-h-10 rounded-md border border-navy-700 bg-navy-800 px-2.5 py-2 text-sm text-white focus:border-brand-500 disabled:opacity-50';

export function UtilityBar() {
  const s = useSession();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const id = useId();
  const vesselName = s.vessels.find((v) => v.id === s.vesselId)?.name;

  async function signOut() {
    setSigningOut(true);
    try { await s.signOut(); } finally { setSigningOut(false); }
  }

  return (
    <header className="sticky top-0 z-40 bg-navy-950 text-white shadow-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <Anchor className="size-5 text-brand-500" aria-hidden />
          <span>FleetOps</span>
        </div>

        <button type="button" aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen((o) => !o)}
          className="ml-auto flex min-h-10 items-center gap-2 rounded-md bg-white/10 px-3 text-sm md:hidden">
          <UserRound className="size-4" aria-hidden />
          <span className="max-w-[10rem] truncate">{s.activeUser?.full_name ?? 'Loading account…'}</span>
          <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>

        <div id={`${id}-panel`} className={`${open ? 'flex' : 'hidden'} w-full flex-col gap-2 pb-1 md:ml-auto md:flex md:w-auto md:flex-row md:items-end md:pb-0`}>
          <div className="min-w-56">
            <label htmlFor={`${id}-vessel`} className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-white/60">Active vessel</label>
            <select id={`${id}-vessel`} className={selectClass} value={s.vesselId ?? ''} disabled={s.vessels.length === 0}
              onChange={(e) => s.selectVessel(e.target.value)}>
              {s.vessels.length === 0 && <option value="">{s.loading ? 'Loading…' : 'No assigned vessels'}</option>}
              {s.vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <button type="button" onClick={() => void signOut()} disabled={signingOut}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-white/20 px-3 text-sm font-medium hover:bg-white/10 disabled:opacity-50">
            <LogOut className="size-4" aria-hidden /> {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>

        <div data-testid="active-user" className="hidden items-center gap-2 border-l border-white/15 pl-4 lg:flex" aria-live="polite">
          <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-xs font-semibold">
            {s.activeUser ? initials(s.activeUser.full_name) : '?'}
          </span>
          <div className="text-xs leading-tight">
            <div className="font-medium">{s.activeUser?.full_name ?? 'Loading account…'}</div>
            <div className="text-white/60">{s.activeUser ? `${s.activeUser.role}${vesselName ? ` · ${vesselName}` : ''}` : '—'}</div>
          </div>
        </div>
      </div>
      {s.error && <div role="alert" className="bg-rose-700 px-4 py-1.5 text-center text-xs">
        {s.error}{' '}<button type="button" onClick={s.retry} className="min-h-8 px-2 font-semibold underline">Retry</button>
      </div>}
    </header>
  );
}
