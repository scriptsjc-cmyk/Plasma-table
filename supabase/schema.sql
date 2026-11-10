-- Plasma table accounts, parts and machine claims.
-- Paste this whole file into the Supabase SQL Editor and press Run.
-- Idempotent: safe to re-run. Uses IF NOT EXISTS, CREATE OR REPLACE,
-- and DROP ... IF EXISTS on triggers and policies. It does not drop tables
-- or stored parts / machines.
--
-- After it has run, make yourself admin with supabase/make-admin.sql
-- (one line, change the email).

create extension if not exists pgcrypto with schema extensions;

-- --------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  mode text not null default 'beginner' check (mode in ('beginner', 'pro')),
  role text not null default 'user'  check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists parts_owner_updated_idx on public.parts (owner, updated_at desc);

-- claim_code_hash is a hex SHA-256 of the uppercase trimmed claim code.
-- The plain code is never stored. Users never read this column (see grants).
create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  serial text not null unique,
  claim_code_hash text not null,
  owner uuid references public.profiles (id) on delete set null,
  claimed_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists machines_owner_idx on public.machines (owner);
create unique index if not exists machines_claim_hash_idx on public.machines (claim_code_hash);

-- Every claim attempt is written here (success, failure, rate-limit).
create table if not exists public.claim_log (
  id bigserial primary key,
  user_id uuid references public.profiles (id) on delete set null,
  ok boolean not null,
  detail text not null default '',
  at timestamptz not null default now()
);
create index if not exists claim_log_user_at_idx on public.claim_log (user_id, at desc);

-- --------------------------------------------------------------------------
-- Helpers
-- --------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.tg_touch_updated_at();

drop trigger if exists parts_touch on public.parts;
create trigger parts_touch
  before update on public.parts
  for each row execute function public.tg_touch_updated_at();

-- Users must not be able to promote themselves to admin, or change their id.
create or replace function public.tg_protect_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.id := old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.tg_protect_profile();

-- New Auth user → a profile row. Mode and display name come from signup metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, mode, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', ''),
    case when lower(coalesce(new.raw_user_meta_data->>'mode', '')) = 'pro'
         then 'pro' else 'beginner' end,
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------------------
-- RPCs
-- --------------------------------------------------------------------------

create or replace function public.claim_machine(p_code text, p_serial text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  h   text;
  rec public.machines%rowtype;
  n   int;
  code text;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  -- rate limit: 8 attempts / 15 minutes per account (logged either way)
  select count(*) into n
    from public.claim_log
   where user_id = uid
     and at > now() - interval '15 minutes';
  if n >= 8 then
    insert into public.claim_log (user_id, ok, detail) values (uid, false, 'rate_limited');
    raise exception 'Too many tries. Wait 15 minutes and try again.';
  end if;

  code := upper(trim(both from coalesce(p_code, '')));
  if code = '' then
    insert into public.claim_log (user_id, ok, detail) values (uid, false, 'empty_code');
    raise exception 'Enter the claim code from the sticker.';
  end if;

  h := encode(extensions.digest(code, 'sha256'), 'hex');

  if p_serial is not null and length(trim(p_serial)) > 0 then
    select * into rec from public.machines
      where upper(serial) = upper(trim(p_serial));
    if not found then
      insert into public.claim_log (user_id, ok, detail) values (uid, false, 'unknown_serial');
      raise exception 'That serial number was not found.';
    end if;
    if rec.claim_code_hash is distinct from h then
      insert into public.claim_log (user_id, ok, detail) values (uid, false, 'bad_code');
      raise exception 'That code is not recognised.';
    end if;
  else
    select * into rec from public.machines where claim_code_hash = h;
    if not found then
      insert into public.claim_log (user_id, ok, detail) values (uid, false, 'bad_code');
      raise exception 'That code is not recognised.';
    end if;
  end if;

  if rec.owner is not null then
    insert into public.claim_log (user_id, ok, detail)
      values (uid, false, 'already_claimed:' || rec.serial);
    raise exception 'This machine is already linked to an account.';
  end if;

  update public.machines
     set owner = uid, claimed_at = now()
   where id = rec.id
     and owner is null;
  if not found then
    insert into public.claim_log (user_id, ok, detail)
      values (uid, false, 'already_claimed:' || rec.serial);
    raise exception 'This machine is already linked to an account.';
  end if;

  insert into public.claim_log (user_id, ok, detail)
    values (uid, true, 'claimed:' || rec.serial);

  return jsonb_build_object('ok', true, 'serial', rec.serial);
end;
$$;

create or replace function public.my_machines()
returns table (serial text, claimed_at timestamptz, notes text)
language sql
stable
security definer
set search_path = public
as $$
  select m.serial, m.claimed_at, m.notes
    from public.machines m
   where m.owner = auth.uid()
   order by m.claimed_at desc nulls last;
$$;

create or replace function public.admin_list_machines()
returns table (
  serial text,
  owner uuid,
  owner_email text,
  claimed_at timestamptz,
  notes text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  return query
    select m.serial,
           m.owner,
           u.email::text,
           m.claimed_at,
           m.notes,
           m.created_at
      from public.machines m
      left join auth.users u on u.id = m.owner
     order by m.created_at;
end;
$$;

create or replace function public.admin_add_machine(p_serial text, p_code text, p_notes text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ser text;
  h   text;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  ser := upper(trim(both from coalesce(p_serial, '')));
  if ser = '' or length(trim(coalesce(p_code, ''))) < 4 then
    raise exception 'Serial and a claim code of at least 4 characters are required.';
  end if;
  h := encode(extensions.digest(upper(trim(p_code)), 'sha256'), 'hex');
  insert into public.machines (serial, claim_code_hash, notes)
  values (ser, h, coalesce(p_notes, ''))
  on conflict (serial) do update
    set claim_code_hash = excluded.claim_code_hash,
        notes = excluded.notes;
  return jsonb_build_object('ok', true, 'serial', ser);
end;
$$;

create or replace function public.admin_unlink_machine(p_serial text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ser text := upper(trim(both from coalesce(p_serial, '')));
  n   int;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  update public.machines
     set owner = null, claimed_at = null
   where upper(serial) = ser;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'Serial not found';
  end if;
  insert into public.claim_log (user_id, ok, detail)
    values (auth.uid(), true, 'unlinked:' || ser);
  return jsonb_build_object('ok', true, 'serial', ser);
end;
$$;

create or replace function public.admin_transfer_machine(p_serial text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ser text := upper(trim(both from coalesce(p_serial, '')));
  uid uuid;
  n   int;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  select u.id into uid from auth.users u
   where lower(u.email) = lower(trim(p_email));
  if uid is null then
    raise exception 'No account with that email.';
  end if;
  update public.machines
     set owner = uid, claimed_at = now()
   where upper(serial) = ser;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'Serial not found';
  end if;
  insert into public.claim_log (user_id, ok, detail)
    values (auth.uid(), true, 'transferred:' || ser || ':' || uid::text);
  return jsonb_build_object('ok', true, 'serial', ser, 'owner', uid);
end;
$$;

create or replace function public.admin_list_claim_log(p_limit int default 100)
returns table (id bigint, user_id uuid, ok boolean, detail text, at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  return query
    select l.id, l.user_id, l.ok, l.detail, l.at
      from public.claim_log l
     order by l.at desc
     limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

-- --------------------------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------------------------

alter table public.profiles  enable row level security;
alter table public.parts     enable row level security;
alter table public.machines  enable row level security;
alter table public.claim_log enable row level security;

-- Recreate policies idempotently
drop policy if exists profiles_select_own  on public.profiles;
drop policy if exists profiles_update_own  on public.profiles;
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists parts_select_own     on public.parts;
drop policy if exists parts_insert_own     on public.parts;
drop policy if exists parts_update_own     on public.parts;
drop policy if exists parts_delete_own     on public.parts;
drop policy if exists machines_select_own  on public.machines;
drop policy if exists machines_select_admin on public.machines;
drop policy if exists claim_log_select_admin on public.claim_log;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- No insert/delete for clients: the signup trigger creates the row; Auth deletes cascade.

create policy parts_select_own on public.parts
  for select to authenticated
  using (owner = auth.uid());

create policy parts_insert_own on public.parts
  for insert to authenticated
  with check (owner = auth.uid());

create policy parts_update_own on public.parts
  for update to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

create policy parts_delete_own on public.parts
  for delete to authenticated
  using (owner = auth.uid());

-- Users may read only their own claimed machines, and never the hash
-- (column is revoked below). Admins list via admin_list_machines().
create policy machines_select_own on public.machines
  for select to authenticated
  using (owner = auth.uid() or public.is_admin());

-- No direct insert/update/delete: all mutations go through the RPCs.

create policy claim_log_select_admin on public.claim_log
  for select to authenticated
  using (public.is_admin());

-- --------------------------------------------------------------------------
-- Grants (least privilege)
-- --------------------------------------------------------------------------

revoke all on public.profiles  from anon, authenticated;
revoke all on public.parts     from anon, authenticated;
revoke all on public.machines  from anon, authenticated;
revoke all on public.claim_log from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.parts to authenticated;

-- machines: row reads of non-hash columns only; hash stays with the table owner / RPCs
grant select (id, serial, owner, claimed_at, notes, created_at) on public.machines to authenticated;

grant select on public.claim_log to authenticated;  -- RLS: admin only

grant usage, select on sequence public.claim_log_id_seq to authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.claim_machine(text, text) to authenticated;
grant execute on function public.my_machines() to authenticated;
grant execute on function public.admin_list_machines() to authenticated;
grant execute on function public.admin_add_machine(text, text, text) to authenticated;
grant execute on function public.admin_unlink_machine(text) to authenticated;
grant execute on function public.admin_transfer_machine(text, text) to authenticated;
grant execute on function public.admin_list_claim_log(int) to authenticated;

-- Nobody in the client roles can call these with the service role either via the
-- anon key; service_role bypasses RLS but should never be shipped in the app.

notify pgrst, 'reload schema';
