'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, Plus, UserMinus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ActiveBadge, RoleBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { SearchSelect, type PickerOption } from '@/components/ui/SearchSelect';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { getSessionGeneration } from '@/lib/auth/token';
import { errorMessage } from '@/lib/errors';
import type { AssignmentWithUser, Vessel } from '@/lib/types';
import { addAssignment, listAssignments, moveAssignment, removeAssignment } from '@/services/assignments';
import { listAssignableUsers } from '@/services/users';
import { getVessel, listVesselOptions } from '@/services/vessels';
import { useAdminRefresh } from './useAdminRefresh';

interface VesselOption extends PickerOption { is_active: boolean }
const vesselOption = (v: Vessel): VesselOption => ({ id: v.id, label: `${v.name}${v.is_active ? '' : ' (inactive)'}`, is_active: v.is_active });

async function fetchPeople(search: string, page: number, signal: AbortSignal) {
  const result = await listAssignableUsers(search, page, signal);
  return { ...result, rows: result.rows.map((u) => ({ id: u.id, label: `${u.full_name} (${u.role})` })) };
}

function VesselPicker({ value, onChange, activeOnly = false, excludeId, autoSelectFirst = false }: {
  value: VesselOption | null;
  onChange: (v: VesselOption | null) => void;
  activeOnly?: boolean;
  excludeId?: string;
  autoSelectFirst?: boolean;
}) {
  const fetchPage = useCallback(async (search: string, page: number, signal: AbortSignal) => {
    const result = await listVesselOptions(search, page, activeOnly, signal, excludeId);
    return { ...result, rows: result.rows.map(vesselOption) };
  }, [activeOnly, excludeId]);
  return <SearchSelect label="Vessel" queryKey={['admin', 'vessel-options', activeOnly, excludeId]}
    fetchPage={fetchPage} value={value} onChange={onChange} autoSelectFirst={autoSelectFirst} />;
}

export function AssignmentsPanel() {
  const params = useSearchParams();
  const [picked, setPicked] = useState<string | null>(params.get('vessel'));
  const vessel = useQuery({ queryKey: ['admin', 'vessel', picked],
    queryFn: ({ signal }) => getVessel(picked!, signal), enabled: !!picked });
  const selected = useMemo(() => vessel.data ? vesselOption(vessel.data) : null, [vessel.data]);
  const choose = useCallback((v: VesselOption | null) => setPicked(v?.id ?? null), []);

  return <>
    <PageHeader title="Vessel assignments" description="Decide who works on which vessel. Captains and crew only see the vessels they are assigned to." />
    <div className="mb-4 rounded-xl bg-white p-4 shadow-sm sm:max-w-lg">
      <VesselPicker value={selected} onChange={choose} autoSelectFirst={!picked} />
    </div>
    {picked && vessel.isPending ? <SkeletonRows rows={4} />
      : vessel.isError ? <ErrorState message={vessel.error.message} onRetry={() => void vessel.refetch()} />
      : vessel.data && picked ? <AssignmentRoster key={picked} vessel={vessel.data} />
      : <EmptyState title="Select a vessel" description="Search for a vessel above, or create one in Vessels." />}
  </>;
}

function AssignmentRoster({ vessel }: { vessel: Vessel }) {
  const toast = useToast();
  const refresh = useAdminRefresh();
  const [person, setPerson] = useState<PickerOption | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [moving, setMoving] = useState<AssignmentWithUser | null>(null);
  const [removing, setRemoving] = useState<AssignmentWithUser | null>(null);
  const roster = useQuery({ queryKey: ['admin', 'assignments', vessel.id],
    queryFn: ({ signal }) => listAssignments(vessel.id, signal) });
  const assigned = useMemo(() => new Set((roster.data ?? []).map((a) => a.user_id)), [roster.data]);

  async function add() {
    if (!person) { setAddError('Choose a person to add.'); return; }
    const generation = getSessionGeneration();
    setAddError(null);
    setAdding(true);
    try {
      await addAssignment(vessel.id, person.id);
      if (getSessionGeneration() !== generation) return;
      toast.success('Added to the vessel.');
      setPerson(null);
      refresh();
    } catch (e) {
      if (getSessionGeneration() === generation) setAddError(errorMessage(e));
    } finally {
      setAdding(false);
    }
  }

  return <>
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-3">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <SearchSelect label="Person" queryKey={['admin', 'assignable', vessel.id]} fetchPage={fetchPeople}
            value={person} onChange={(p) => { setPerson(p); setAddError(null); }} disabledIds={assigned}
            disabled={!vessel.is_active || roster.isPending || roster.isError || adding} />
          {addError && <p role="alert" className="mt-2 text-sm text-rose-700">{addError}</p>}
          {!vessel.is_active && <p className="mt-2 text-sm text-amber-700">Reactivate this vessel before adding assignments.</p>}
        </div>
        <Button onClick={() => void add()} loading={adding}
          disabled={!person || assigned.has(person.id) || !vessel.is_active || roster.isPending || roster.isError}
          data-testid="add-assignment"><Plus className="size-4" aria-hidden /> Add to vessel</Button>
      </div>
      {roster.isPending ? <SkeletonRows rows={4} />
        : roster.isError ? <ErrorState message={roster.error.message} onRetry={() => void roster.refetch()} />
        : roster.data.length === 0 ? <EmptyState title={`Nobody is assigned to ${vessel.name}`} description="Select a captain or crew member above to build the roster." />
        : <ul className="divide-y divide-slate-100" aria-label={`People on ${vessel.name}`}>
          {roster.data.map((a) => <li key={a.id} data-testid="roster-row" className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
              <p className="truncate font-medium text-slate-900">{a.users?.full_name}</p>
              <p className="truncate text-xs text-slate-500">{a.users?.email}</p>
            </div>
            <div className="flex items-center gap-2">{a.users && <><RoleBadge role={a.users.role} /><ActiveBadge active={a.users.is_active} /></>}</div>
            <div className="flex gap-1">
              <Button variant="secondary" size="sm" onClick={() => setMoving(a)} aria-label={`Move ${a.users?.full_name} to another vessel`}><ArrowRightLeft className="size-3.5" aria-hidden /> Move</Button>
              <Button variant="secondary" size="sm" onClick={() => setRemoving(a)} aria-label={`Remove ${a.users?.full_name} from ${vessel.name}`}><UserMinus className="size-3.5" aria-hidden /> Remove</Button>
            </div>
          </li>)}
        </ul>}
    </div>
    <Modal open={!!moving} onClose={() => setMoving(null)} title={`Move ${moving?.users?.full_name}`} description="Search for the active vessel they should move to.">
      {moving && <MoveForm key={moving.id} assignment={moving} onClose={() => setMoving(null)} onMoved={refresh} />}
    </Modal>
    <ConfirmDialog open={!!removing} danger title={`Remove ${removing?.users?.full_name}?`}
      message={`They will lose access to ${vessel.name}. This is refused if it would strand active work orders.`}
      confirmLabel="Remove" onClose={() => setRemoving(null)} onConfirm={async () => {
        const generation = getSessionGeneration();
        await removeAssignment(removing!.id);
        if (getSessionGeneration() !== generation) return;
        toast.success('Removed from the vessel.'); refresh();
      }} />
  </>;
}

function MoveForm({ assignment, onClose, onMoved }: { assignment: AssignmentWithUser; onClose: () => void; onMoved: () => void }) {
  const toast = useToast();
  const [target, setTarget] = useState<VesselOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!target) { setError('Choose the vessel to move them to.'); return; }
    const generation = getSessionGeneration();
    setBusy(true); setError(null);
    try {
      await moveAssignment(assignment.id, target.id);
      if (getSessionGeneration() !== generation) return;
      toast.success(`${assignment.users?.full_name} was moved.`);
      onMoved(); onClose();
    } catch (e) {
      if (getSessionGeneration() === generation) setError(errorMessage(e));
    } finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <fieldset disabled={busy} className="min-w-0"><VesselPicker value={target} onChange={setTarget} activeOnly excludeId={assignment.vessel_id} /></fieldset>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <div className="flex justify-end gap-2">
      <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
      <Button loading={busy} disabled={!target} onClick={() => void submit()}>Move</Button>
    </div>
  </div>;
}
