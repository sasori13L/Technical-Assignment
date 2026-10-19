'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, controlClass } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { errorMessage } from '@/lib/errors';
import { ROLES, type AppUser } from '@/lib/types';
import { fieldErrors, userSchema, type UserInput } from '@/lib/validation';

interface Props {
  open: boolean;
  /** Present when editing. Role is changed from the table, so it is locked here. */
  user?: AppUser | null;
  onClose: () => void;
  onSubmit: (values: UserInput) => Promise<unknown>;
}

export function UserFormModal({ open, user, onClose, onSubmit }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={user ? 'Edit user' : 'New user'}
      description={user ? 'Update name and email.' : 'Create a user. They can be assigned to vessels afterwards.'}>
      {open && <UserForm key={user?.id ?? 'new'} user={user ?? null} onClose={onClose} onSubmit={onSubmit} />}
    </Modal>
  );
}

function UserForm({ user, onClose, onSubmit }: Omit<Props, 'open'>) {
  const [values, setValues] = useState({ full_name: user?.full_name ?? '', email: user?.email ?? '', role: user?.role ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = userSchema.safeParse(values);
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    setErrors({});
    setBusy(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Full name" htmlFor="u-name" error={errors.full_name}>
        <input id="u-name" className={controlClass} value={values.full_name} onChange={set('full_name')}
          maxLength={100} aria-invalid={!!errors.full_name} autoComplete="off" />
      </Field>
      <Field label="Email" htmlFor="u-email" error={errors.email} hint="Must be unique. Capital letters are ignored.">
        <input id="u-email" type="email" className={controlClass} value={values.email} onChange={set('email')}
          maxLength={254} aria-invalid={!!errors.email} autoComplete="off" />
      </Field>
      <Field label="Role" htmlFor="u-role" error={errors.role}
        hint={user ? 'Change the role from the users table.' : undefined}>
        <select id="u-role" className={controlClass} value={values.role} onChange={set('role')}
          aria-invalid={!!errors.role} disabled={!!user}>
          <option value="">Select role…</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      {formError && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={busy}>{user ? 'Save changes' : 'Create user'}</Button>
      </div>
    </form>
  );
}
