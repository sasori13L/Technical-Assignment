# Deployment guide

This guide deploys FleetOps with Supabase and Vercel. The finished submission should have:

- A public GitHub repository
- A working production URL that opens without a login
- The database schema in `supabase/schema.sql`
- The Entity Relationship Diagram (ERD) in `README.md`

## Before you start

You need:

- Node.js 20.9 or newer
- A Supabase account
- A GitHub account
- A Vercel account

Install the project dependencies:

```bash
npm install
```

## 1. Create the Supabase database

Create a new Supabase project, then open its SQL Editor.

Run these files in order:

1. `supabase/schema.sql`
2. `supabase/seed.sql`

The scripts are intended for a fresh project. The schema creates the tables, constraints, indexes, triggers, grants, and Row Level Security policies. The seed adds the demo vessels, users, assignments, and work orders used by the member switcher and deployment test.

After both scripts finish, confirm that these five tables exist and have RLS enabled:

- `users`
- `vessels`
- `vessel_assignments`
- `work_orders`
- `work_order_events`

## 2. Get the Supabase settings

Copy these values from the Supabase project settings:

| Setting | Environment variable | Notes |
| --- | --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | Looks like `https://project-ref.supabase.co`. |
| Publishable or legacy anon key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Safe to use in the browser. Never use a secret or `service_role` key here. |
| Legacy JWT secret | `SUPABASE_JWT_SECRET` | Server-only. Never commit or expose it. |

This project uses a mock member switcher instead of Supabase Auth. The `/api/session` route signs short-lived HS256 tokens with the legacy JWT secret so the database can apply the correct RLS policies.

Do not revoke or rotate away from the legacy JWT secret while this implementation depends on it. If your project does not provide an extractable legacy JWT secret, the session-signing implementation must be updated before deployment.

## 3. Test locally

Copy the example environment file:

```bash
cp .env.example .env.local
```

Add the three Supabase values to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-PUBLISHABLE-OR-ANON-KEY
SUPABASE_JWT_SECRET=YOUR-LEGACY-JWT-SECRET
```

Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The Vessel, Role, and Member dropdowns should load, and changing the member should update the dashboard and available actions.

In another terminal, run the deployment smoke test:

```bash
node scripts/verify-deployment.mjs \
  --app http://localhost:3000 \
  --supabase https://YOUR-PROJECT-REF.supabase.co \
  --anon YOUR-PUBLISHABLE-OR-ANON-KEY
```

Continue only after it prints `All checks passed.` The test confirms that:

- The app and session route respond.
- Inactive and unknown users cannot start a session.
- Anonymous access cannot read the main tables.
- Supabase accepts the signed session token.
- Captain and crew access stays within the correct vessel and assignment.
- Unauthorized writes and forged tokens are rejected.

## 4. Push the project to GitHub

Create a public GitHub repository and push the project to it.

Before committing, check the files Git will include:

```bash
git status
```

The repository should include `README.md`, `supabase/schema.sql`, `supabase/seed.sql`, and `.env.example`.

It must not include:

- `.env.local`
- `node_modules`
- `.next`
- Any JWT, database, or service-role secret

Open the repository in a private browser window to confirm that it is publicly accessible.

## 5. Deploy to Vercel

1. Import the GitHub repository into Vercel.
2. Keep the detected Next.js build settings.
3. Add the following environment variables to the Production environment:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable or legacy anon key |
   | `SUPABASE_JWT_SECRET` | Supabase legacy JWT secret |

4. Deploy the project.

`SUPABASE_JWT_SECRET` must not have the `NEXT_PUBLIC_` prefix. Variables with that prefix are included in browser code during the Next.js build.

If you change an environment variable later, redeploy the app so the new value is used.

The assignment requires a public live URL. Make sure Vercel Authentication or password protection is not blocking the production domain.

## 6. Verify the production deployment

Run the same smoke test with the production URL:

```bash
node scripts/verify-deployment.mjs \
  --app https://YOUR-APP.vercel.app \
  --supabase https://YOUR-PROJECT-REF.supabase.co \
  --anon YOUR-PUBLISHABLE-OR-ANON-KEY
```

Then open the production URL in a private browser window and check the main workflows:

- The app opens without a login or invite.
- The three dependent dropdowns load active vessels and members.
- A captain can create an Open order and assign crew from the same vessel.
- Crew only see their assigned orders and can move work from Open to In Progress, add a solution, and mark it Done.
- A captain can attest or reject Done work, with a required rejection reason.
- An admin can manage users, roles, vessels, and assignments.
- Users cannot see work orders from vessels they are not assigned to.
- The layout works on both desktop and mobile widths.

## 7. Finish the submission

Confirm that the links at the top of `README.md` point to the public repository and production deployment. Commit and push any final documentation changes, then verify that Vercel deploys the latest commit.

Your final submission should contain:

- Public GitHub repository URL
- Live production URL
- ERD in `README.md`
- Complete database schema in `supabase/schema.sql`

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Dropdowns are empty | Confirm the project URL and publishable/anon key, and make sure both SQL files completed successfully. |
| Session creation fails | Confirm all three environment variables exist and the selected user is active. Check the `/api/session` Vercel logs. |
| Data fails after selecting a member | Supabase may be rejecting the signed JWT. Recopy the legacy JWT secret, restart locally or redeploy, and run the smoke test again. |
| Works locally but not on Vercel | Check the Production environment variables and redeploy after any change. |
| Vercel asks the reviewer to sign in | Disable deployment authentication or password protection for the production domain. |
| Supabase returns permission errors | Recreate a fresh project and rerun `schema.sql` followed by `seed.sql`. |
| The site stops working after inactivity | Check whether the Supabase project is paused and restore it if needed. |

## Secret safety

The publishable or legacy anon key is designed for public clients and is restricted by grants and RLS. The JWT secret is different: anyone who has it can create trusted session tokens.

Never place `SUPABASE_JWT_SECRET` in source code, a screenshot, an email, or a committed environment file. If it is exposed, rotate or replace it immediately, update Vercel, and redeploy.
