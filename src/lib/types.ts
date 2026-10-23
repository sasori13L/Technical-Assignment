export const ROLES = ['Admin', 'Captain', 'Crew'] as const;
export type UserRole = (typeof ROLES)[number];

export const STATUSES = ['Open', 'In Progress', 'Done'] as const;
export type WorkOrderStatus = (typeof STATUSES)[number];

export const VESSEL_TYPES = ['Cargo', 'Container', 'Tanker', 'Passenger', 'Tug', 'Fishing', 'Other'] as const;
export type VesselType = (typeof VESSEL_TYPES)[number];

export interface AppUser {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface Vessel {
  id: string;
  name: string;
  imo_number: string;
  vessel_type: VesselType;
  is_active: boolean;
  created_at: string;
}

export interface WorkOrder {
  id: number;
  code: string;
  vessel_id: string;
  title: string;
  issue: string;
  solution: string | null;
  status: WorkOrderStatus;
  assigned_to: string;
  created_by: string;
  rejection_reason: string | null;
  attested_by: string | null;
  attested_at: string | null;
  created_at: string;
  updated_at: string;
}

type Named = { full_name: string } | null;

/** A work order joined with the names the UI needs. */
export interface WorkOrderRow extends WorkOrder {
  assignee: Named;
  creator: Named;
  attester: Named;
  vessel: { name: string } | null;
}

export type WorkOrderEventType =
  | 'created' | 'edited' | 'reassigned' | 'started'
  | 'solution_saved' | 'submitted' | 'attested' | 'rejected';

export interface WorkOrderEvent {
  id: number;
  work_order_id: number;
  actor_id: string | null;
  event_type: WorkOrderEventType;
  from_status: WorkOrderStatus | null;
  to_status: WorkOrderStatus | null;
  comment: string | null;
  created_at: string;
  actor: Named;
}

/** Compact user shape consumed by role-aware work-order components. */
export interface SessionVessel {
  id: string;
  name: string;
  vessel_type: VesselType;
}

export type SwitcherVessel = SessionVessel;

export interface SwitcherMember {
  id: string;
  full_name: string;
  role: UserRole;
}

export interface UserWithVessels extends AppUser {
  vessel_assignments: { id: string; vessel_id: string; vessels: { id: string; name: string } | null }[];
}

export interface VesselWithCounts extends Vessel {
  vessel_assignments: { count: number }[];
}

export interface AssignmentWithUser {
  id: string;
  vessel_id: string;
  user_id: string;
  users: Pick<AppUser, 'id' | 'full_name' | 'email' | 'role' | 'is_active'> | null;
}

export interface Page<T> {
  rows: T[];
  total: number;
}
