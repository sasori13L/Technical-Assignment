'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppNav } from './AppNav';
import { UtilityBar } from './UtilityBar';

const AUTH_PATHS = ['/login', '/forgot-password', '/update-password'];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const authPage = AUTH_PATHS.some((path) => pathname.startsWith(path));
  if (authPage) return <main id="main" tabIndex={-1} className="min-h-dvh outline-none">{children}</main>;
  return <>
    <UtilityBar />
    <AppNav />
    <main id="main" tabIndex={-1} className="mx-auto max-w-7xl px-3 py-5 outline-none sm:px-4 sm:py-6">{children}</main>
  </>;
}
