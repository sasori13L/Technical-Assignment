import { Anchor } from 'lucide-react';
import type { ReactNode } from 'react';

export function AuthCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-navy-950 via-navy-900 to-brand-700 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-center gap-2 text-lg font-semibold text-navy-900">
          <Anchor className="size-6 text-brand-600" aria-hidden /> FleetOps
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
