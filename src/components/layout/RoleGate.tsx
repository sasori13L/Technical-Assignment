'use client';

import { House, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useSession } from '@/components/session/SessionProvider';
import { SkeletonRows } from '@/components/ui/States';
import type { UserRole } from '@/lib/types';

/** Renders children only for the allowed roles. The database enforces this too; this is just the friendly message. */
export function RoleGate({ allow, children }: { allow: UserRole[]; children: ReactNode }) {
  const { activeUser, loading } = useSession();

  if (loading) return <div className="rounded-xl bg-white shadow-sm"><SkeletonRows rows={4} /></div>;
  if (!activeUser) {
    return (
      <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-600 shadow-sm">
        Your signed-in account does not have an active FleetOps profile. Contact an administrator.
      </div>
    );
  }
  if (!allow.includes(activeUser.role)) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-10 text-center shadow-sm">
        <ShieldAlert className="size-8 text-amber-500" aria-hidden />
        <h2 className="text-base font-semibold">This area is for {allow.join(' / ')} users</h2>
        <p className="max-w-sm text-sm text-slate-600">
          You are signed in as {activeUser.full_name} ({activeUser.role}). Your account does not have access to this area.
        </p>
        <Link href="/"
          className="mt-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700">
          <House className="size-4" aria-hidden />
          Return home
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
