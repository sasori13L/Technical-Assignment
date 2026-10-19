import { RoleGate } from '@/components/layout/RoleGate';
import { UsersPanel } from '@/components/admin/UsersPanel';

export default function UsersPage() {
  return <RoleGate allow={['Admin']}><UsersPanel /></RoleGate>;
}
