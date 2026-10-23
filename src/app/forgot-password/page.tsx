'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/Button';
import { Field, controlClass } from '@/components/ui/Field';
import { getSupabase } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=/update-password`;
    const { error: resetError } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setBusy(false);
    if (resetError) { setError(resetError.message); return; }
    setSent(true);
  }

  return <AuthCard title="Reset your password" description="We will email a secure password-reset link if the account exists.">
    {sent ? <div className="space-y-4 text-sm text-slate-700"><p>Check your inbox and follow the password-reset link.</p><Link href="/login" className="font-medium text-brand-700 hover:underline">Return to sign in</Link></div>
      : <form onSubmit={submit} className="space-y-4">
        <Field label="Email" htmlFor="reset-email"><input id="reset-email" type="email" autoComplete="email" required autoFocus className={controlClass} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        {error && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <Button type="submit" loading={busy} className="w-full">Send reset link</Button>
        <div className="text-center text-sm"><Link href="/login" className="font-medium text-brand-700 hover:underline">Return to sign in</Link></div>
      </form>}
  </AuthCard>;
}
