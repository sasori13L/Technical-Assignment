# Implementation Plan: Marine Work Order Management System

Stack: Next.js (App Router) + TypeScript + Supabase (Postgres, RLS) + Tailwind, deployed on Vercel.

## Phase outline

| Phase | Name |
|---|---|
| 0 | Requirements and key decisions |
| 1 | Database schema |
| 2 | Security: JWT claims, RLS, grants |
| 3 | Business rules in triggers |
| 4 | Seed data and database test suite |
| 5 | App scaffold and shared UI |
| 6 | Mock auth and the utility bar |
| 7 | Service layer (browser Supabase client) |
| 8 | Work order lifecycle UI |
| 9 | Admin dashboard |
| 10 | Verification |
| 11 | Documentation (README, ERD, notes) |
| 12 | Deployment |
| 13 | Submission |

## Phase 0: Requirements and key decisions

Goal: turn the assignment into rules the code can enforce.

Decisions made:
1. **JWT claim approach for RLS.** There is no Supabase Auth. A small route handler signs a short-lived JWT for the selected mock user (`role: authenticated`, `app_user_id`), and the browser client sends it. Policies read the user from the token.
2. **Rules live in the database.** Status flow, deactivation guards and duplicate checks are triggers and constraints, so they hold even if the UI is bypassed.
3. **Statuses stay strictly `Open`, `In Progress`, `Done`.** "Attested" is a flag on a Done order (`attested_at`, `attested_by`). A rejection moves the order back to In Progress with a reason. Full history goes to an append-only events table.
4. **Admins are global and read-only on work orders.** They manage users, vessels and assignments. Captains and Crew only see vessels they are assigned to. Crew see only their own orders.
5. **Users and vessels are deactivated, never deleted.**
6. **The browser client does all data access.** The server route only issues tokens.

Assumptions to list in the README:
- "Available crew under their command" means active Crew assigned to the same vessel.
- An order is "active" until a captain attests it.
- Admin members appear under every vessel in the dropdown, because admins are not tied to one vessel.
- The token endpoint is open by design (mock auth). A real build would use Supabase Auth and swap one helper function.

## Phase 1: Database schema

Files: `supabase/schema.sql` (sections 1 to 4).

Tasks:
- Enums: `user_role`, `work_order_status`, `work_order_event_type`.
- Tables: `users`, `vessels`, `vessel_assignments`, `work_orders`, `work_order_events`.
- Constraints: length and format checks, `Done` requires a solution, attested requires Done, `attested_at` and `attested_by` set together.
- Duplicate prevention: unique on `lower(email)`, `lower(name)` and `imo_number`, plus a unique `(user_id, vessel_id)` assignment.
- Indexes for the real query paths: vessel plus created date, vessel plus status, assignee, partial index on unattested orders, trigram indexes for title and code search.

Acceptance criterion: the schema loads on a clean database with no errors.

## Phase 2: Security

Files: `supabase/schema.sql` (sections 2, 5, 7, 8, 9).

Tasks:
- Identity helpers read `request.jwt.claims` (`app_user_id()`, `app_is_client()`).
- Set-returning helpers (`my_vessel_ids()`, `my_captain_vessel_ids()`, `my_colleague_ids()`) so policies are evaluated once per query, not once per row.
- RLS on every table, no delete policies anywhere.
- Least-privilege grants, including column-level insert and update grants, so a client can never set ids, timestamps, `created_by` or `attested_by`.
- Three anon-callable switcher RPCs that return only ids, names and roles of active records. The anon role has no table access.

Acceptance criteria: anon cannot read tables, each role sees only its own scope, and malformed or missing claims see nothing.

## Phase 3: Business rules in triggers

Tasks:
- Work order insert: only a captain on that vessel, forced to `Open`, assignee must be active Crew on that vessel.
- Work order update, by role:
  - Crew: Open to In Progress, save solution, In Progress to Done (solution required).
  - Captain: attest, or reject with a mandatory reason, or edit title, issue and assignee while not Done.
  - Admin: read-only.
  - Attested orders are locked.
- Audit trigger writes `work_order_events` automatically.
- Deactivation and role-change guards: block if a crew member still owns active orders, if a captain is the only active captain on a vessel with active orders, if it would remove the last admin, or if an admin targets their own account.
- Vessel guards: cannot deactivate a vessel with active orders. Assignments cannot be removed or moved if that strands active work.
- Input normalisation: trimmed names, lower-cased emails.

Acceptance criterion: every rule above is covered by an automated test.

## Phase 4: Seed data and database tests

Files: `supabase/seed.sql`, local test harness (not shipped).

Tasks:
- 4 vessels (one inactive), 2 admins, 4 captains, 9 crew (one inactive, one on two vessels, one relief captain).
- Demo orders created by replaying the real lifecycle as the real users, so triggers and the event log run. Then about 240 bulk orders in mixed states for pagination.
- Prepare a local Postgres plus PostgREST test harness using Supabase-like roles, covering anon, Crew, Captain, and Admin behavior.
- Run a large-data load test under RLS to evaluate paginated reads and exact counts.

## Phase 5: App scaffold and shared UI

Tasks:
- Next 16, React 19, Tailwind 4, TanStack Query, zod, jose, supabase-js.
- Config: `tsconfig`, `next.config` with security headers, ESLint, `.env.example`.
- UI primitives: Button, Field, Modal (native dialog), ConfirmDialog, Toast, Badges, Pagination, empty, error and skeleton states.

Folder layout:
```
src/app            routes, layout, /api/session
src/components     layout, session, ui, work-orders, admin
src/services       one file per table, all Supabase calls
src/lib            types, validation, errors, format, auth/token, supabase client
supabase/          schema.sql, seed.sql
```

## Phase 6: Mock auth and the utility bar

Tasks:
- `/api/session`: validates the user through the anon RPC, signs an HS256 token with `jose` (1 hour), returns it. Needs only `SUPABASE_JWT_SECRET` on the server.
- `lib/auth/token.ts`: holds the active user, caches the token, refreshes before expiry.
- `lib/supabase/client.ts`: browser client whose `accessToken` callback supplies the token, falling back to the anon key.
- `SessionProvider`: dependent dropdowns (Vessel, then Role, then Member), auto-picks the first member, persists the choice, and on every switch clears cached queries so the UI never shows the previous user's data.
- `UtilityBar`: sticky, three labelled dropdowns, collapses to a one-line summary on phones.

Acceptance criterion: switching members changes the data and available actions immediately without a reload.

Verification checklist:
- Dropdown 1 lists active vessels, Dropdown 2 lists the three roles, Dropdown 3 lists only active members of that role on that vessel (admins on every vessel).
- Selecting a member switches the session and changes database results according to the selected role and vessel.
- Table requests carry the signed token, never the anon key. A tampered token is rejected. Exactly one token request per user switch.
- `/api/session` rejects bad input (400), unknown or inactive users (404) and non-POST requests (405), and sends `Cache-Control: no-store`.
- The selection survives a reload, and a corrupt stored selection falls back to defaults.
- Phone: the bar collapses to a one-line summary that expands. Tablet: dropdowns on their own row. Desktop: inline with the active user chip. No horizontal scroll.

Scope note: use a temporary session-check panel during this phase. Add the final work-order page, Admin routes, and navigation in later phases.

## Phase 7: Service layer

Tasks:
- `users`, `vessels`, `assignments`, `workOrders`, `switcher` services. Pagination with `range()` and exact counts.
- Search input is sanitised so user text cannot add filters to the PostgREST query.
- Every status change names the status it expects (optimistic concurrency), so a stale screen cannot overwrite a newer change.
- Database errors are mapped to plain messages (duplicate email, bad IMO, guard messages, permission).
- One `runPage` helper does every paginated, counted query. A page past the end (PostgREST answers 416) becomes an empty page with the real total, so the UI can step back instead of erroring.

Verification checklist using the real services, token route, Postgres, and PostgREST:
- Users, vessels, assignments, and work orders: list, sort, filters, pagination, embedded names with explicit foreign-key join hints, create, update, and deactivate.
- Scope per role: crew see only their own orders, captains only their vessel, and every refusal arrives as a readable message.
- Search safety: hostile text is neutralised; include a control case demonstrating that unsanitised text could alter filter behavior while sanitised text cannot.
- Stale-screen guard: starting, completing, attesting or rejecting from an outdated screen is refused with "changed by someone else", never overwriting a newer change.
- Full lifecycle (start, draft, complete, reject with reason, resubmit, attest, locked) and the audit trail with actors.
- Token behaviour: parallel requests share one token fetch, the token is cached, and an inactive user gets a clear error and recovers on the next valid user.

## Phase 8: Work order lifecycle UI

Build `WorkOrdersPage` with a role-aware header, a Captain-only "New work order" action, an Admin toggle between the selected vessel and all vessels, clickable statistics as status filters, debounced search, a Captain assignee filter, desktop tables, phone cards, pagination, and explicit empty, loading, and error states.

Browser verification should cover pagination, filters, hostile search text, validation, reassignment, the full work-order lifecycle, history, stale-screen conflicts, cross-vessel isolation, Admin read-only access, responsive layouts, and console errors.

Acceptance criteria by role:
- Captain creates an order, assigns it, and it starts Open.
- Crew start it, save a draft, mark it Done (blocked without a solution).
- Captain rejects (blocked without a reason) and the crew see the reason, resubmit, and the captain attests. The attested order is locked.

## Phase 9: Admin dashboard

Build `/admin/users`, `/admin/vessels`, and `/admin/assignments` behind `RoleGate`, with database policies remaining the final authority. Show Admin navigation only to Admin users.

1. **Users:** search, role and status filters, pagination. Create and edit modal, inline role change, deactivate and reactivate through a confirm dialog that keeps the database's refusal message on screen.
2. **Vessels:** same pattern, plus a people count that links to that vessel's roster.
3. **Assignments:** pick a vessel (deep-linkable with `?vessel=`), see the roster, add, move to another vessel, remove.
4. Every admin change invalidates the switcher, work-order, and admin queries so the utility-bar options update immediately.

Browser verification should cover validation, duplicate refusals, database guard messages, switcher refreshes after mutations, role gating, and responsive layouts. Re-run the work-order lifecycle checks after completing the Admin dashboard.

## Phase 10: Verification

Run the final verification gate on a clean build:

- Run `tsc --noEmit`, `eslint .`, and `next build`.
- Exercise database RLS, business guards, and the audit trail.
- Exercise the service layer against the local stack.
- Run browser coverage for the work-order lifecycle and Admin dashboard.
- Verify session switching, security boundaries, keyboard navigation, and responsive layouts.

Browser checks should cover dependent dropdowns, immediate switching without reloads, a distinct Bearer token per user on every data request, selection persistence, direct API probes, keyboard interaction, accessible names, focus management, and responsive behavior at phone, tablet, and desktop widths.

Keep environment-dependent database and browser harnesses outside the repository when they require a local Postgres and PostgREST stack. Document the verification scope in the README.

## Phase 11: Documentation

Prepare `README.md` with:
- What it is, demo walkthrough (which member to pick to see each flow, plus the refusals worth trying).
- A Mermaid ERD of the five tables and a Mermaid sequence diagram of the token and request path.
- How security works (JWT, RLS, column grants, triggers, anon role) and the business rules, including the lifecycle.
- Decisions, assumptions, and honest trade-offs (open token endpoint, public dropdown names, colleague emails within a vessel, legacy JWT secret, offset paging, no token revocation).
- Performance considerations, setup instructions (Supabase, `schema.sql`, `seed.sql`, environment variables, local run, Vercel), project structure, and the verification approach.
- Secret-handling guidance: track only `.env.example` and ignore `.env.local`.

After Phase 12, add the live URL and repository link at the top of the README.

### Short notes for the email (paste-ready)

> **Approach.** There is no Supabase Auth, since sign-in is the three dropdowns. A small Next.js route signs a short-lived JWT for the selected member, the browser Supabase client sends it, and Postgres RLS policies read the acting user from it. All data access is browser-side, as preferred.
>
> **Rules live in the database.** The status flow (Open, In Progress, Done), the "solution required" and "rejection reason required" rules, the deactivation guards and the duplicate checks are triggers and constraints, so they hold even if the UI is bypassed. Attested is a flag on a Done order, and a rejection sends it back to In Progress, so statuses stay exactly as specified. History is an append-only events table.
>
> **Assumptions.** "Available crew" means active crew on the same vessel. Admins are global and read-only on work orders. Users and vessels are deactivated, never deleted. Admins appear under every vessel in the dropdown.
>
> **Trade-offs.** The token endpoint is open because mock sign-in is the requirement. A real build would use Supabase Auth and change one helper function. The README should list the remaining trade-offs.
>
> **Verification plan.** Run database, service-layer, and browser checks against Postgres 16 with PostgREST locally. Cover RLS per role, refusal cases, the full lifecycle, keyboard use, and three screen widths, then repeat the deployment checks against the hosted Supabase project.

## Phase 12: Deployment

Write the step-by-step guide in `DEPLOYMENT.md`. Use `scripts/verify-deployment.mjs` to check the JWT secret, RLS, and refused writes against the Supabase project before deployment and again against the live URL. Support an optional `SUPABASE_JWT_KID` fallback if the project has no legacy JWT secret.


1. Create a Supabase project. Run `schema.sql`, then `seed.sql`.
2. Check the JWT secret. If the project only offers asymmetric signing keys, enable the legacy JWT secret. This is the main risk to confirm early.
3. Create the GitHub repo and push. Make it public.
4. Import to Vercel. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the server-only `SUPABASE_JWT_SECRET`.
5. Open the live URL in a private window with no login. Switch through Admin, Captain and Crew and run one action each.
6. Confirm RLS on the live database: as Crew, other vessels' orders are not visible.

## Phase 13: Submission

Checklist:
- Repository is public and includes code, ERD, and `supabase/schema.sql`.
- Live URL opens without a login, password, or invite.
- README includes assumptions and decisions.
- No secrets are committed (`.env` is ignored and only `.env.example` is tracked).
- Reply email includes both links and the implementation notes.

## Requirement traceability

| Requirement | Planned phase |
|---|---|
| Three dependent dropdowns, instant user switch | Phase 6 |
| Admin: users, roles, vessels, assignments | Phases 3 and 9 |
| Validation, duplicates, deactivation guards | Phases 1, 3, 9 |
| Work order fields and strict statuses | Phase 1 |
| Captain creates, Crew work, Captain attests or rejects with reason | Phases 3 and 8 |
| ERD in the repo | Phase 11 |
| Schema file | Phase 1 (`supabase/schema.sql`) |

| Evaluation criterion | Planned evidence |
|---|---|
| Logical correctness and reliability | Trigger-enforced flow, database checks, concurrency-safe updates |
| Code organisation | Folder layout in Phase 5, services separate from components |
| ERD and database security | RLS on all tables, column-level grants, anon limited to RPCs, sanitised search |
| UI/UX | Role-specific actions, clear refusal messages, empty and loading states |
| Responsiveness | Collapsing utility bar, table to card layout, Phase 10 screenshots |
| Performance and scalability | Targeted indexes, server-side pagination, once-per-query RLS helpers, and a large-data load test |
| Deployment | Phase 12 checks on the live URL |
