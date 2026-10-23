-- =============================================================================
-- Marine Work Order Management System: database schema
-- Target: Supabase (PostgreSQL 15+). Run once in the SQL editor of a fresh
-- project, then run supabase/seed.sql for demo data.
--
-- Security model (see README for the full explanation)
--   * Supabase Auth owns credentials, sessions and token refresh.
--   * public.users.auth_user_id links Auth identities to stable domain ids.
--   * Every RLS policy resolves auth.uid() through public.app_user_id().
--   * The anon role has no application-table or application-RPC access.
--   * Business rules (status flow, deactivation guards, duplicates) live in
--     triggers, so they hold no matter which client writes the data.
--
-- Sections: 1 types, 2 identity helpers, 3 tables, 4 indexes, 5 helper
-- functions, 7 triggers, 8 RLS policies, 9 grants.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. Types
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('Admin', 'Captain', 'Crew');
create type public.work_order_status as enum ('Open', 'In Progress', 'Done');
create type public.work_order_event_type as enum (
  'created', 'edited', 'reassigned', 'started',
  'solution_saved', 'submitted', 'attested', 'rejected'
);

-- -----------------------------------------------------------------------------
-- 2. Identity helpers (read the claims PostgREST exposes for each request)
-- -----------------------------------------------------------------------------
create function public.app_claims()
returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

-- Temporary seed-compatible definition, replaced after public.users exists.
create function public.app_user_id()
returns uuid language sql stable as $$
  select case
    when (public.app_claims() ->> 'app_user_id')
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (public.app_claims() ->> 'app_user_id')::uuid
  end
$$;

-- True for requests coming through the API as anon/authenticated (or any
-- request acting as an app user). False for trusted contexts such as the SQL
-- editor or the service role, which is how seed data and migrations run.
create function public.app_is_client()
returns boolean language sql stable as $$
  select public.app_user_id() is not null
      or (public.app_claims() ->> 'role') in ('anon', 'authenticated')
$$;

-- -----------------------------------------------------------------------------
-- 3. Tables
-- -----------------------------------------------------------------------------
create table public.users (
  id          uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users (id) on delete restrict,
  full_name   text not null,
  email       text not null,
  role        public.user_role not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint users_full_name_len check (char_length(btrim(full_name)) between 2 and 100),
  constraint users_email_format  check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- Resolve the verified Auth subject to the stable application id. The legacy
-- claim fallback works only for trusted seed sessions that have no API role.
create or replace function public.app_user_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select u.id from public.users u
     where u.auth_user_id = (select auth.uid()) and u.is_active),
    case when public.app_claims() ->> 'role' is null
      and (public.app_claims() ->> 'app_user_id')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (public.app_claims() ->> 'app_user_id')::uuid
    end
  )
$$;

create table public.vessels (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  imo_number   text not null,
  vessel_type  text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint vessels_name_len    check (char_length(btrim(name)) between 2 and 100),
  constraint vessels_imo_format  check (imo_number ~ '^[0-9]{7}$'),
  constraint vessels_type_valid  check (vessel_type in
    ('Cargo', 'Container', 'Tanker', 'Passenger', 'Tug', 'Fishing', 'Other'))
);

-- Which Captains and Crew may work on which vessel. Admins are global and need no rows.
create table public.vessel_assignments (
  id          uuid primary key default gen_random_uuid(),
  vessel_id   uuid not null references public.vessels (id) on delete restrict,
  user_id     uuid not null references public.users (id) on delete restrict,
  created_at  timestamptz not null default now(),
  constraint vessel_assignments_user_vessel_key unique (user_id, vessel_id)
);

-- Statuses stay strictly Open / In Progress / Done. "Attested" is a flag on a
-- Done order (attested_at / attested_by), and a rejection sends the order back
-- to In Progress with a reason. Full history lives in work_order_events.
create table public.work_orders (
  id                bigint generated always as identity primary key,
  code              text generated always as ('WO-' || lpad(id::text, 5, '0')) stored,
  vessel_id         uuid not null references public.vessels (id) on delete restrict,
  title             text not null,
  issue             text not null,
  solution          text,
  status            public.work_order_status not null default 'Open',
  assigned_to       uuid not null references public.users (id) on delete restrict,
  created_by        uuid not null default public.app_user_id()
                      references public.users (id) on delete restrict,
  rejection_reason  text,
  attested_by       uuid references public.users (id) on delete restrict,
  attested_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint work_orders_title_len     check (char_length(btrim(title)) between 3 and 150),
  constraint work_orders_issue_len     check (char_length(btrim(issue)) between 5 and 4000),
  constraint work_orders_solution_len  check (solution is null or char_length(solution) <= 4000),
  constraint work_orders_done_has_solution
    check (status <> 'Done' or char_length(btrim(coalesce(solution, ''))) > 0),
  constraint work_orders_attested_is_done check (attested_at is null or status = 'Done'),
  constraint work_orders_attested_pair    check ((attested_at is null) = (attested_by is null))
);

create table public.work_order_events (
  id             bigint generated always as identity primary key,
  work_order_id  bigint not null references public.work_orders (id) on delete cascade,
  actor_id       uuid references public.users (id) on delete set null,
  event_type     public.work_order_event_type not null,
  from_status    public.work_order_status,
  to_status      public.work_order_status,
  comment        text,
  created_at     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4. Indexes
-- -----------------------------------------------------------------------------
-- Duplicate prevention
create unique index users_email_lower_key on public.users (lower(email));
create unique index users_auth_user_key on public.users (auth_user_id) where auth_user_id is not null;
create unique index vessels_name_lower_key on public.vessels (lower(name));
create unique index vessels_imo_number_key on public.vessels (imo_number);

-- Switcher and admin lists
create index users_role_active_idx on public.users (role) where is_active;
create index vessel_assignments_vessel_idx on public.vessel_assignments (vessel_id, user_id);

-- Work order lists: paginated by vessel / assignee, filtered by status
create index work_orders_vessel_created_idx  on public.work_orders (vessel_id, created_at desc, id desc);
create index work_orders_vessel_status_idx   on public.work_orders (vessel_id, status, created_at desc);
create index work_orders_assignee_created_idx on public.work_orders (assigned_to, created_at desc, id desc);
-- Guards ("does this user still own active work?") only look at unattested orders
create index work_orders_active_idx on public.work_orders (vessel_id, assigned_to) where attested_at is null;
-- Foreign keys not covered above
create index work_orders_created_by_idx  on public.work_orders (created_by);
create index work_orders_attested_by_idx on public.work_orders (attested_by) where attested_by is not null;
-- Fast case-insensitive search on title and code
create index work_orders_title_trgm_idx on public.work_orders using gin (title extensions.gin_trgm_ops);
create index work_orders_code_trgm_idx  on public.work_orders using gin (code extensions.gin_trgm_ops);

create index work_order_events_order_idx on public.work_order_events (work_order_id, created_at, id);
create index work_order_events_actor_idx on public.work_order_events (actor_id) where actor_id is not null;

-- -----------------------------------------------------------------------------
-- 5. Helper functions
--    SECURITY DEFINER lets policies and guards read across tables without
--    recursing into RLS. All of them take the acting user from the JWT claim,
--    never from a parameter, so a caller cannot ask about somebody else.
-- -----------------------------------------------------------------------------
create function public.current_app_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select u.role from public.users u where u.id = public.app_user_id() and u.is_active
$$;

create function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = 'Admin', false)
$$;

-- Set-returning helpers. Policies call them as "x in (select ...)", which
-- Postgres evaluates once per query instead of once per row.
create function public.my_vessel_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select a.vessel_id
  from public.vessel_assignments a
  join public.users u on u.id = a.user_id
  where a.user_id = public.app_user_id() and u.is_active
$$;

create function public.my_captain_vessel_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select a.vessel_id
  from public.vessel_assignments a
  join public.users u on u.id = a.user_id
  where a.user_id = public.app_user_id() and u.is_active and u.role = 'Captain'
$$;

create function public.my_colleague_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct theirs.user_id
  from public.vessel_assignments mine
  join public.vessel_assignments theirs on theirs.vessel_id = mine.vessel_id
  where mine.user_id = public.app_user_id() and public.current_app_role() is not null
$$;

-- An order is "active" until a captain attests it.
create function public.active_work_order_count(p_user_id uuid, p_vessel_id uuid default null)
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.work_orders w
  where w.assigned_to = p_user_id
    and w.attested_at is null
    and (p_vessel_id is null or w.vessel_id = p_vessel_id)
$$;

create function public.assert_valid_assignee(p_user_id uuid, p_vessel_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1
    from public.users u
    join public.vessel_assignments a on a.user_id = u.id
    where u.id = p_user_id and u.role = 'Crew' and u.is_active and a.vessel_id = p_vessel_id
  ) then
    raise exception 'The assignee must be an active crew member assigned to this vessel.';
  end if;
end $$;

-- Raises when removing p_user_id (in role p_role) would strand active work:
--   * Crew: still owns unattested work orders (optionally only on p_vessel_id)
--   * Captain: is the only active captain on a vessel that has unattested work orders
create function public.assert_can_release_user(
  p_user_id uuid, p_role public.user_role, p_vessel_id uuid default null)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_count  bigint;
  v_vessel text;
begin
  if p_role = 'Crew' then
    v_count := public.active_work_order_count(p_user_id, p_vessel_id);
    if v_count > 0 then
      raise exception 'This crew member still owns % active work order(s). Reassign them first.', v_count;
    end if;

  elsif p_role = 'Captain' then
    select v.name into v_vessel
    from public.vessel_assignments a
    join public.vessels v on v.id = a.vessel_id
    where a.user_id = p_user_id
      and (p_vessel_id is null or a.vessel_id = p_vessel_id)
      and exists (select 1 from public.work_orders w
                  where w.vessel_id = a.vessel_id and w.attested_at is null)
      and not exists (select 1
                      from public.vessel_assignments o
                      join public.users ou on ou.id = o.user_id
                      where o.vessel_id = a.vessel_id and o.user_id <> p_user_id
                        and ou.role = 'Captain' and ou.is_active)
    limit 1;
    if found then
      raise exception 'This captain is the only active captain on "%", which has active work orders. Assign another captain first.', v_vessel;
    end if;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Trigger functions
-- -----------------------------------------------------------------------------
create function public.users_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := public.app_user_id();
begin
  new.full_name := btrim(regexp_replace(new.full_name, '\s+', ' ', 'g'));
  new.email := lower(btrim(new.email));

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.id is distinct from old.id then
      raise exception 'User id cannot be changed.' using errcode = '22023';
    end if;

    if new.role is distinct from old.role then
      if old.id = v_actor then
        raise exception 'You cannot change your own role.';
      end if;
      perform public.assert_can_release_user(old.id, old.role);
      if old.role = 'Admin' and old.is_active and not exists (
        select 1 from public.users u where u.role = 'Admin' and u.is_active and u.id <> old.id) then
        raise exception 'At least one active administrator is required.';
      end if;
    end if;

    if old.is_active and not new.is_active then
      if old.id = v_actor then
        raise exception 'You cannot deactivate your own account.';
      end if;
      perform public.assert_can_release_user(old.id, old.role);
      if old.role = 'Admin' and not exists (
        select 1 from public.users u where u.role = 'Admin' and u.is_active and u.id <> old.id) then
        raise exception 'At least one active administrator is required.';
      end if;
    end if;
  end if;

  return new;
end $$;

create function public.vessels_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.imo_number := btrim(new.imo_number);

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if old.is_active and not new.is_active and exists (
      select 1 from public.work_orders w where w.vessel_id = old.id and w.attested_at is null) then
      raise exception 'This vessel still has active work orders. Attest or reassign them before deactivating it.';
    end if;
  end if;

  return new;
end $$;

create function public.vessel_assignments_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_user   public.users%rowtype;
  v_active boolean;
begin
  if tg_op = 'DELETE' then
    select * into v_user from public.users where id = old.user_id;
    perform public.assert_can_release_user(old.user_id, v_user.role, old.vessel_id);
    return old;
  end if;

  select * into v_user from public.users where id = new.user_id;
  if not found or not v_user.is_active then
    raise exception 'Only active users can be assigned to a vessel.';
  end if;
  if v_user.role = 'Admin' then
    raise exception 'Administrators already have access to every vessel and need no assignment.';
  end if;
  select is_active into v_active from public.vessels where id = new.vessel_id;
  if not coalesce(v_active, false) then
    raise exception 'Users can only be assigned to an active vessel.';
  end if;

  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'Use a new assignment to change the user.' using errcode = '22023';
    end if;
    if new.vessel_id is distinct from old.vessel_id then
      perform public.assert_can_release_user(old.user_id, v_user.role, old.vessel_id);
    end if;
  end if;

  return new;
end $$;

create function public.work_orders_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor  uuid := public.app_user_id();
  v_role   public.user_role;
  v_active boolean;
begin
  new.title := btrim(new.title);
  new.issue := btrim(new.issue);

  if public.app_is_client() then
    select u.role into v_role from public.users u where u.id = v_actor and u.is_active;
    if v_role is distinct from 'Captain' or not exists (
      select 1 from public.vessel_assignments a
      where a.user_id = v_actor and a.vessel_id = new.vessel_id) then
      raise exception 'Only a captain assigned to this vessel can create work orders.' using errcode = '42501';
    end if;
    -- A new work order always starts Open and blank, owned by the creating captain.
    new.created_by := v_actor;
    new.status := 'Open';
    new.solution := null;
    new.rejection_reason := null;
    new.attested_at := null;
    new.attested_by := null;
  end if;

  select is_active into v_active from public.vessels where id = new.vessel_id;
  if not coalesce(v_active, false) then
    raise exception 'Work orders can only be created for an active vessel.';
  end if;
  perform public.assert_valid_assignee(new.assigned_to, new.vessel_id);

  return new;
end $$;

-- The status flow, enforced per role:
--   Crew     Open -> In Progress, save solution, In Progress -> Done (solution required)
--   Captain  Done -> attested (locks the order) or Done -> In Progress with a reason;
--            may edit title/issue/assignee while the order is not Done
--   Admin    read-only on work orders
create function public.work_orders_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := public.app_user_id();
  v_role  public.user_role;
begin
  if new.id is distinct from old.id
     or new.vessel_id is distinct from old.vessel_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Work order id, vessel and creator cannot be changed.' using errcode = '22023';
  end if;

  new.title := btrim(new.title);
  new.issue := btrim(new.issue);
  new.solution := nullif(btrim(coalesce(new.solution, '')), '');
  new.updated_at := now();

  if not public.app_is_client() then
    return new;
  end if;

  if old.attested_at is not null then
    raise exception 'This work order has been attested and is locked.' using errcode = '42501';
  end if;

  select u.role into v_role from public.users u where u.id = v_actor and u.is_active;
  if v_role is null then
    raise exception 'Your account is inactive or unknown.' using errcode = '42501';
  end if;

  if v_role = 'Captain' then
    if not exists (select 1 from public.vessel_assignments a
                   where a.user_id = v_actor and a.vessel_id = old.vessel_id) then
      raise exception 'You are not assigned to this vessel.' using errcode = '42501';
    end if;

    if old.status = 'Done' and new.status = 'Done' and new.attested_at is not null then
      -- Attest: close the record
      if (new.title, new.issue, new.solution, new.assigned_to, new.rejection_reason)
         is distinct from (old.title, old.issue, old.solution, old.assigned_to, old.rejection_reason) then
        raise exception 'Attesting a work order cannot change any other field.';
      end if;
      new.attested_at := now();
      new.attested_by := v_actor;

    elsif old.status = 'Done' and new.status = 'In Progress' then
      -- Reject: send back to the crew with a mandatory reason
      if new.attested_at is not null then
        raise exception 'A rejected work order cannot be attested.';
      end if;
      if char_length(btrim(coalesce(new.rejection_reason, ''))) = 0 then
        raise exception 'A rejection reason is required.';
      end if;
      if (new.title, new.issue, new.solution) is distinct from (old.title, old.issue, old.solution) then
        raise exception 'Rejecting a work order cannot change its title, issue or solution.';
      end if;
      new.rejection_reason := btrim(new.rejection_reason);
      if new.assigned_to is distinct from old.assigned_to then
        perform public.assert_valid_assignee(new.assigned_to, new.vessel_id);
      end if;

    elsif old.status = new.status and old.status in ('Open', 'In Progress') then
      -- Edit title / issue / assignee
      if new.solution is distinct from old.solution then
        raise exception 'Only the assigned crew member can document the solution.';
      end if;
      if new.attested_at is not null or new.attested_by is not null
         or new.rejection_reason is distinct from old.rejection_reason then
        raise exception 'Invalid change for a captain.';
      end if;
      if new.assigned_to is distinct from old.assigned_to then
        perform public.assert_valid_assignee(new.assigned_to, new.vessel_id);
      end if;

    else
      raise exception 'Captains cannot change a work order from % to %.', old.status, new.status;
    end if;

  elsif v_role = 'Crew' then
    if old.assigned_to is distinct from v_actor or not exists (
      select 1 from public.vessel_assignments a
      where a.user_id = v_actor and a.vessel_id = old.vessel_id) then
      raise exception 'This work order is not assigned to you.' using errcode = '42501';
    end if;
    if (new.title, new.issue, new.assigned_to, new.attested_at, new.attested_by, new.rejection_reason)
       is distinct from (old.title, old.issue, old.assigned_to, old.attested_at, old.attested_by, old.rejection_reason) then
      raise exception 'Crew can only update the status and the solution.';
    end if;

    if old.status = 'Open' and new.status = 'In Progress' then
      null;
    elsif old.status = 'In Progress' and new.status = 'In Progress' then
      null;
    elsif old.status = 'In Progress' and new.status = 'Done' then
      if new.solution is null then
        raise exception 'Document the solution before marking the work order Done.';
      end if;
      new.rejection_reason := null;   -- resubmitted; the rejection stays in the event log
    else
      raise exception 'Crew cannot change a work order from % to %.', old.status, new.status;
    end if;

  else
    raise exception 'Administrators have read-only access to work orders.' using errcode = '42501';
  end if;

  return new;
end $$;

-- Append-only audit trail, written only by this trigger.
create function public.work_orders_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := public.app_user_id();
begin
  if tg_op = 'INSERT' then
    insert into public.work_order_events (work_order_id, actor_id, event_type, to_status)
    values (new.id, coalesce(v_actor, new.created_by), 'created', new.status);
    return null;
  end if;

  if new.attested_at is not null and old.attested_at is null then
    insert into public.work_order_events (work_order_id, actor_id, event_type, from_status, to_status)
    values (new.id, v_actor, 'attested', old.status, new.status);
  end if;

  if old.status = 'Done' and new.status = 'In Progress' then
    insert into public.work_order_events (work_order_id, actor_id, event_type, from_status, to_status, comment)
    values (new.id, v_actor, 'rejected', old.status, new.status, new.rejection_reason);
  elsif old.status = 'Open' and new.status = 'In Progress' then
    insert into public.work_order_events (work_order_id, actor_id, event_type, from_status, to_status)
    values (new.id, v_actor, 'started', old.status, new.status);
  elsif old.status = 'In Progress' and new.status = 'Done' then
    insert into public.work_order_events (work_order_id, actor_id, event_type, from_status, to_status)
    values (new.id, v_actor, 'submitted', old.status, new.status);
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into public.work_order_events (work_order_id, actor_id, event_type, comment)
    values (new.id, v_actor, 'reassigned',
            (select u.full_name from public.users u where u.id = new.assigned_to));
  end if;

  if new.status = old.status and new.attested_at is not distinct from old.attested_at
     and new.solution is distinct from old.solution then
    insert into public.work_order_events (work_order_id, actor_id, event_type)
    values (new.id, v_actor, 'solution_saved');
  end if;

  if (new.title, new.issue) is distinct from (old.title, old.issue) then
    insert into public.work_order_events (work_order_id, actor_id, event_type)
    values (new.id, v_actor, 'edited');
  end if;

  return null;
end $$;

create trigger users_before_write
  before insert or update on public.users
  for each row execute function public.users_before_write();

create trigger vessels_before_write
  before insert or update on public.vessels
  for each row execute function public.vessels_before_write();

create trigger vessel_assignments_before_write
  before insert or update or delete on public.vessel_assignments
  for each row execute function public.vessel_assignments_before_write();

create trigger work_orders_before_insert
  before insert on public.work_orders
  for each row execute function public.work_orders_before_insert();

create trigger work_orders_before_update
  before update on public.work_orders
  for each row execute function public.work_orders_before_update();

create trigger work_orders_after_write
  after insert or update on public.work_orders
  for each row execute function public.work_orders_after_write();

-- -----------------------------------------------------------------------------
-- 7. Supabase Auth profile linking
--    Inviting an existing seeded profile by the same email links it safely.
-- -----------------------------------------------------------------------------
create function public.link_auth_user_to_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.users
  set auth_user_id = new.id
  where auth_user_id is null and lower(email) = lower(new.email);
  return new;
end $$;

create trigger auth_user_created_link_profile
  after insert on auth.users
  for each row execute function public.link_auth_user_to_profile();

-- -----------------------------------------------------------------------------
-- 8. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.users              enable row level security;
alter table public.vessels            enable row level security;
alter table public.vessel_assignments enable row level security;
alter table public.work_orders        enable row level security;
alter table public.work_order_events  enable row level security;

-- users: admins see everyone; everyone else sees themselves and people on their vessels
create policy users_select on public.users for select to authenticated
  using ((select public.is_admin())
         or id = (select public.app_user_id())
         or id in (select public.my_colleague_ids()));
create policy users_insert on public.users for insert to authenticated
  with check ((select public.is_admin()));
create policy users_update on public.users for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- No delete policy: users are deactivated, never deleted.

-- vessels: admins see all; Captains and Crew see only their own vessels
create policy vessels_select on public.vessels for select to authenticated
  using ((select public.is_admin()) or id in (select public.my_vessel_ids()));
create policy vessels_insert on public.vessels for insert to authenticated
  with check ((select public.is_admin()));
create policy vessels_update on public.vessels for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- vessel_assignments: admins manage; a user sees their own; captains see their vessel's roster
create policy vessel_assignments_select on public.vessel_assignments for select to authenticated
  using ((select public.is_admin())
         or user_id = (select public.app_user_id())
         or vessel_id in (select public.my_captain_vessel_ids()));
create policy vessel_assignments_insert on public.vessel_assignments for insert to authenticated
  with check ((select public.is_admin()));
create policy vessel_assignments_update on public.vessel_assignments for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy vessel_assignments_delete on public.vessel_assignments for delete to authenticated
  using ((select public.is_admin()));

-- work_orders: admins read all; captains see/manage their vessel; crew see only their own
create policy work_orders_select on public.work_orders for select to authenticated
  using ((select public.is_admin())
         or vessel_id in (select public.my_captain_vessel_ids())
         or (assigned_to = (select public.app_user_id())
             and vessel_id in (select public.my_vessel_ids())));
create policy work_orders_insert on public.work_orders for insert to authenticated
  with check (vessel_id in (select public.my_captain_vessel_ids())
              and created_by = (select public.app_user_id()));
create policy work_orders_update on public.work_orders for update to authenticated
  using (vessel_id in (select public.my_captain_vessel_ids())
         or (assigned_to = (select public.app_user_id())
             and (select public.current_app_role()) = 'Crew'
             and vessel_id in (select public.my_vessel_ids())))
  with check (vessel_id in (select public.my_captain_vessel_ids())
         or (assigned_to = (select public.app_user_id())
             and (select public.current_app_role()) = 'Crew'
             and vessel_id in (select public.my_vessel_ids())));
-- No delete policy: work orders are never deleted.

-- work_order_events: visible exactly when the parent order is visible (its RLS applies)
create policy work_order_events_select on public.work_order_events for select to authenticated
  using (exists (select 1 from public.work_orders w where w.id = work_order_id));

-- -----------------------------------------------------------------------------
-- 9. Grants (least privilege; Supabase grants everything by default, so reset)
-- -----------------------------------------------------------------------------
revoke all on all tables    in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on public.users, public.vessels, public.vessel_assignments,
                public.work_orders, public.work_order_events to authenticated;

-- Column-level writes: clients can never set ids, timestamps, attested_by or created_by
grant insert (full_name, email, role, is_active) on public.users to authenticated;
grant update (full_name, email, role, is_active) on public.users to authenticated;
grant insert (name, imo_number, vessel_type, is_active) on public.vessels to authenticated;
grant update (name, imo_number, vessel_type, is_active) on public.vessels to authenticated;
grant insert (vessel_id, user_id) on public.vessel_assignments to authenticated;
grant update (vessel_id) on public.vessel_assignments to authenticated;
grant delete on public.vessel_assignments to authenticated;
grant insert (vessel_id, title, issue, assigned_to) on public.work_orders to authenticated;
grant update (title, issue, solution, status, assigned_to, rejection_reason, attested_at)
  on public.work_orders to authenticated;

grant execute on function
  public.app_claims(), public.app_user_id(), public.app_is_client(),
  public.current_app_role(), public.is_admin(),
  public.my_vessel_ids(), public.my_captain_vessel_ids(), public.my_colleague_ids()
  to authenticated;

