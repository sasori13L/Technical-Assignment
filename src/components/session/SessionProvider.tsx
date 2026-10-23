'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase/client';
import { advanceSessionGeneration } from '@/lib/auth/session';
import type { AppUser, SessionVessel } from '@/lib/types';
import { fetchCurrentProfile, fetchSessionVessels } from '@/services/switcher';

interface SessionValue {
  vessels: SessionVessel[];
  vesselId: string | null;
  activeUser: AppUser | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  selectVessel: (id: string) => void;
  signOut: () => Promise<void>;
}

const STORAGE_PREFIX = 'fleetops.vessel.v1';
const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [vesselId, setVesselId] = useState<string | null>(null);

  const clearProtectedState = useCallback(() => {
    advanceSessionGeneration();
    void queryClient.cancelQueries();
    queryClient.clear();
    setVesselId(null);
  }, [queryClient]);

  useEffect(() => {
    const supabase = getSupabase();
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setAuthUserId(data.session?.user.id ?? null);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      const nextId = session?.user.id ?? null;
      setAuthUserId((current) => {
        if (current !== nextId) clearProtectedState();
        return nextId;
      });
      setAuthReady(true);
      if (event === 'SIGNED_OUT') router.replace('/login');
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [clearProtectedState, router]);

  const profile = useQuery({
    queryKey: ['session', 'profile', authUserId],
    queryFn: ({ signal }) => fetchCurrentProfile(authUserId!, signal),
    enabled: authReady && !!authUserId,
    retry: false,
  });
  const activeUser = profile.data ?? null;

  const vesselsQuery = useQuery({
    queryKey: ['session', 'vessels', activeUser?.id],
    queryFn: ({ signal }) => fetchSessionVessels(signal),
    enabled: !!activeUser,
  });
  const vessels = useMemo(() => vesselsQuery.data ?? [], [vesselsQuery.data]);

  useEffect(() => {
    if (!activeUser || !vesselsQuery.data) return;
    const key = `${STORAGE_PREFIX}.${activeUser.id}`;
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(key); } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVesselId((current) => {
      if (current && vessels.some((v) => v.id === current)) return current;
      if (stored && vessels.some((v) => v.id === stored)) return stored;
      return vessels[0]?.id ?? null;
    });
  }, [activeUser, vessels, vesselsQuery.data]);

  const selectVessel = useCallback((id: string) => {
    if (!activeUser || !vessels.some((v) => v.id === id)) return;
    setVesselId(id);
    try { window.localStorage.setItem(`${STORAGE_PREFIX}.${activeUser.id}`, id); } catch { /* storage unavailable */ }
  }, [activeUser, vessels]);

  const retry = useCallback(() => {
    void profile.refetch();
    if (activeUser) void vesselsQuery.refetch();
  }, [profile, activeUser, vesselsQuery]);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
    clearProtectedState();
    router.replace('/login');
    router.refresh();
  }, [clearProtectedState, router]);

  const value = useMemo<SessionValue>(() => {
    const error = profile.error ?? vesselsQuery.error;
    return {
      vessels,
      vesselId,
      activeUser,
      loading: !authReady || (!!authUserId && profile.isPending) || (!!activeUser && vesselsQuery.isPending),
      error: error ? error.message : authReady && authUserId && profile.data === null
        ? 'Your login is not linked to an active FleetOps profile. Contact an administrator.' : null,
      retry,
      selectVessel,
      signOut,
    };
  }, [vessels, vesselId, activeUser, authReady, authUserId, profile.isPending, profile.error, profile.data,
      vesselsQuery.isPending, vesselsQuery.error, retry, selectVessel, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
