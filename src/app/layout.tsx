import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppProviders } from '@/components/providers/AppProviders';
import { AppNav } from '@/components/layout/AppNav';
import { UtilityBar } from '@/components/layout/UtilityBar';
import './globals.css';

export const metadata: Metadata = {
  title: 'FleetOps Work Orders',
  description: 'Vessel-scoped work orders, crew and role management for marine operations.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900 focus:shadow-lg">
          Skip to main content
        </a>
        <AppProviders>
          <UtilityBar />
          <AppNav />
          <main id="main" tabIndex={-1} className="mx-auto max-w-7xl px-3 py-5 outline-none sm:px-4 sm:py-6">{children}</main>
        </AppProviders>
      </body>
    </html>
  );
}
