'use client';

import { Button } from '@/components/ui/Button';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-xl bg-white p-8 text-center shadow-sm">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">{error.message}</p>
      <Button className="mt-4" onClick={reset}>Try again</Button>
    </div>
  );
}
