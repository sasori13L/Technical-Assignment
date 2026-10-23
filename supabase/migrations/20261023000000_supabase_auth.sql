-- Migrate an existing mock-auth deployment to Supabase Auth.
-- Apply once, then invite Auth accounts using the existing profile email.

alter table public.users
  add column if not exists auth_user_id uuid references auth.users (id) on delete restrict;

create unique index if not exists users_auth_user_key
  on public.users (auth_user_id) where auth_user_id is not null;

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

create or replace function public.link_auth_user_to_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.users
  set auth_user_id = new.id
  where auth_user_id is null and lower(email) = lower(new.email);
  return new;
end $$;

drop trigger if exists auth_user_created_link_profile on auth.users;
create trigger auth_user_created_link_profile
  after insert on auth.users
  for each row execute function public.link_auth_user_to_profile();

revoke all on function public.link_auth_user_to_profile() from public, anon, authenticated;

revoke execute on function public.switcher_vessels() from anon, authenticated;
revoke execute on function public.switcher_members(uuid, public.user_role) from anon, authenticated;
revoke execute on function public.switcher_user(uuid) from anon, authenticated;
drop function public.switcher_vessels();
drop function public.switcher_members(uuid, public.user_role);
drop function public.switcher_user(uuid);
