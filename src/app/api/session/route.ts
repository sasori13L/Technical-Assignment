import { createClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Mints a short-lived Supabase-compatible JWT for the mock user picked in the
// utility bar. The browser Supabase client sends it, and the RLS policies read
// its app_user_id claim. This is mock auth: anyone can ask for any ACTIVE user.
// The point is that the database, not the UI, enforces what each user may do.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_TTL_SECONDS = 60 * 60;
const bodySchema = z.object({ userId: z.uuid() });

const reply = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!url || !anonKey || !jwtSecret) {
    return reply({ error: 'The server is missing its Supabase configuration.' }, 500);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: 'A valid userId is required.' }, 400);
  const { userId } = parsed.data;

  // Confirm the user exists and is active through the same anon-callable RPC the
  // dropdowns use, so this route needs no service-role key.
  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc('switcher_user', { p_user_id: userId });
  if (error) return reply({ error: 'Could not verify the user. Please try again.' }, 502);
  const user = (data as { id: string; full_name: string; role: string }[] | null)?.[0];
  if (!user) return reply({ error: 'That user does not exist or is inactive.' }, 404);

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + TOKEN_TTL_SECONDS;
  // Optional: only needed if the project signs with a custom HS256 key instead of the legacy secret.
  const kid = process.env.SUPABASE_JWT_KID;
  const token = await new SignJWT({ role: 'authenticated', app_user_id: user.id })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT', ...(kid ? { kid } : {}) })
    .setSubject(user.id)
    .setAudience('authenticated')
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(jwtSecret));

  return reply({ token, expiresAt: expiresAt * 1000, user });
}
