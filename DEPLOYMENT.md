# Deployment guide

FleetOps uses Supabase Auth, Postgres RLS, and Vercel. Authentication credentials are owned by Supabase Auth; application roles and vessel assignments remain in `public.users` and related tables.

## 1. Create or migrate the database

For a fresh Supabase project, run:

1. `supabase/schema.sql`
2. `supabase/seed.sql`

For an existing deployment that already has the mock-auth schema, apply:

```text
supabase/migrations/20261023000000_supabase_auth.sql
```

The migration adds `public.users.auth_user_id`, changes identity resolution to `auth.uid()`, installs the Auth-profile linking trigger, and removes the anonymous switcher RPCs.

## 2. Configure Supabase Auth

In Authentication settings:

1. Enable Email/Password authentication.
2. Set the Site URL to the production application URL.
3. Add `http://localhost:3000/**` for local development.
4. Add the exact production callback URL and any approved Vercel preview pattern.
5. Configure production SMTP and review invitation, confirmation, and recovery templates.
6. Disable public sign-up if accounts should be invitation-only.

Invite an existing seeded Admin email from the Supabase Auth dashboard. The `auth.users` trigger links a new Auth account to the existing profile when their normalized emails match. After that administrator signs in, new users can be invited from FleetOps.

Recommended confirmation-link template target:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=/update-password
```

Use Supabase's current template variables for the selected email flow; verify invitation and recovery links in a staging project before production.

## 3. Environment variables

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-PUBLISHABLE-OR-ANON-KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVER-ONLY-SERVICE-ROLE-KEY
```

The anon/publishable key is intentionally available to the browser and is constrained by grants and RLS. `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and must remain server-only. Never commit it, expose it through a `NEXT_PUBLIC_` variable, place it in screenshots, or use it in browser code.

The service role is used only by the authenticated admin API to invite, ban, unban, and synchronize Auth users. Ordinary application reads and writes use the signed-in user's session.

## 4. Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000/login` and sign in with the invited administrator. Verify password recovery, sign-out, vessel selection, and all three role workflows with dedicated test accounts.

## 5. Deploy to Vercel

1. Import the repository into Vercel.
2. Add all four environment variables to Production.
3. Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS production URL.
4. Deploy.
5. Confirm the same URL is configured as the Supabase Auth Site URL and an allowed redirect URL.

Schema changes are not automatically applied by a Vercel deployment. Apply the migration before deploying code that depends on it.

## 6. Verify production

Use a dedicated, least-privileged test account:

```bash
node scripts/verify-deployment.mjs \
  --app https://YOUR-APP.vercel.app \
  --supabase https://YOUR-PROJECT-REF.supabase.co \
  --anon YOUR-PUBLISHABLE-OR-ANON-KEY \
  --email TEST-ACCOUNT@example.com \
  --password TEST-ACCOUNT-PASSWORD
```

The script verifies protected-route redirection, login availability, anonymous denial, real Auth sign-in, profile mapping, and authenticated RLS reads. Never use a human user's credentials in CI.

Manually verify:

- Invited users can choose a password and sign in.
- Recovery links reach `/update-password`.
- A captain sees only assigned vessels and can create/review work.
- Crew see only their assigned work.
- Admins can invite, update, deactivate, and reactivate users.
- Deactivation blocks application access and bans the Auth account.
- Signing out clears protected UI state and returns to `/login`.

## 7. Secret rotation and recovery

If the service-role key is exposed, rotate it immediately in Supabase, update Vercel, and redeploy. Review Auth and database logs for misuse.

Database backups do not replace Auth and configuration recovery planning. Periodically test database restoration and document how Auth settings, redirect URLs, SMTP, and environment variables are recreated.
