'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { MailPlus, Pencil, Plus, Power, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useSession } from '@/components/session/SessionProvider';
import { ActiveBadge, RoleBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { controlClass } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { errorMessage } from '@/lib/errors';
import { ROLES, type UserRole, type UserWithVessels } from '@/lib/types';
import { createUser, listUsers, updateUser, type UserFilters } from '@/services/users';
import { UserFormModal } from './UserFormModal';
import { useAdminRefresh } from './useAdminRefresh';

const PAGE_SIZE = 10;

function VesselChips({ user }: { user: UserWithVessels }) {
  if (user.role === 'Admin') return <span className="text-xs text-slate-500">All vessels</span>;
  const names = user.vessel_assignments.map((a) => a.vessels?.name).filter(Boolean) as string[];
  if (names.length === 0) return <span className="text-xs text-amber-700">Not assigned</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {names.map((n) => <span key={n} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{n}</span>)}
    </span>
  );
}

export function UsersPanel() {
  const { activeUser } = useSession();
  const toast = useToast();
  const refresh = useAdminRefresh();

  const [searchInput, setSearchInput] = useState('');
  const [role, setRole] = useState<UserRole | 'all'>('all');
  const [status, setStatus] = useState<UserFilters['status']>('all');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<UserWithVessels | null>(null);
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<UserWithVessels | null>(null);
  const search = useDebounce(searchInput, 300);

  const filters: UserFilters = { search, role, status, page, pageSize: PAGE_SIZE };
  const query = useQuery({ queryKey: ['admin', 'users', filters], queryFn: () => listUsers(filters), placeholderData: keepPreviousData });
  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  useEffect(() => {
    const last = Math.max(1, Math.ceil(total / PAGE_SIZE));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (query.data && page > last) setPage(last);
  }, [total, page, query.data]);

  const filtered = search !== '' || role !== 'all' || status !== 'all';
  const reset = () => { setSearchInput(''); setRole('all'); setStatus('all'); setPage(1); };

  async function changeRole(u: UserWithVessels, next: UserRole) {
    if (next === u.role) return;
    try {
      await updateUser(u.id, { role: next });
      toast.success(`${u.full_name} is now ${next}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      refresh();
    }
  }

  async function invite(u: UserWithVessels) {
    try {
      await createUser({ full_name: u.full_name, email: u.email, role: u.role });
      toast.success(`Invitation sent to ${u.email}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      refresh();
    }
  }

  return (
    <>
      <PageHeader title="Users" description="Invite people, set their role and deactivate them when they leave. Users are never deleted, so history stays intact."
        actions={<Button data-testid="new-user" onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden /> New user</Button>} />

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input aria-label="Search users" className={`${controlClass} pl-9`} placeholder="Search name or email" value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setPage(1); }} />
          </div>
          <select aria-label="Filter by role" className={`${controlClass} sm:w-36`} value={role}
            onChange={(e) => { setRole(e.target.value as UserRole | 'all'); setPage(1); }}>
            <option value="all">All roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select aria-label="Filter by status" className={`${controlClass} sm:w-36`} value={status}
            onChange={(e) => { setStatus(e.target.value as UserFilters['status']); setPage(1); }}>
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {filtered && <Button variant="ghost" onClick={reset}><X className="size-4" aria-hidden /> Clear</Button>}
        </div>

        {query.isPending ? <SkeletonRows rows={6} />
          : query.isError ? <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
          : rows.length === 0 ? (
            <EmptyState title={filtered ? 'No users match' : 'No users yet'}
              description={filtered ? 'Try a different search or clear the filters.' : 'Create the first user to get started.'}
              action={filtered ? <Button variant="secondary" onClick={reset}>Clear filters</Button> : undefined} />
          ) : (
            <>
              <table className="hidden w-full text-left text-sm md:table">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">User</th>
                    <th className="px-4 py-2.5 font-medium">Role</th>
                    <th className="px-4 py-2.5 font-medium">Vessels</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((u) => (
                    <tr key={u.id} data-testid="user-row" className={u.is_active ? '' : 'bg-slate-50/60 text-slate-500'}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{u.full_name}{u.id === activeUser?.id && <span className="ml-2 text-xs font-normal text-brand-700">(you)</span>}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <select aria-label={`Role for ${u.full_name}`} className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                          value={u.role} disabled={u.id === activeUser?.id}
                          title={u.id === activeUser?.id ? 'You cannot change your own role.' : undefined}
                          onChange={(e) => void changeRole(u, e.target.value as UserRole)}>
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td className="max-w-64 px-4 py-3"><VesselChips user={u} /></td>
                      <td className="px-4 py-3"><ActiveBadge active={u.is_active} /></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {!u.auth_user_id && <Button variant="ghost" size="sm" onClick={() => void invite(u)} aria-label={`Invite ${u.full_name}`}><MailPlus className="size-3.5" aria-hidden /> Invite</Button>}
                          <Button variant="ghost" size="sm" onClick={() => setEditing(u)} aria-label={`Edit ${u.full_name}`}><Pencil className="size-3.5" aria-hidden /> Edit</Button>
                          <Button variant="ghost" size="sm" onClick={() => setToggling(u)}
                            aria-label={`${u.is_active ? 'Deactivate' : 'Reactivate'} ${u.full_name}`}>
                            <Power className="size-3.5" aria-hidden /> {u.is_active ? 'Deactivate' : 'Reactivate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <ul className="divide-y divide-slate-100 md:hidden">
                {rows.map((u) => (
                  <li key={u.id} data-testid="user-card" className="space-y-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{u.full_name}{u.id === activeUser?.id && <span className="ml-2 text-xs font-normal text-brand-700">(you)</span>}</p>
                        <p className="truncate text-xs text-slate-500">{u.email}</p>
                      </div>
                      <ActiveBadge active={u.is_active} />
                    </div>
                    <div className="flex items-center gap-2"><RoleBadge role={u.role} /><VesselChips user={u} /></div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select aria-label={`Role for ${u.full_name}`} className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                        value={u.role} disabled={u.id === activeUser?.id} onChange={(e) => void changeRole(u, e.target.value as UserRole)}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      {!u.auth_user_id && <Button variant="secondary" size="sm" onClick={() => void invite(u)}><MailPlus className="size-3.5" aria-hidden /> Invite</Button>}
                      <Button variant="secondary" size="sm" onClick={() => setEditing(u)}><Pencil className="size-3.5" aria-hidden /> Edit</Button>
                      <Button variant="secondary" size="sm" onClick={() => setToggling(u)}><Power className="size-3.5" aria-hidden /> {u.is_active ? 'Deactivate' : 'Reactivate'}</Button>
                    </div>
                  </li>
                ))}
              </ul>
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
            </>
          )}
      </div>

      <UserFormModal open={creating} onClose={() => setCreating(false)}
        onSubmit={async (v) => { await createUser(v); toast.success(`Invitation sent to ${v.email}.`); refresh(); setCreating(false); }} />
      <UserFormModal open={!!editing} user={editing} onClose={() => setEditing(null)}
        onSubmit={async (v) => {
          await updateUser(editing!.id, { full_name: v.full_name, email: v.email });
          toast.success('User updated.'); refresh(); setEditing(null);
        }} />
      <ConfirmDialog open={!!toggling} danger={!!toggling?.is_active}
        title={toggling?.is_active ? `Deactivate ${toggling.full_name}?` : `Reactivate ${toggling?.full_name}?`}
        message={toggling?.is_active
          ? 'Their login will be disabled and they can no longer act. Their history is kept. This is refused if it would strand active work.'
          : 'Their login and application access will be restored.'}
        confirmLabel={toggling?.is_active ? 'Deactivate' : 'Reactivate'}
        onClose={() => setToggling(null)}
        onConfirm={async () => {
          const u = toggling!;
          await updateUser(u.id, { is_active: !u.is_active });
          toast.success(`${u.full_name} was ${u.is_active ? 'deactivated' : 'reactivated'}.`);
          refresh();
        }} />
    </>
  );
}
