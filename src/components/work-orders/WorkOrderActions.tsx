'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Lock, Pencil, Play, RotateCcw, Save, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, controlClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/errors';
import { getSessionGeneration } from '@/lib/auth/session';
import type { SwitcherMember, WorkOrderRow } from '@/lib/types';
import { rejectionSchema, solutionSchema, type WorkOrderInput } from '@/lib/validation';
import { listVesselCrew } from '@/services/assignments';
import {
  attestWorkOrder, completeWorkOrder, editWorkOrder, rejectWorkOrder, saveSolution, startWorkOrder,
  type WorkOrderSnapshot,
} from '@/services/workOrders';
import { WorkOrderForm } from './WorkOrderForm';

interface Props {
  order: WorkOrderRow;
  user: SwitcherMember;
}

const Note = ({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) => (
  <p className="flex items-start gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
    <span className="mt-0.5 shrink-0 text-slate-500">{icon}</span><span>{children}</span>
  </p>
);

/** The role-specific part of the detail view. The database re-checks every one of these rules. */
export function WorkOrderActions({ order, user }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [solution, setSolution] = useState(order.solution ?? '');
  const [solutionError, setSolutionError] = useState<string>();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [expected, setExpected] = useState<WorkOrderSnapshot>(order);
  const [editDraft, setEditDraft] = useState<WorkOrderInput>({ title: order.title, issue: order.issue, assigned_to: order.assigned_to });
  const needsReview = expected.updated_at !== order.updated_at;

  const attested = order.attested_at !== null;
  const isCaptain = user.role === 'Captain';
  const isAssignedCrew = user.role === 'Crew' && order.assigned_to === user.id;

  const crew = useQuery({
    queryKey: ['vessel-crew', user.id, order.vessel_id],
    queryFn: () => listVesselCrew(order.vessel_id),
    enabled: isCaptain && editing,
  });

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['work-orders'] }),
    queryClient.invalidateQueries({ queryKey: ['wo-stats'] }),
    queryClient.invalidateQueries({ queryKey: ['wo', user.id, order.id] }),
    queryClient.invalidateQueries({ queryKey: ['wo-events', user.id, order.id] }),
  ]);

  const action = useMutation({
    mutationFn: ({ run }: { run: () => Promise<WorkOrderSnapshot>; success: string; generation: number; onSaved?: () => void }) => run(),
    onMutate: () => setError(null),
    onSuccess: async (saved, v) => {
      if (getSessionGeneration() !== v.generation) return;
      setExpected(saved);
      v.onSaved?.();
      toast.success(v.success);
      await refresh();
    },
    onError: async (e, v) => {
      if (getSessionGeneration() !== v.generation) return;
      setError(errorMessage(e));
      await refresh();
    },
  });
  const busy = action.isPending;
  const act = (run: () => Promise<WorkOrderSnapshot>, success: string, onSaved?: () => void) =>
    action.mutate({ run, success, onSaved, generation: getSessionGeneration() });

  function withSolution(fn: (text: string) => Promise<WorkOrderSnapshot>, success: string) {
    const parsed = solutionSchema.safeParse(solution);
    if (!parsed.success) { setSolutionError(parsed.error.issues[0]?.message); return; }
    setSolutionError(undefined);
    act(() => fn(parsed.data), success);
  }

  function submitRejection() {
    const parsed = rejectionSchema.safeParse(reason);
    if (!parsed.success) { setReasonError(parsed.error.issues[0]?.message); return; }
    setReasonError(undefined);
    act(() => rejectWorkOrder(expected, parsed.data), 'Sent back to the crew with your reason.', () => {
      setRejecting(false);
      setReason('');
    });
  }

  let body: React.ReactNode;

  if (attested) {
    body = <Note icon={<Lock className="size-4" aria-hidden />}>This work order is attested and locked. It can no longer be changed.</Note>;

  } else if (user.role === 'Admin') {
    body = <Note icon={<ShieldAlert className="size-4" aria-hidden />}>Administrators have read-only access to work orders.</Note>;

  } else if (isAssignedCrew && order.status === 'Open') {
    body = (
      <Button loading={busy} onClick={() => act(() => startWorkOrder(expected), 'Work started.')}>
        <Play className="size-4" aria-hidden /> Start work
      </Button>
    );

  } else if (isAssignedCrew && order.status === 'In Progress') {
    body = (
      <div className="space-y-3">
        <Field label="Solution" htmlFor="wo-solution" error={solutionError}
          hint="Describe what you did. Required before you can mark the work order Done.">
          <textarea id="wo-solution" className={controlClass} rows={5} value={solution} maxLength={4000}
            aria-invalid={!!solutionError} onChange={(e) => setSolution(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={busy}
            onClick={() => act(() => saveSolution(expected, solution), 'Draft saved.')}>
            <Save className="size-4" aria-hidden /> Save draft
          </Button>
          <Button loading={busy}
            onClick={() => withSolution((text) => completeWorkOrder(expected, text), 'Marked Done and sent to the captain.')}>
            <CheckCheck className="size-4" aria-hidden /> Mark as Done
          </Button>
        </div>
      </div>
    );

  } else if (isCaptain && order.status === 'Done') {
    body = rejecting ? (
      <div className="space-y-3">
        <Field label="Rejection reason" htmlFor="wo-reason" error={reasonError}
          hint="The crew member sees this and the order goes back to In Progress.">
          <textarea id="wo-reason" className={controlClass} rows={3} value={reason} maxLength={1000}
            aria-invalid={!!reasonError} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => { setRejecting(false); setReasonError(undefined); }}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={submitRejection}>
            <RotateCcw className="size-4" aria-hidden /> Reject and send back
          </Button>
        </div>
      </div>
    ) : (
      <div className="space-y-2">
        <p className="text-sm text-slate-600">The crew marked this Done. Review the solution, then attest it or send it back.</p>
        <div className="flex flex-wrap gap-2">
          <Button loading={busy} onClick={() => act(() => attestWorkOrder(expected), 'Attested. The record is now closed.')}>
            <CheckCheck className="size-4" aria-hidden /> Attest
          </Button>
          <Button variant="secondary" onClick={() => setRejecting(true)}>
            <RotateCcw className="size-4" aria-hidden /> Reject…
          </Button>
        </div>
      </div>
    );

  } else if (isCaptain && editing) {
    body = (
      <WorkOrderForm
        crew={crew.data ?? []}
        initial={editDraft}
        onDraftChange={setEditDraft}
        submitLabel="Save changes"
        onCancel={() => setEditing(false)}
        onSubmit={async (v) => {
          const generation = getSessionGeneration();
          let saved: WorkOrderSnapshot;
          try {
            saved = await editWorkOrder(expected, v);
          } catch (e) {
            if (getSessionGeneration() === generation) await refresh();
            throw e;
          }
          if (getSessionGeneration() !== generation) return;
          setExpected(saved);
          toast.success('Work order updated.');
          await refresh();
          setEditing(false);
        }}
      />
    );

  } else if (isCaptain) {
    body = (
      <Button variant="secondary" onClick={() => {
        setEditDraft({ title: order.title, issue: order.issue, assigned_to: order.assigned_to });
        setEditing(true);
      }}>
        <Pencil className="size-4" aria-hidden /> Edit details or reassign
      </Button>
    );

  } else if (user.role === 'Crew' && order.status === 'Done') {
    body = <Note icon={<CheckCheck className="size-4" aria-hidden />}>Submitted. Waiting for the captain to attest or reject it.</Note>;

  } else {
    body = null;
  }

  if (!body) return null;
  return (
    <section aria-label="Actions" className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      {needsReview && !busy && <div role="alert" className="space-y-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
        <p>This record changed. Your draft is still here. Review the latest details above before applying it again.</p>
        {isAssignedCrew && <p className="whitespace-pre-wrap">Latest saved solution: {order.solution || 'Not documented yet.'}</p>}
        {isAssignedCrew && solution !== (order.solution ?? '') && <p className="whitespace-pre-wrap">Your solution draft: {solution || '(empty)'}</p>}
        {editing && <p className="whitespace-pre-wrap">Your draft title: {editDraft.title}{'\n'}Your draft issue: {editDraft.issue}</p>}
        {reason && <p className="whitespace-pre-wrap">Your rejection draft: {reason}</p>}
        <Button variant="secondary" onClick={() => { setExpected(order); setError(null); }}>I reviewed the latest record — keep my draft</Button>
      </div>}
      <fieldset disabled={busy || needsReview} className="min-w-0">{body}</fieldset>
      {error && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
