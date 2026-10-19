'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, controlClass } from '@/components/ui/Field';
import { errorMessage } from '@/lib/errors';
import { fieldErrors, workOrderSchema, type WorkOrderInput } from '@/lib/validation';

interface Props {
  crew: { id: string; full_name: string }[];
  initial?: WorkOrderInput;
  submitLabel: string;
  onSubmit: (values: WorkOrderInput) => Promise<unknown>;
  onCancel: () => void;
  onDraftChange?: (values: WorkOrderInput) => void;
}

/** Shared by "New work order" and the captain's "Edit details". */
export function WorkOrderForm({ crew, initial, submitLabel, onSubmit, onCancel, onDraftChange }: Props) {
  const [values, setValues] = useState<WorkOrderInput>(initial ?? { title: '', issue: '', assigned_to: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof WorkOrderInput) => (e: { target: { value: string } }) => {
    const next = { ...values, [key]: e.target.value };
    setValues(next);
    onDraftChange?.(next);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = workOrderSchema.safeParse(values);
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
      <Field label="Title" htmlFor="wo-title" error={errors.title}>
        <input id="wo-title" className={controlClass} value={values.title} onChange={set('title')} maxLength={150}
          aria-invalid={!!errors.title} placeholder="e.g. Replace hydraulic pump seal" autoComplete="off" />
      </Field>
      <Field label="Issue" htmlFor="wo-issue" error={errors.issue} hint="What is wrong, where, and since when.">
        <textarea id="wo-issue" className={controlClass} rows={4} value={values.issue} onChange={set('issue')}
          maxLength={4000} aria-invalid={!!errors.issue} />
      </Field>
      <Field label="Assign to crew member" htmlFor="wo-assignee" error={errors.assigned_to}>
        <select id="wo-assignee" className={controlClass} value={values.assigned_to} onChange={set('assigned_to')}
          aria-invalid={!!errors.assigned_to} disabled={crew.length === 0}>
          <option value="">{crew.length === 0 ? 'No active crew on this vessel' : 'Select crew member…'}</option>
          {crew.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
      </Field>
      {crew.length === 0 && (
        <p className="text-xs text-amber-700">Ask an administrator to assign crew to this vessel first.</p>
      )}
      {formError && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={busy} disabled={crew.length === 0}>{submitLabel}</Button>
      </div>
    </form>
  );
}
