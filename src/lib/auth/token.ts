/**
 * Holds the mock session's JWT for the browser Supabase client.
 *
 * Selecting a member in the utility bar calls setActiveUser(). The next request
 * fetches a short-lived token from /api/session (signed server-side) and every
 * Supabase call after that carries it, so RLS sees the selected user.
 */

interface CachedToken {
  userId: string;
  token: string;
  expiresAt: number;
}

const REFRESH_MARGIN_MS = 60_000;

let activeUserId: string | null = null;
let generation = 0;
let cached: CachedToken | null = null;
let inflight: { userId: string; promise: Promise<CachedToken> } | null = null;

export function setActiveUser(userId: string | null) {
  generation++;
  activeUserId = userId;
  cached = null;
  inflight = null;
}

async function fetchToken(userId: string): Promise<CachedToken> {
  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; expiresAt?: number; error?: string };
  if (!res.ok || !body.token || !body.expiresAt) {
    throw new Error(body.error ?? 'Could not start a session for this user.');
  }
  return { userId, token: body.token, expiresAt: body.expiresAt };
}

/** Returns a valid token for the active user, or null when nobody is selected. */
export async function getAccessToken(): Promise<string | null> {
  const userId = activeUserId;
  const requestGeneration = generation;
  if (!userId) return null;

  if (cached && cached.userId === userId && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return cached.token;
  }
  if (!inflight || inflight.userId !== userId) {
    const promise = fetchToken(userId);
    inflight = { userId, promise };
    promise.then(
      (t) => { if (generation === requestGeneration) cached = t; },
      () => undefined,
    ).finally(() => { if (inflight?.promise === promise) inflight = null; });
  }
  const result = await inflight.promise;
  if (generation !== requestGeneration) {
    throw new Error('The active session changed. Please retry from the current account.');
  }
  return result.token;
}

/** Async UI callbacks must not report an old account's write in a new session. */
export const getSessionGeneration = () => generation;
