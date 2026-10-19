import { AlertTriangle, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
      <Inbox className="size-8 text-slate-400" aria-hidden />
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="m-4 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1">
        <p className="font-medium">Something went wrong</p>
        <p className="mt-0.5">{message}</p>
      </div>
      {onRetry && <button type="button" onClick={onRetry} className="font-medium underline">Retry</button>}
    </div>
  );
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="divide-y divide-slate-100">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-4 px-4 py-4">
          <div className="h-4 w-16 rounded bg-slate-200" />
          <div className="h-4 flex-1 rounded bg-slate-200" />
          <div className="hidden h-4 w-24 rounded bg-slate-200 sm:block" />
          <div className="h-5 w-20 rounded-full bg-slate-200" />
        </div>
      ))}
    </div>
  );
}
