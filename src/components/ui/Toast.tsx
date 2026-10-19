'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { getSessionGeneration } from '@/lib/auth/token';

type Kind = 'success' | 'error';
interface ToastItem { id: number; kind: Kind; message: string }
interface ToastApi { success: (message: string) => void; error: (message: string) => void }

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  const generation = getSessionGeneration();
  const scoped = useMemo<ToastApi>(() => ({
    success: (message) => { if (generation === getSessionGeneration()) api?.success(message); },
    error: (message) => { if (generation === getSessionGeneration()) api?.error(message); },
  }), [api, generation]);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>.');
  return scoped;
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: Kind, message: string) => {
    const id = nextId++;
    setItems((list) => [...list, { id, kind, message }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col items-center gap-2 sm:items-end">
        {items.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-lg px-4 py-3 text-sm shadow-lg ${
              t.kind === 'error' ? 'bg-rose-700 text-white' : 'bg-slate-900 text-white'}`}>
            {t.kind === 'error'
              ? <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
