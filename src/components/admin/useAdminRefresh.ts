'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getSessionGeneration } from '@/lib/auth/token';

/** After any admin change, refresh everything that could show it: admin lists, the top-bar dropdowns and work order screens. */
export function useAdminRefresh() {
  const queryClient = useQueryClient();
  const generation = getSessionGeneration();
  return useCallback(() => {
    if (generation !== getSessionGeneration()) return;
    for (const key of ['admin', 'switcher', 'work-orders', 'wo-stats', 'vessel-crew', 'wo', 'wo-events']) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  }, [queryClient, generation]);
}
