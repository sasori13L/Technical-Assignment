'use client';

import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import type { Page } from '@/lib/types';
import { Button } from './Button';
import { Field, controlClass } from './Field';
import { ErrorState } from './States';

export interface PickerOption { id: string; label: string }

/** A native select with server-side search and explicit, bounded result pages. */
export function SearchSelect<T extends PickerOption>({ label, queryKey, fetchPage, value, onChange,
  disabled = false, autoSelectFirst = false, disabledIds = new Set<string>() }: {
  label: string;
  queryKey: QueryKey;
  fetchPage: (search: string, page: number, signal: AbortSignal) => Promise<Page<T>>;
  value: T | null;
  onChange: (value: T | null) => void;
  disabled?: boolean;
  autoSelectFirst?: boolean;
  disabledIds?: ReadonlySet<string>;
}) {
  const id = useId();
  const [input, setInput] = useState('');
  const search = useDebounce(input, 300);
  const query = useInfiniteQuery({
    queryKey: [...queryKey, search],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => fetchPage(search, pageParam, signal),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.rows.length, 0);
      return last.rows.length && loaded < last.total ? pages.length + 1 : undefined;
    },
    enabled: !disabled,
  });
  const options = query.data?.pages.flatMap((page) => page.rows) ?? [];
  const first = query.data?.pages[0]?.rows[0];

  useEffect(() => {
    if (autoSelectFirst && !disabled && !value && !input && first) onChange(first);
  }, [autoSelectFirst, disabled, value, input, first, onChange]);

  const choices = value && !options.some((item) => item.id === value.id) ? [value, ...options] : options;
  return <div className="space-y-2">
    <Field label={`Search ${label.toLowerCase()}`} htmlFor={`${id}-search`}>
      <input id={`${id}-search`} type="search" className={controlClass} value={input} disabled={disabled}
        onChange={(e) => setInput(e.target.value)} placeholder="Type to search…" />
    </Field>
    <Field label={label} htmlFor={`${id}-select`}>
      <select id={`${id}-select`} className={controlClass} value={value?.id ?? ''}
        disabled={disabled || query.isPending || query.isError || input !== search}
        onChange={(e) => onChange(choices.find((item) => item.id === e.target.value) ?? null)}>
        <option value="">{query.isFetching ? 'Loading…' : `Select ${label.toLowerCase()}…`}</option>
        {choices.map((item) => <option key={item.id} value={item.id} disabled={disabledIds.has(item.id)}>
          {item.label}{disabledIds.has(item.id) ? ' (already assigned)' : ''}
        </option>)}
      </select>
    </Field>
    {query.isError && <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />}
    {!disabled && query.isSuccess && options.length === 0 && <p className="text-xs text-slate-500">No matching results. Try another search.</p>}
    {query.hasNextPage && <Button variant="secondary" size="sm" loading={query.isFetchingNextPage}
      disabled={query.isFetching && !query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Load more {label.toLowerCase()}</Button>}
  </div>;
}
