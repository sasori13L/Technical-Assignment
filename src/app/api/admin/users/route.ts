import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerSupabase, getSupabaseAdmin } from '@/lib/supabase/server';
import { userSchema } from '@/lib/validation';

const updateSchema = z.object({
  id: z.uuid(),
  patch: userSchema.partial().extend({ is_active: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0),
});

const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status });

async function adminRequest() {
  const supabase = await getServerSupabase();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return null;
  const { data: profile } = await supabase.from('users').select('id, role, is_active').eq('auth_user_id', auth.user.id).maybeSingle();
  return profile?.role === 'Admin' && profile.is_active ? { supabase, profile } : null;
}

export async function POST(request: NextRequest) {
  const actor = await adminRequest();
  if (!actor) return reply({ error: 'Administrator access is required.' }, 403);
  const parsed = userSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: 'Enter a valid name, email and role.' }, 400);

  const input = parsed.data;
  const { data: existing } = await actor.supabase.from('users').select('*').ilike('email', input.email).maybeSingle();
  if (existing?.auth_user_id) return reply({ error: 'A login already exists for this email.' }, 409);

  const admin = getSupabaseAdmin();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: `${siteUrl.replace(/\/$/, '')}/auth/callback?next=/update-password`,
    data: { full_name: input.full_name },
  });
  if (inviteError || !invited.user) return reply({ error: inviteError?.message ?? 'Could not invite the user.' }, 400);

  const profileRequest = existing
    ? admin.from('users').select().eq('id', existing.id).single()
    : admin.from('users').insert({ ...input, auth_user_id: invited.user.id, is_active: true }).select().single();
  const { data: profile, error: profileError } = await profileRequest;
  if (profileError) {
    await admin.auth.admin.deleteUser(invited.user.id);
    return reply({ error: profileError.message }, 400);
  }
  return reply({ user: profile }, 201);
}

export async function PATCH(request: NextRequest) {
  const actor = await adminRequest();
  if (!actor) return reply({ error: 'Administrator access is required.' }, 403);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: 'Invalid user update.' }, 400);

  const { id, patch } = parsed.data;
  const { data: before } = await actor.supabase.from('users').select('*').eq('id', id).maybeSingle();
  if (!before) return reply({ error: 'User not found.' }, 404);

  const ownAccount = before.id === actor.profile.id;
  if (ownAccount && (patch.role && patch.role !== before.role || patch.is_active === false)) {
    return reply({ error: 'You cannot change your own role or deactivate your own account.' }, 400);
  }

  const admin = getSupabaseAdmin();
  const authChanges: { email?: string; email_confirm?: boolean; ban_duration?: string } = {};
  if (patch.email && patch.email !== before.email) {
    authChanges.email = patch.email;
    authChanges.email_confirm = true;
  }
  if (patch.is_active !== undefined && patch.is_active !== before.is_active) {
    authChanges.ban_duration = patch.is_active ? 'none' : '876000h';
  }

  if (before.auth_user_id && Object.keys(authChanges).length) {
    const { error } = await admin.auth.admin.updateUserById(before.auth_user_id, authChanges);
    if (error) return reply({ error: error.message }, 400);
  }

  const { data: updated, error: updateError } = await actor.supabase.from('users').update(patch).eq('id', id).select().maybeSingle();
  if (updateError || !updated) {
    if (before.auth_user_id && Object.keys(authChanges).length) {
      await admin.auth.admin.updateUserById(before.auth_user_id, {
        ...(authChanges.email ? { email: before.email, email_confirm: true } : {}),
        ...(authChanges.ban_duration ? { ban_duration: before.is_active ? 'none' : '876000h' } : {}),
      });
    }
    return reply({ error: updateError?.message ?? 'User not found.' }, 400);
  }
  return reply({ user: updated });
}
