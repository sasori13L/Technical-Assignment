'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/Button';
import { Field, controlClass } from '@/components/ui/Field';
import { getSupabase } from '@/lib/supabase/client';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    if (password.length < 12) { setError('Use at least 12 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    const { error: updateError } = await getSupabase().auth.updateUser({ password });
    setBusy(false);
    if (updateError) { setError(updateError.message); return; }
    router.replace('/'); router.refresh();
  }

  return <AuthCard title="Choose a password" description="Use at least 12 characters and a password you do not reuse elsewhere.">
    <form onSubmit={submit} className="space-y-4">
      <Field label="New password" htmlFor="new-password"><input id="new-password" type="password" autoComplete="new-password" required autoFocus minLength={12} className={controlClass} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <Field label="Confirm password" htmlFor="confirm-password"><input id="confirm-password" type="password" autoComplete="new-password" required minLength={12} className={controlClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
      {error && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <Button type="submit" loading={busy} className="w-full">Save password</Button>
    </form>
  </AuthCard>;
}
