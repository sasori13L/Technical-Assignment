'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, controlClass } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { errorMessage } from '@/lib/errors';
import { VESSEL_TYPES, type Vessel } from '@/lib/types';
import { fieldErrors, vesselSchema, type VesselInput } from '@/lib/validation';

interface Props {
  open: boolean;
  vessel?: Vessel | null;
  onClose: () => void;
  onSubmit: (values: VesselInput) => Promise<unknown>;
}

export function VesselFormModal({ open, vessel, onClose, onSubmit }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={vessel ? 'Edit vessel' : 'New vessel'}
      description="Name and IMO number must both be unique.">
      {open && <VesselForm key={vessel?.id ?? 'new'} vessel={vessel ?? null} onClose={onClose} onSubmit={onSubmit} />}
    </Modal>
  );
}

function VesselForm({ vessel, onClose, onSubmit }: Omit<Props, 'open'>) {
  const [values, setValues] = useState({ name: vessel?.name ?? '', imo_number: vessel?.imo_number ?? '', vessel_type: vessel?.vessel_type ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = vesselSchema.safeParse(values);
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
      <Field label="Vessel name" htmlFor="v-name" error={errors.name}>
        <input id="v-name" className={controlClass} value={values.name} onChange={set('name')} maxLength={100}
          aria-invalid={!!errors.name} placeholder="e.g. MV Pacific Dawn" autoComplete="off" />
      </Field>
      <Field label="IMO number" htmlFor="v-imo" error={errors.imo_number} hint="Exactly 7 digits.">
        <input id="v-imo" inputMode="numeric" className={controlClass} value={values.imo_number} onChange={set('imo_number')}
          maxLength={7} aria-invalid={!!errors.imo_number} autoComplete="off" />
      </Field>
      <Field label="Vessel type" htmlFor="v-type" error={errors.vessel_type}>
        <select id="v-type" className={controlClass} value={values.vessel_type} onChange={set('vessel_type')}
          aria-invalid={!!errors.vessel_type}>
          <option value="">Select type…</option>
          {VESSEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      {formError && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={busy}>{vessel ? 'Save changes' : 'Create vessel'}</Button>
      </div>
    </form>
  );
}
