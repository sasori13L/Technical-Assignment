'use client';

import { useState } from 'react';
import { errorMessage } from '@/lib/errors';
import { Button } from './Button';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}

/** Runs the action and keeps the dialog open, with the reason, if the database refuses it. */
export function ConfirmDialog({ open, title, message, confirmLabel, danger, onConfirm, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => { setError(null); onClose(); };

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title={title}
      footer={<>
        <Button variant="secondary" onClick={close}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={run}>{confirmLabel}</Button>
      </>}>
      <p className="text-sm text-slate-700">{message}</p>
      {error && <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </Modal>
  );
}
