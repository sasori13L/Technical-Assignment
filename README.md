# FleetOps

FleetOps is a small marine work order dashboard built with Next.js, TypeScript, and Supabase. It keeps work orders tied to a vessel and gives admins, captains, and crew members different views and actions.

- Live app: [marine-work-order-ms.vercel.app](https://marine-work-order-ms.vercel.app/)
- Repository: [github.com/sasori13L/Technical-Assignment](https://github.com/sasori13L/Technical-Assignment)
- Database schema: [`supabase/schema.sql`](supabase/schema.sql)
- Demo data: [`supabase/seed.sql`](supabase/seed.sql)
- Deployment guide: [`DEPLOYMENT.md`](DEPLOYMENT.md)

## Authentication and demo accounts

FleetOps uses Supabase Auth with email/password sessions. An administrator invites each user, and the invitation lets the user choose their password. After signing in, the sticky bar shows the real application profile and lets users choose among the active vessels they are authorized to access.

The seed creates the following application profiles. Invite the desired email from Supabase Auth or from the Users screen to create and link its login:

| Vessel | Role | Member | What to try |
| --- | --- | --- | --- |
| MV Pacific Dawn | Captain | Rafael Mendoza | Create a work order, assign crew, then attest or reject completed work. |
| MV Pacific Dawn | Crew | Liza Tan | Start assigned work, add a solution, and submit it as Done. |
| MV Pacific Dawn | Crew | Noel Bautista | View open, submitted, and attested work orders. |
| Any vessel | Admin | Daniel Okoye | Manage users, vessels, roles, and vessel assignments. |

## Main features

### Admin

- Create, view, update, and deactivate users and vessels.
- Assign roles and add, update, or remove vessel assignments.
- Keep deactivated records instead of deleting their history.
- Prevent duplicate emails, vessel names, and IMO numbers.
- Block changes that would leave active work without an assigned crew member or captain.
- View work orders for one vessel or all vessels.

### Captain

- View work orders for assigned vessels.
- Create a work order and assign it to active crew on the same vessel.
- Review work marked Done.
- Attest completed work or reject it with a required reason.

### Crew

- View only assigned work orders.
- Move an order from Open to In Progress.
- Record the solution and mark the order Done.
- See a captain's rejection reason and resubmit the work.

## Work order lifecycle

The database uses only the three statuses required by the brief: `Open`, `In Progress`, and `Done`.

```text
Open -> In Progress -> Done -> Attested and locked
           ^             |
           +-- Rejected -+
```

Attested is not a separate status. It is recorded with `attested_at` and `attested_by`. When a captain rejects an order, it returns to `In Progress` and the reason is saved in the work order history.

Every work order includes:

- Work order ID
- Title
- Issue
- Solution, required before marking the order Done
- Status
- Vessel, creator, and assigned crew member

## Entity relationship diagram

```mermaid
erDiagram
    AUTH_USERS ||--o| USERS : authenticates
    USERS ||--o{ VESSEL_ASSIGNMENTS : has
    VESSELS ||--o{ VESSEL_ASSIGNMENTS : has
    VESSELS ||--o{ WORK_ORDERS : contains
    USERS ||--o{ WORK_ORDERS : creates
    USERS ||--o{ WORK_ORDERS : receives
    USERS |o--o{ WORK_ORDERS : attests
    WORK_ORDERS ||--o{ WORK_ORDER_EVENTS : records
    USERS |o--o{ WORK_ORDER_EVENTS : performs

    USERS {
        uuid id PK
        uuid auth_user_id FK
        text full_name
        text email UK
        user_role role
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    VESSELS {
        uuid id PK
        text name UK
        text imo_number UK
        text vessel_type
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    VESSEL_ASSIGNMENTS {
        uuid id PK
        uuid vessel_id FK
        uuid user_id FK
        timestamptz created_at
    }

    WORK_ORDERS {
        bigint id PK
        text code
        uuid vessel_id FK
        text title
        text issue
        text solution
        work_order_status status
        uuid assigned_to FK
        uuid created_by FK
        text rejection_reason
        uuid attested_by FK
        timestamptz attested_at
        timestamptz created_at
        timestamptz updated_at
    }

    WORK_ORDER_EVENTS {
        bigint id PK
        bigint work_order_id FK
        uuid actor_id FK
        work_order_event_type event_type
        work_order_status from_status
        work_order_status to_status
        text comment
        timestamptz created_at
    }
```

The complete table definitions, constraints, indexes, triggers, grants, and RLS policies are in [`supabase/schema.sql`](supabase/schema.sql).

## Security and data rules

Most data fetching and updates happen in the browser through the cookie-aware Supabase client. Supabase Auth issues and refreshes sessions; `public.users.auth_user_id` maps `auth.uid()` to the stable domain user referenced by work orders and audit history. The server-only admin route uses the service role solely for Auth invitations and account administration.

Supabase Row Level Security uses the verified Auth identity to enforce access:

| Role | Access |
| --- | --- |
| Admin | Manage users, vessels, roles, and assignments. Work orders are read-only. |
| Captain | Read and manage work orders for assigned vessels. |
| Crew | Read and update only work orders assigned to them. |

Database constraints and triggers also enforce the status flow, required solutions and rejection reasons, valid vessel assignments, duplicate prevention, and deactivation rules. The `work_order_events` table keeps an append-only history of work order changes.

The anon key cannot read application tables. Deactivating a profile also bans its linked Auth account; historical references remain intact.

Lists are paginated and cached, and the main database access paths are indexed. The interface uses tables on larger screens and cards on smaller screens so the same workflows remain usable on desktop, tablet, and mobile.

## Tech stack

- Next.js 16 with the App Router
- TypeScript
- Supabase Postgres and Row Level Security
- TanStack Query
- Tailwind CSS
- Zod
- `@supabase/ssr` for cookie-based browser and server sessions

## Run locally

Requirements:

- Node.js 20.9 or newer
- A Supabase project

### 1. Set up the database

Run these files in the Supabase SQL editor, in order:

1. `supabase/schema.sql`
2. `supabase/seed.sql`

The scripts are intended for a fresh project.

### 2. Add environment variables

Copy `.env.example` to `.env.local` and add:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVER_ONLY_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must never use the `NEXT_PUBLIC_` prefix. It is used only by the protected admin invitation endpoint.

In Supabase Auth URL Configuration, set the Site URL and allow `http://localhost:3000/**`. Invite at least one seeded Admin email from the Supabase Auth dashboard; the database trigger links the new Auth user to the matching profile automatically. For an existing mock-auth deployment, apply `supabase/migrations/20261023000000_supabase_auth.sql` first.

### 3. Install and start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available scripts

```bash
npm run dev        # local development
npm run lint       # ESLint
npm run typecheck  # TypeScript checks
npm test           # regression tests
npm run build      # production build
npm start          # run the production build
```

For a fuller manual checklist, see [`test-cases.md`](test-cases.md). The deployment smoke test is also available:

```bash
node scripts/verify-deployment.mjs \
  --app <app-url> \
  --supabase <project-url> \
  --anon <anon-key> \
  --email <test-account> \
  --password <test-password>
```

## Project structure

```text
src/
  app/            pages and the demo session route
  components/     dashboard, admin, session, and shared UI
  services/       Supabase queries and mutations
  lib/            types, validation, formatting, and auth helpers
supabase/
  schema.sql      tables, indexes, triggers, RLS, and grants
  seed.sql        demo users, vessels, assignments, and work orders
scripts/          deployment smoke test
tests/            application regression tests
```

## Deployment

The app is deployed on Vercel. To deploy another copy, import the repository and add the four environment variables used locally. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the full setup and migration notes.
