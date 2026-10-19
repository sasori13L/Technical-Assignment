'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: 'md' | 'lg';
  children: ReactNode;
  footer?: ReactNode;
}

/** Native <dialog>: focus trapping, Escape to close and the backdrop come from the browser. */
export function Modal({ open, onClose, title, description, size = 'md', children, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={`m-auto max-h-[92dvh] w-[calc(100vw-1.5rem)] ${size === 'lg' ? 'max-w-2xl' : 'max-w-lg'} overflow-hidden rounded-xl bg-white p-0 shadow-2xl`}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 id="modal-title" className="text-lg font-semibold text-slate-900">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close"
              className="-mr-2 rounded-md p-2 text-slate-500 hover:bg-slate-100">
              <X className="size-5" aria-hidden />
            </button>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
