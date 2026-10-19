import type { PostgrestError } from '@supabase/supabase-js';

/** An error whose message is safe and useful to show to the user. */
export class ServiceError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'ServiceError';
  }
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  users_email_lower_key: 'A user with this email already exists.',
  users_email_format: 'Enter a valid email address.',
  users_full_name_len: 'Name must be between 2 and 100 characters.',
  vessels_name_lower_key: 'A vessel with this name already exists.',
  vessels_imo_number_key: 'A vessel with this IMO number already exists.',
  vessels_imo_format: 'IMO number must be exactly 7 digits.',
  vessels_name_len: 'Vessel name must be between 2 and 100 characters.',
  vessels_type_valid: 'Choose a valid vessel type.',
  vessel_assignments_user_vessel_key: 'This user is already assigned to that vessel.',
  work_orders_title_len: 'Title must be between 3 and 150 characters.',
  work_orders_issue_len: 'Issue must be between 5 and 4000 characters.',
  work_orders_done_has_solution: 'Document the solution before marking the work order Done.',
};

/** Turn a PostgREST/Postgres error into something a person can act on. */
export function toServiceError(error: PostgrestError): ServiceError {
  const text = `${error.message} ${error.details ?? ''}`;
  for (const [constraint, message] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (text.includes(constraint)) return new ServiceError(message, error.code);
  }
  if (error.code === '42501' || /row-level security|permission denied/i.test(error.message)) {
    // 42501 is also what our own triggers raise, with a readable message.
    const readable = error.code === '42501' && !/row-level security|permission denied/i.test(error.message);
    return new ServiceError(
      readable ? error.message : 'You do not have permission to do that.', error.code);
  }
  return new ServiceError(error.message, error.code);
}

export function unwrap<T>(result: { data: T | null; error: PostgrestError | null }): T {
  if (result.error) throw toServiceError(result.error);
  return result.data as T;
}

/** For single-row writes: RLS silently filters rows you cannot touch, so "no row" is an error. */
export function unwrapRow<T>(
  result: { data: T | null; error: PostgrestError | null },
  missing = 'This record was not found, was changed by someone else, or you do not have permission to change it.',
): T {
  const data = unwrap(result);
  if (data == null) throw new ServiceError(missing);
  return data;
}

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong. Please try again.';
