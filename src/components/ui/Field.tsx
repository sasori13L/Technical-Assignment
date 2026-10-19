import type { ReactNode } from 'react';

export const controlClass =
  'w-full min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-rose-500';

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}
