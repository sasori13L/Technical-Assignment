import type { PostgrestError } from '@supabase/supabase-js';
import { toServiceError } from '@/lib/errors';
import type { Page } from '@/lib/types';

/** Strip characters that have meaning in PostgREST filter strings so user text stays a plain value. */
export function sanitizeSearch(input: string): string {
  return input.replace(/[%*,()\\"'`;:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

export function pageRange(page: number, pageSize: number): [number, number] {
  const from = (Math.max(page, 1) - 1) * pageSize;
  return [from, from + pageSize - 1];
}

interface CountedResult {
  data: unknown[] | null;
  count: number | null;
  error: PostgrestError | null;
}

/**
 * Runs a paginated, counted query. PostgREST answers 416 (PGRST103) when the
 * requested page is past the end, for example after a filter shrinks the list.
 * That becomes an empty page that still reports the real total, so the UI can
 * step back instead of showing an error.
 */
export async function runPage<T>(query: PromiseLike<CountedResult>): Promise<Page<T>> {
  const { data, count, error } = await query;
  if (error) {
    if (error.code === 'PGRST103') {
      const total = Number(/only (\d+) rows?/.exec(error.details ?? '')?.[1] ?? 0);
      return { rows: [], total };
    }
    throw toServiceError(error);
  }
  return { rows: (data ?? []) as T[], total: count ?? 0 };
}

/** Read complete rosters/dropdown RPCs despite the API's per-response row cap.
 * Advance by rows actually returned, not the requested size (the server may cap it).
 * Callers must provide a stable order with a unique tie-breaker.
 */
export async function readAllRows<T>(
  fetchRange: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await fetchRange(rows.length, rows.length + 199);
    if (error) {
      if (error.code === 'PGRST103') return rows;
      throw toServiceError(error);
    }
    if (!data?.length) return rows;
    rows.push(...data as T[]);
  }
}
