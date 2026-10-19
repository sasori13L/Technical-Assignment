import { z } from 'zod';
import { ROLES, VESSEL_TYPES } from '@/lib/types';

// These mirror the CHECK constraints in supabase/schema.sql. The database stays
// the source of truth; this just gives instant feedback before a round trip.

const collapse = (s: string) => s.trim().replace(/\s+/g, ' ');

export const userSchema = z.object({
  full_name: z.string().transform(collapse).pipe(
    z.string().min(2, 'Enter the full name (at least 2 characters).').max(100, 'Name is too long.')),
  email: z.string().trim().toLowerCase().pipe(
    z.string().max(254, 'Email is too long.').regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Enter a valid email address.')),
  role: z.enum(ROLES, { error: 'Choose a role.' }),
});
export type UserInput = z.infer<typeof userSchema>;

export const vesselSchema = z.object({
  name: z.string().transform(collapse).pipe(
    z.string().min(2, 'Enter the vessel name (at least 2 characters).').max(100, 'Name is too long.')),
  imo_number: z.string().trim().regex(/^[0-9]{7}$/, 'IMO number must be exactly 7 digits.'),
  vessel_type: z.enum(VESSEL_TYPES, { error: 'Choose a vessel type.' }),
});
export type VesselInput = z.infer<typeof vesselSchema>;

export const workOrderSchema = z.object({
  title: z.string().trim().min(3, 'Title needs at least 3 characters.').max(150, 'Title is too long (150 max).'),
  issue: z.string().trim().min(5, 'Describe the issue (at least 5 characters).').max(4000, 'Issue is too long.'),
  assigned_to: z.string().min(1, 'Choose a crew member.'),
});
export type WorkOrderInput = z.infer<typeof workOrderSchema>;

export const solutionSchema = z.string().trim()
  .min(1, 'Document the solution before marking the work order Done.')
  .max(4000, 'Solution is too long.');

export const rejectionSchema = z.string().trim()
  .min(3, 'A rejection reason is required (at least 3 characters).')
  .max(1000, 'Reason is too long.');

/** Flatten zod issues into { field: message } for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
