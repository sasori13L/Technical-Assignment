'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { setActiveUser } from '@/lib/auth/token';
import { ROLES, type SwitcherMember, type SwitcherVessel, type UserRole } from '@/lib/types';
import { fetchSwitcherMembers, fetchSwitcherVessels } from '@/services/switcher';

interface Selection {
  vesselId: string | null;
  role: UserRole;
  memberId: string | null;
}

interface SessionValue {
  vessels: SwitcherVessel[];
  members: SwitcherMember[];
  vesselId: string | null;
  role: UserRole;
  /** The mock user the whole app is currently acting as, or null while loading / when nobody matches. */
  activeUser: SwitcherMember | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  selectVessel: (id: string) => void;
  selectRole: (role: UserRole) => void;
  selectMember: (id: string) => void;
}

const STORAGE_KEY = 'mwo.selection.v1';
const DEFAULT_SELECTION: Selection = { vesselId: null, role: 'Admin', memberId: null };

function loadSelection(): Selection {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SELECTION;
    const parsed = JSON.parse(raw) as Partial<Selection>;
    return {
      vesselId: typeof parsed.vesselId === 'string' ? parsed.vesselId : null,
      role: ROLES.includes(parsed.role as UserRole) ? (parsed.role as UserRole) : 'Admin',
      memberId: typeof parsed.memberId === 'string' ? parsed.memberId : null,
    };
  } catch {
    return DEFAULT_SELECTION;
  }
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<Selection>(DEFAULT_SELECTION);
  const [hydrated, setHydrated] = useState(false);
  const [committedSession, setCommittedSession] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    setActiveUser(null);
    setCommittedSession(null);
    const filters = { predicate: (q: { queryKey: readonly unknown[] }) => q.queryKey[0] !== 'switcher' };
    void queryClient.cancelQueries(filters);
    queryClient.removeQueries(filters);
  }, [queryClient]);

  // Restore the last selection (client only, so server and first client render match).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelection(loadSelection());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection)); } catch { /* storage unavailable */ }
  }, [selection, hydrated]);

  const vesselsQuery = useQuery({
    queryKey: ['switcher', 'vessels'],
    queryFn: ({ signal }) => fetchSwitcherVessels(signal),
    enabled: hydrated,
  });
  const vessels = vesselsQuery.data;
  // Only trust a vessel id (possibly restored from storage) once the server has listed it.
  const vesselValid = !!vessels?.some((v) => v.id === selection.vesselId);

  // Dropdown 1: make sure the selected vessel exists, defaulting to the first one.
  useEffect(() => {
    if (!vessels) return;
    if (selection.vesselId && vessels.some((v) => v.id === selection.vesselId)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelection((s) => s.vesselId === (vessels[0]?.id ?? null) ? s
      : { ...s, vesselId: vessels[0]?.id ?? null, memberId: null });
  }, [vessels, selection.vesselId]);

  // Dropdowns 2 and 3: members of the chosen role on the chosen vessel.
  const membersQuery = useQuery({
    queryKey: ['switcher', 'members', selection.vesselId, selection.role],
    queryFn: ({ signal }) => fetchSwitcherMembers(selection.vesselId, selection.role, signal),
    enabled: hydrated && (selection.role === 'Admin' || vesselValid),
  });
  const members = !vesselsQuery.isError && !membersQuery.isError
    && (selection.role === 'Admin' || vesselValid) ? membersQuery.data : undefined;

  // Auto-pick the first member when the current choice is not in the list.
  useEffect(() => {
    if (!members) return;
    if (selection.memberId && members.some((m) => m.id === selection.memberId)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelection((s) => ({ ...s, memberId: members[0]?.id ?? null }));
  }, [members, selection.memberId]);

  const candidate = members?.find((m) => m.id === selection.memberId) ?? null;
  const sessionKey = candidate
    ? JSON.stringify([selection.vesselId, selection.role, candidate.id, candidate.role, candidate.full_name]) : null;
  const candidateId = candidate?.id ?? null;

  // Expose a user only after the matching token source is committed. Errors and
  // mismatched cached selections cannot keep the previous account actionable.
  useEffect(() => {
    if (committedSession === sessionKey) return;
    // Commit the external token source and React identity together after query resolution.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    clearSession();
    setActiveUser(candidateId);
    setCommittedSession(sessionKey);
  }, [sessionKey, candidateId, committedSession, clearSession]);

  const activeUser = sessionKey && committedSession === sessionKey ? candidate : null;

  const selectVessel = useCallback(
    (id: string) => { clearSession(); setSelection((s) => ({ ...s, vesselId: id, memberId: null })); },
    [clearSession],
  );
  const selectRole = useCallback(
    (role: UserRole) => { clearSession(); setSelection((s) => ({ ...s, role, memberId: null })); },
    [clearSession],
  );
  const selectMember = useCallback((id: string) => {
    clearSession();
    setSelection((s) => ({ ...s, memberId: id }));
  }, [clearSession]);
  const retry = useCallback(() => {
    void vesselsQuery.refetch();
    if (selection.role === 'Admin' || vesselValid) void membersQuery.refetch();
  }, [vesselsQuery, membersQuery, selection.role, vesselValid]);

  const value = useMemo<SessionValue>(() => {
    const error = vesselsQuery.error ?? membersQuery.error;
    return {
      vessels: vessels ?? [],
      members: members ?? [],
      vesselId: selection.vesselId,
      role: selection.role,
      activeUser,
      loading: !hydrated || vesselsQuery.isPending
        || ((selection.role === 'Admin' || vesselValid) && membersQuery.isPending)
        || (!!candidate && !activeUser),
      error: error ? error.message : null,
      retry,
      selectVessel,
      selectRole,
      selectMember,
    };
  }, [vessels, members, selection, activeUser, hydrated, vesselValid, vesselsQuery.isPending, vesselsQuery.error,
      membersQuery.isPending, membersQuery.error, candidate, retry, selectVessel, selectRole, selectMember]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
