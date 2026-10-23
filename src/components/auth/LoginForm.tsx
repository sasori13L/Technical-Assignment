'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthCard } from './AuthCard';
import { Button } from '@/components/ui/Button';
import { Field, controlClass } from '@/components/ui/Field';
import { getSupabase } from '@/lib/supabase/client';

export function LoginForm({ next = '/' }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const { error: signInError } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (signInError) { setError('Invalid email or password, or this account is unavailable.'); return; }
    router.replace(next.startsWith('/') && !next.startsWith('//') ? next : '/');
    router.refresh();
  }

  return <AuthCard title="Sign in" description="Use the account your FleetOps administrator invited.">
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Email" htmlFor="login-email">
        <input id="login-email" type="email" autoComplete="email" required autoFocus className={controlClass}
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="login-password">
        <input id="login-password" type="password" autoComplete="current-password" required className={controlClass}
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <Button type="submit" loading={busy} className="w-full">Sign in</Button>
      <div className="text-center text-sm"><Link className="font-medium text-brand-700 hover:underline" href="/forgot-password">Forgot password?</Link></div>
    </form>
  </AuthCard>;
}
