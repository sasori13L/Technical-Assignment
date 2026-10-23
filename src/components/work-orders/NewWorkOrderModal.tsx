'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { listVesselCrew } from '@/services/assignments';
import { createWorkOrder } from '@/services/workOrders';
import { WorkOrderForm } from './WorkOrderForm';
import { getSessionGeneration } from '@/lib/auth/session';

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  vesselId: string;
  vesselName: string;
}

export function NewWorkOrderModal({ open, onClose, userId, vesselId, vesselName }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const crew = useQuery({
    queryKey: ['vessel-crew', userId, vesselId],
    queryFn: () => listVesselCrew(vesselId),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: async ({ values }: { values: Parameters<typeof createWorkOrder>[1]; generation: number }) => createWorkOrder(vesselId, values),
    onSuccess: (wo, variables) => {
      if (variables.generation !== getSessionGeneration()) return;
      void queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['wo-stats'] });
      toast.success(`${wo.code} created and assigned.`);
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="New work order" description={`For ${vesselName}. It starts as Open.`}>
      {open && (
        <WorkOrderForm crew={crew.data ?? []} submitLabel="Create work order"
          onSubmit={(values) => create.mutateAsync({ values, generation: getSessionGeneration() })} onCancel={onClose} />
      )}
    </Modal>
  );
}
