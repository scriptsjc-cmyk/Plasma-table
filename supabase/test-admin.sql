-- test-admin.sql: let the app developer's test account (rdrte9jk@mail.grokbot.com) be a second admin.
-- Paste into the Supabase SQL editor and Run. Josh stays admin. Undo: see the bottom.

-- 1. List of extra admin emails (not readable by app users).
create table if not exists public.extra_admins (
  email text primary key
);
revoke all on public.extra_admins from public, anon, authenticated;

-- 2. Allow more than one admin.
drop index if exists public.profiles_one_admin;

-- 3. Admin = confirmed email that is Josh's OR on the extra list, with role admin.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.id = auth.uid()
       and p.role = 'admin'
       and u.email_confirmed_at is not null
       and (lower(u.email) = lower(public.admin_email())
            or lower(u.email) in (select lower(e.email) from public.extra_admins e))
  );
$$;

-- 4. Stop Josh's sign-in triggers from demoting the extra admins.
create or replace function public.promote_admin_on_confirm()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null
     and lower(coalesce(new.email, '')) = lower(public.admin_email()) then
    perform pg_advisory_xact_lock(hashtext('plasma-table-admin'));
    update public.profiles p set role = 'user'
     where p.role = 'admin' and p.id <> new.id
       and not exists (select 1 from auth.users u join public.extra_admins e on lower(e.email) = lower(u.email) where u.id = p.id);
    update public.profiles set role = 'admin' where id = new.id and role <> 'admin';
  end if;
  return new;
end;
$$;
revoke execute on function public.promote_admin_on_confirm() from public, anon, authenticated;

-- 5. Add the test account and make it admin.
insert into public.extra_admins (email) values ('rdrte9jk@mail.grokbot.com') on conflict do nothing;
update public.profiles p set role = 'admin'
  from auth.users u
 where u.id = p.id and lower(u.email) = 'rdrte9jk@mail.grokbot.com' and u.email_confirmed_at is not null;

-- 6. Check: should list Josh and the test account, both admin.
select u.email, p.role from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin';

-- UNDO (run these lines to remove test admin):
-- delete from public.extra_admins where email = 'rdrte9jk@mail.grokbot.com';
-- update public.profiles p set role = 'user' from auth.users u where u.id = p.id and lower(u.email) = 'rdrte9jk@mail.grokbot.com';
