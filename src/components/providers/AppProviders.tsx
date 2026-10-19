'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { SessionProvider } from '@/components/session/SessionProvider';
import { ToastProvider } from '@/components/ui/Toast';

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 },
      },
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SessionProvider>{children}</SessionProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
