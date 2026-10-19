import { Suspense } from 'react';
import { RoleGate } from '@/components/layout/RoleGate';
import { AssignmentsPanel } from '@/components/admin/AssignmentsPanel';

export default function AssignmentsPage() {
  return (
    <RoleGate allow={['Admin']}>
      <Suspense fallback={null}><AssignmentsPanel /></Suspense>
    </RoleGate>
  );
}
