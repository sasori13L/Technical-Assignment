import { RoleGate } from '@/components/layout/RoleGate';
import { VesselsPanel } from '@/components/admin/VesselsPanel';

export default function VesselsPage() {
  return <RoleGate allow={['Admin']}><VesselsPanel /></RoleGate>;
}
