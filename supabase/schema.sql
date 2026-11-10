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

-- ==========================================================================
-- Security hardening (migration 2). Same content as supabase/schema-fixes.sql.
-- ==========================================================================
-- Plasma table accounts: security fixes (migration 2). IDEMPOTENT: safe to run more than once.
-- Run in the Supabase SQL Editor AFTER the existing supabase/schema.sql has been applied
-- (it is also appended to supabase/schema.sql in fixes.patch, so a fresh install gets both).
-- Deploy the matching js/account.js first or together: claim_machine now RETURNS
-- {"ok":false,"error":"..."} for wrong codes instead of raising (see fix S1).
-- It never touches stored parts, machines or users, and never needs the service_role key.

-- --------------------------------------------------------------------------
-- S2. profiles trigger: promotions from the SQL editor were silently reverted,
--     and role/id protection must not depend on is_admin() of the caller.
--     Now a SECURITY INVOKER trigger that locks role/id/created_at for the API
--     roles (anon, authenticated); the table owner / SQL editor can still promote.
-- --------------------------------------------------------------------------
create or replace function public.tg_protect_profile()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.role := old.role;
    new.id := old.id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.tg_protect_profile();

create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- S3. Pin search_path (empty, everything schema-qualified) on every SECURITY DEFINER function.
-- --------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, mode, role)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'display_name', ''), 80),
    case when lower(coalesce(new.raw_user_meta_data->>'mode', '')) = 'pro'
         then 'pro' else 'beginner' end,
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.my_machines()
returns table (serial text, claimed_at timestamptz, notes text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.serial, m.claimed_at, m.notes
    from public.machines m
   where m.owner = auth.uid()
   order by m.claimed_at desc nulls last;
$$;

-- --------------------------------------------------------------------------
-- S1. claim_machine: failed attempts were logged and then ROLLED BACK by the
--     'raise exception', so the rate limit never counted anything. Wrong codes now
--     return {"ok":false,"error":...} (the log row commits). Also: per-user advisory
--     lock (no parallel-request bypass), only failures count, one generic message for
--     unknown serial / wrong code (no serial enumeration).
-- --------------------------------------------------------------------------
create or replace function public.claim_machine(p_code text, p_serial text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  h    text;
  rec  public.machines%rowtype;
  n    int;
  code text;
  ser  text;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  -- serialise this user's attempts so parallel requests cannot dodge the limit
  perform pg_advisory_xact_lock(hashtextextended('claim_machine:' || uid::text, 0));

  -- rate limit: 8 failed attempts / 15 minutes per account
  select count(*) into n
    from public.claim_log
   where user_id = uid
     and not ok
     and detail <> 'rate_limited'
     and at > now() - interval '15 minutes';
  if n >= 8 then
    if not exists (select 1 from public.claim_log
                    where user_id = uid and detail = 'rate_limited'
                      and at > now() - interval '1 minute') then
      insert into public.claim_log (user_id, ok, detail) values (uid, false, 'rate_limited');
    end if;
    return jsonb_build_object('ok', false, 'error', 'Too many tries. Wait 15 minutes and try again.');
  end if;

  code := upper(trim(both from coalesce(p_code, '')));
  if code = '' then
    insert into public.claim_log (user_id, ok, detail) values (uid, false, 'empty_code');
    return jsonb_build_object('ok', false, 'error', 'Enter the claim code from the sticker.');
  end if;
  if length(code) > 64 then
    insert into public.claim_log (user_id, ok, detail) values (uid, false, 'bad_code');
    return jsonb_build_object('ok', false, 'error', 'That code is not recognised.');
  end if;

  h := encode(extensions.digest(code, 'sha256'), 'hex');
  ser := upper(trim(both from coalesce(p_serial, '')));

  if ser <> '' then
    select * into rec from public.machines
      where upper(serial) = ser and claim_code_hash = h;
  else
    select * into rec from public.machines where claim_code_hash = h;
  end if;
  if not found then
    insert into public.claim_log (user_id, ok, detail)
      values (uid, false, case when ser <> '' then 'bad_code_or_serial' else 'bad_code' end);
    return jsonb_build_object('ok', false, 'error', 'That code is not recognised.');
  end if;

  if rec.owner is not null then
    insert into public.claim_log (user_id, ok, detail)
      values (uid, false, 'already_claimed:' || rec.serial);
    return jsonb_build_object('ok', false, 'error', 'This machine is already linked to an account.');
  end if;

  update public.machines
     set owner = uid, claimed_at = now()
   where id = rec.id
     and owner is null;
  if not found then
    insert into public.claim_log (user_id, ok, detail)
      values (uid, false, 'already_claimed:' || rec.serial);
    return jsonb_build_object('ok', false, 'error', 'This machine is already linked to an account.');
  end if;

  insert into public.claim_log (user_id, ok, detail)
    values (uid, true, 'claimed:' || rec.serial);

  return jsonb_build_object('ok', true, 'serial', rec.serial);
end;
$$;

-- --------------------------------------------------------------------------
-- S4. admin RPCs: pinned search_path, input limits, minimum claim-code strength.
-- --------------------------------------------------------------------------
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
set search_path = ''
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
set search_path = ''
as $$
declare
  ser  text;
  code text;
  h    text;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  ser  := upper(trim(both from coalesce(p_serial, '')));
  code := upper(trim(both from coalesce(p_code, '')));
  if ser = '' or length(ser) > 64 then
    raise exception 'Serial is required (up to 64 characters).';
  end if;
  -- 8+ characters: the generator makes XXXX-XXXX (about 40 bits); 4 characters is guessable
  if length(code) < 8 or length(code) > 64 then
    raise exception 'The claim code must be 8 to 64 characters (the generator makes XXXX-XXXX).';
  end if;
  if length(coalesce(p_notes, '')) > 500 then
    raise exception 'Notes are too long (500 characters max).';
  end if;
  h := encode(extensions.digest(code, 'sha256'), 'hex');
  begin
    insert into public.machines (serial, claim_code_hash, notes)
    values (ser, h, coalesce(p_notes, ''))
    on conflict (serial) do update
      set claim_code_hash = excluded.claim_code_hash,
          notes = excluded.notes;
  exception when unique_violation then
    raise exception 'That claim code is already used by another machine.';
  end;
  return jsonb_build_object('ok', true, 'serial', ser);
end;
$$;

create or replace function public.admin_unlink_machine(p_serial text)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
set search_path = ''
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
   where lower(u.email) = lower(trim(coalesce(p_email, '')));
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
set search_path = ''
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
-- S5. Size / abuse limits (any confirmed account could otherwise store unlimited data).
-- --------------------------------------------------------------------------
-- tidy any existing over-long values first so later updates of those rows are not rejected
update public.profiles set display_name = left(display_name, 80) where char_length(display_name) > 80;
update public.parts set name = left(name, 200) where char_length(name) > 200;
update public.parts set name = 'Untitled part' where char_length(name) = 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_display_name_len') then
    alter table public.profiles add constraint profiles_display_name_len
      check (char_length(display_name) <= 80) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'parts_name_len') then
    alter table public.parts add constraint parts_name_len
      check (char_length(name) between 1 and 200) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'parts_data_size') then
    alter table public.parts add constraint parts_data_size
      check (octet_length(data::text) <= 2000000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'machines_serial_len') then
    alter table public.machines add constraint machines_serial_len
      check (char_length(serial) between 1 and 64) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'machines_notes_len') then
    alter table public.machines add constraint machines_notes_len
      check (char_length(notes) <= 500) not valid;
  end if;
end $$;

create or replace function public.tg_limit_parts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.parts p where p.owner = new.owner) >= 1000 then
    raise exception 'You have reached the limit of 1000 saved parts. Delete some first.';
  end if;
  return new;
end;
$$;
drop trigger if exists parts_limit on public.parts;
create trigger parts_limit
  before insert on public.parts
  for each row execute function public.tg_limit_parts();

-- --------------------------------------------------------------------------
-- S6. Grants. Postgres gives EXECUTE to PUBLIC on new functions, and Supabase also
--     grants it to anon: strip both, then grant only what each role needs.
--     profiles: API users may only change display_name and mode (never role/id).
-- --------------------------------------------------------------------------
revoke execute on function public.is_admin()                              from public, anon;
revoke execute on function public.my_machines()                           from public, anon;
revoke execute on function public.claim_machine(text, text)               from public, anon;
revoke execute on function public.admin_list_machines()                   from public, anon;
revoke execute on function public.admin_add_machine(text, text, text)     from public, anon;
revoke execute on function public.admin_unlink_machine(text)              from public, anon;
revoke execute on function public.admin_transfer_machine(text, text)      from public, anon;
revoke execute on function public.admin_list_claim_log(int)               from public, anon;
revoke execute on function public.handle_new_user()                       from public, anon, authenticated;
revoke execute on function public.tg_protect_profile()                    from public, anon, authenticated;
revoke execute on function public.tg_touch_updated_at()                   from public, anon, authenticated;
revoke execute on function public.tg_limit_parts()                        from public, anon, authenticated;

grant execute on function public.is_admin()                               to authenticated;
grant execute on function public.my_machines()                            to authenticated;
grant execute on function public.claim_machine(text, text)                to authenticated;
grant execute on function public.admin_list_machines()                    to authenticated;
grant execute on function public.admin_add_machine(text, text, text)      to authenticated;
grant execute on function public.admin_unlink_machine(text)               to authenticated;
grant execute on function public.admin_transfer_machine(text, text)       to authenticated;
grant execute on function public.admin_list_claim_log(int)                to authenticated;

-- future functions created by this role are not callable by anon / PUBLIC by default
alter default privileges in schema public revoke execute on functions from public, anon;

revoke all on sequence public.claim_log_id_seq from anon, authenticated;

revoke update on public.profiles from authenticated;
grant update (display_name, mode) on public.profiles to authenticated;

notify pgrst, 'reload schema';

-- ===== admin-powers (folded) =====
-- Admin powers: single-admin rule, user directory, usage stats, job_events,
-- announcements, and shared cut presets.
-- Idempotent: safe to re-run AFTER schema-fixes.sql (or as part of schema.sql).
-- Does not drop existing tables or data. Never needs the service_role key in the app.

-- --------------------------------------------------------------------------
-- 0. At most one admin. If a previous experiment left more than one, keep the
--    earliest and demote the rest so the unique index can be created.
-- --------------------------------------------------------------------------
with ranked as (
  select id, row_number() over (order by created_at, id) as rn
  from public.profiles
  where role = 'admin'
)
update public.profiles p
   set role = 'user'
  from ranked r
 where p.id = r.id and r.rn > 1;

create unique index if not exists profiles_one_admin
  on public.profiles (role)
  where role = 'admin';

alter table public.profiles
  add column if not exists last_active timestamptz;

-- Singleton config. admin_email is the intended unique admin; set_admin()
-- writes it and aligns profiles.role. API roles cannot update this table.
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  admin_email text,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id, admin_email)
values (1, 'jchappell2003@gmail.com')
on conflict (id) do update
  set admin_email = coalesce(public.app_settings.admin_email, 'jchappell2003@gmail.com');

revoke all on public.app_settings from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- 1. set_admin(email): the only supported way to promote an admin.
--    Callable from the SQL editor (table owner / postgres). EXECUTE is
--    revoked from anon, authenticated and PUBLIC, so no API user can
--    self-promote. Demotes every other admin first (unique index).
-- --------------------------------------------------------------------------
-- The only account that may be admin. is_admin() requires role='admin' AND this email.
create or replace function public.admin_email()
returns text
language sql
immutable
parallel safe
as $$
  select 'jchappell2003@gmail.com'::text;
$$;

create or replace function public.set_admin(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  em text := lower(trim(coalesce(p_email, '')));
  uid uuid;
begin
  if em is null or em = '' or position('@' in em) = 0 then
    raise exception 'Enter a valid email address.';
  end if;
  if em <> lower(public.admin_email()) then
    raise exception 'Only % can be admin.', public.admin_email();
  end if;
  update public.app_settings
     set admin_email = em, updated_at = now()
   where id = 1;
  if not found then
    insert into public.app_settings (id, admin_email) values (1, em)
    on conflict (id) do update set admin_email = excluded.admin_email, updated_at = now();
  end if;
  update public.profiles set role = 'user' where role = 'admin';
  select u.id into uid from auth.users u where lower(u.email) = em;
  if uid is not null then
    update public.profiles set role = 'admin' where id = uid;
    if not found then
      insert into public.profiles (id, display_name, mode, role)
      values (uid, '', 'beginner', 'admin')
      on conflict (id) do update set role = 'admin';
    end if;
    return jsonb_build_object('ok', true, 'email', em, 'id', uid, 'status', 'promoted');
  end if;
  return jsonb_build_object('ok', true, 'email', em, 'id', null,
    'status', 'reserved',
    'note', 'No account with that email yet. After they sign up, run this again, or they will be promoted automatically.');
end;
$$;

-- Auto-promote if they sign up after set_admin stored their email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  want text;
  is_adm boolean := false;
begin
  want := lower(public.admin_email());
  if lower(coalesce(new.email, '')) = want then
    update public.profiles set role = 'user' where role = 'admin';
    is_adm := true;
  end if;
  insert into public.profiles (id, display_name, mode, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', ''),
    case when lower(coalesce(new.raw_user_meta_data->>'mode', '')) = 'pro'
         then 'pro' else 'beginner' end,
    case when is_adm then 'admin' else 'user' end
  )
  on conflict (id) do update
    set role = case when is_adm then 'admin' else public.profiles.role end;
  return new;
end;
$$;

-- is_admin(): must be the designated email AND hold the admin role.
-- A profile with role='admin' but a different email is not treated as admin.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.id = auth.uid()
       and p.role = 'admin'
       and lower(u.email) = lower(public.admin_email())
  );
$$;

create or replace function public.touch_last_active()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return; end if;
  update public.profiles
     set last_active = now()
   where id = auth.uid();
end;
$$;

-- --------------------------------------------------------------------------
-- 2. job_events — privacy-light run log (no G-code). Users insert their own
--    via log_job_event(); only admin reads everyone's rows.
-- --------------------------------------------------------------------------
create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  machine_serial text,
  status text not null check (status in ('started', 'finished', 'aborted')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_s numeric check (duration_s is null or duration_s >= 0),
  cut_length_mm numeric check (cut_length_mm is null or cut_length_mm >= 0),
  part_count int check (part_count is null or part_count >= 0),
  created_at timestamptz not null default now()
);
create index if not exists job_events_user_started_idx on public.job_events (user_id, started_at desc);
create index if not exists job_events_started_idx on public.job_events (started_at desc);

alter table public.job_events enable row level security;

drop policy if exists job_events_select_own on public.job_events;
drop policy if exists job_events_select_admin on public.job_events;
drop policy if exists job_events_insert_own on public.job_events;
drop policy if exists job_events_update_own on public.job_events;

create policy job_events_select_own on public.job_events
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy job_events_insert_own on public.job_events
  for insert to authenticated
  with check (user_id = auth.uid());

create policy job_events_update_own on public.job_events
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.job_events from public, anon, authenticated;
grant select, insert, update on public.job_events to authenticated;

create or replace function public.log_job_event(
  p_status text,
  p_serial text default null,
  p_duration_s numeric default null,
  p_cut_length_mm numeric default null,
  p_part_count int default null,
  p_event_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  st text := lower(trim(coalesce(p_status, '')));
  ser text := left(upper(trim(coalesce(p_serial, ''))), 64);
  eid uuid;
  row public.job_events;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  if st not in ('started', 'finished', 'aborted') then
    raise exception 'Unknown job status.';
  end if;
  perform public.touch_last_active();
  if st = 'started' then
    insert into public.job_events (user_id, machine_serial, status, started_at)
    values (uid, nullif(ser, ''), 'started', now())
    returning * into row;
    return jsonb_build_object('ok', true, 'id', row.id);
  end if;
  eid := p_event_id;
  if eid is not null then
    update public.job_events e
       set status = st,
           ended_at = now(),
           duration_s = coalesce(p_duration_s, extract(epoch from (now() - e.started_at))),
           cut_length_mm = coalesce(p_cut_length_mm, e.cut_length_mm),
           part_count = coalesce(p_part_count, e.part_count),
           machine_serial = coalesce(nullif(ser, ''), e.machine_serial)
     where e.id = eid and e.user_id = uid
     returning * into row;
  end if;
  if row.id is null then
    insert into public.job_events (user_id, machine_serial, status, started_at, ended_at, duration_s, cut_length_mm, part_count)
    values (uid, nullif(ser, ''), st, now(), now(), p_duration_s, p_cut_length_mm, p_part_count)
    returning * into row;
  end if;
  return jsonb_build_object('ok', true, 'id', row.id);
end;
$$;

-- --------------------------------------------------------------------------
-- 3. Announcements. Readable by signed-in users, writable only through
--    admin RPCs. Body/title are plain text (the client must not interpret HTML).
-- --------------------------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'update')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null
);
create index if not exists announcements_created_idx on public.announcements (created_at desc);

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;

drop policy if exists announcements_select on public.announcements;
drop policy if exists announcement_reads_select_own on public.announcement_reads;
drop policy if exists announcement_reads_insert_own on public.announcement_reads;

create policy announcements_select on public.announcements
  for select to authenticated
  using (true);

create policy announcement_reads_select_own on public.announcement_reads
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy announcement_reads_insert_own on public.announcement_reads
  for insert to authenticated
  with check (user_id = auth.uid());

revoke all on public.announcements from public, anon, authenticated;
revoke all on public.announcement_reads from public, anon, authenticated;
grant select on public.announcements to authenticated;
grant select, insert on public.announcement_reads to authenticated;

create or replace function public.admin_create_announcement(
  p_title text, p_body text, p_severity text default 'info', p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sev text := lower(trim(coalesce(p_severity, 'info')));
  title text := left(trim(coalesce(p_title, '')), 200);
  body text := left(trim(coalesce(p_body, '')), 4000);
  row public.announcements;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if title = '' or body = '' then raise exception 'Title and body are required.'; end if;
  if sev not in ('info', 'warning', 'update') then raise exception 'Severity must be info, warning or update.'; end if;
  insert into public.announcements (title, body, severity, expires_at, created_by)
  values (title, body, sev, p_expires_at, auth.uid())
  returning * into row;
  return to_jsonb(row);
end;
$$;

create or replace function public.admin_delete_announcement(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  delete from public.announcements where id = p_id;
  if not found then raise exception 'Announcement not found.'; end if;
  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

create or replace function public.my_announcements()
returns table (
  id uuid, title text, body text, severity text, created_at timestamptz, expires_at timestamptz, read boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  return query
    select a.id, a.title, a.body, a.severity, a.created_at, a.expires_at,
           (r.user_id is not null) as read
      from public.announcements a
      left join public.announcement_reads r
        on r.announcement_id = a.id and r.user_id = auth.uid()
     where a.expires_at is null or a.expires_at > now()
     order by a.created_at desc;
end;
$$;

create or replace function public.mark_announcement_read(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from public.announcements a where a.id = p_id) then
    raise exception 'Announcement not found.';
  end if;
  insert into public.announcement_reads (announcement_id, user_id)
  values (p_id, auth.uid())
  on conflict (announcement_id, user_id) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

-- --------------------------------------------------------------------------
-- 4. Cut presets (admin-editable defaults pushed to every user).
-- --------------------------------------------------------------------------
create table if not exists public.cut_presets (
  id uuid primary key default gen_random_uuid(),
  material text not null,
  thickness_mm numeric not null check (thickness_mm > 0),
  pierce_delay_s numeric,
  pierce_height_mm numeric,
  cut_speed_mm_min numeric,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  unique (material, thickness_mm)
);

alter table public.cut_presets enable row level security;
drop policy if exists cut_presets_select on public.cut_presets;
create policy cut_presets_select on public.cut_presets
  for select to authenticated
  using (true);

revoke all on public.cut_presets from public, anon, authenticated;
grant select on public.cut_presets to authenticated;

create or replace function public.admin_upsert_cut_preset(
  p_material text, p_thickness_mm numeric,
  p_pierce_delay_s numeric default null,
  p_pierce_height_mm numeric default null,
  p_cut_speed_mm_min numeric default null,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  mat text := left(trim(coalesce(p_material, '')), 80);
  row public.cut_presets;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if mat = '' or p_thickness_mm is null or p_thickness_mm <= 0 then
    raise exception 'Material and a positive thickness are required.';
  end if;
  insert into public.cut_presets (material, thickness_mm, pierce_delay_s, pierce_height_mm, cut_speed_mm_min, notes, updated_by, updated_at)
  values (mat, p_thickness_mm, p_pierce_delay_s, p_pierce_height_mm, p_cut_speed_mm_min, left(coalesce(p_notes, ''), 200), auth.uid(), now())
  on conflict (material, thickness_mm) do update
    set pierce_delay_s = excluded.pierce_delay_s,
        pierce_height_mm = excluded.pierce_height_mm,
        cut_speed_mm_min = excluded.cut_speed_mm_min,
        notes = excluded.notes,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into row;
  return to_jsonb(row);
end;
$$;

create or replace function public.admin_delete_cut_preset(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  delete from public.cut_presets where id = p_id;
  if not found then raise exception 'Preset not found.'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- --------------------------------------------------------------------------
-- 5. Admin directory + usage stats
-- --------------------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  display_name text,
  mode text,
  role text,
  created_at timestamptz,
  last_active timestamptz,
  parts_count bigint,
  machines jsonb
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  return query
    select p.id,
           u.email::text,
           p.display_name,
           p.mode,
           p.role,
           p.created_at,
           p.last_active,
           (select count(*) from public.parts t where t.owner = p.id) as parts_count,
           coalesce((
             select jsonb_agg(jsonb_build_object('serial', m.serial, 'claimed_at', m.claimed_at) order by m.claimed_at)
             from public.machines m where m.owner = p.id
           ), '[]'::jsonb) as machines
      from public.profiles p
      left join auth.users u on u.id = p.id
     order by p.created_at desc;
end;
$$;

create or replace function public.admin_usage_stats()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  out jsonb;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'beginner', (select count(*) from public.profiles where mode = 'beginner'),
    'pro', (select count(*) from public.profiles where mode = 'pro'),
    'active_7', (select count(*) from public.profiles where last_active is not null and last_active > now() - interval '7 days'),
    'active_30', (select count(*) from public.profiles where last_active is not null and last_active > now() - interval '30 days'),
    'machines_claimed', (select count(*) from public.machines where owner is not null),
    'machines_total', (select count(*) from public.machines),
    'jobs_started', (select count(*) from public.job_events where status = 'started' or started_at is not null),
    'jobs_finished', (select count(*) from public.job_events where status = 'finished'),
    'jobs_aborted', (select count(*) from public.job_events where status = 'aborted'),
    'cut_time_s', (select coalesce(sum(duration_s), 0) from public.job_events where status = 'finished'),
    'cut_length_mm', (select coalesce(sum(cut_length_mm), 0) from public.job_events where status in ('finished', 'aborted')),
    'signups', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d), '[]'::jsonb)
      from (
        select date_trunc('day', created_at)::date as d, count(*) as n
          from public.profiles
         where created_at > now() - interval '90 days'
         group by 1
      ) s
    )
  ) into out;
  return out;
end;
$$;

create or replace function public.admin_list_job_events(p_limit int default 200)
returns setof public.job_events
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  lim int := greatest(1, least(coalesce(p_limit, 200), 500));
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  return query
    select * from public.job_events
     order by started_at desc
     limit lim;
end;
$$;

-- --------------------------------------------------------------------------
-- 6. Grants — never leave EXECUTE on PUBLIC/anon. Trigger fns stay locked.
-- --------------------------------------------------------------------------
revoke execute on function public.admin_email()                           from public, anon;
revoke execute on function public.set_admin(text)                         from public, anon, authenticated;
revoke execute on function public.is_admin()                              from public, anon;
revoke execute on function public.handle_new_user()                       from public, anon, authenticated;
revoke execute on function public.touch_last_active()                     from public, anon;
revoke execute on function public.log_job_event(text, text, numeric, numeric, int, uuid) from public, anon;
revoke execute on function public.admin_create_announcement(text, text, text, timestamptz) from public, anon;
revoke execute on function public.admin_delete_announcement(uuid)         from public, anon;
revoke execute on function public.my_announcements()                      from public, anon;
revoke execute on function public.mark_announcement_read(uuid)            from public, anon;
revoke execute on function public.admin_upsert_cut_preset(text, numeric, numeric, numeric, numeric, text) from public, anon;
revoke execute on function public.admin_delete_cut_preset(uuid)           from public, anon;
revoke execute on function public.admin_list_users()                      from public, anon;
revoke execute on function public.admin_usage_stats()                     from public, anon;
revoke execute on function public.admin_list_job_events(int)              from public, anon;

grant execute on function public.admin_email()                            to authenticated;
grant execute on function public.is_admin()                               to authenticated;
grant execute on function public.touch_last_active()                      to authenticated;
grant execute on function public.log_job_event(text, text, numeric, numeric, int, uuid) to authenticated;
grant execute on function public.my_announcements()                       to authenticated;
grant execute on function public.mark_announcement_read(uuid)             to authenticated;
grant execute on function public.admin_create_announcement(text, text, text, timestamptz) to authenticated;
grant execute on function public.admin_delete_announcement(uuid)          to authenticated;
grant execute on function public.admin_upsert_cut_preset(text, numeric, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.admin_delete_cut_preset(uuid)            to authenticated;
grant execute on function public.admin_list_users()                       to authenticated;
grant execute on function public.admin_usage_stats()                      to authenticated;
grant execute on function public.admin_list_job_events(int)               to authenticated;

alter default privileges in schema public revoke execute on functions from public, anon;

notify pgrst, 'reload schema';

-- admin-powers-fixes.sql — security fixes for admin-powers.sql (review round 3).
-- Idempotent. Run AFTER schema.sql + schema-fixes.sql + admin-powers.sql, in the Supabase SQL editor.
-- (schema.sql in this repo already ends with the same statements, so a fresh install gets them too.)
-- Never uses or needs the service_role key.

-- --------------------------------------------------------------------------
-- A1. Admin must have a CONFIRMED email. Before, anyone could sign up with the admin's
--     address before the owner did; the signup trigger handed that unconfirmed row role=admin,
--     and if the owner later confirmed the squatter's account the squatter's password would be admin.
-- --------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.id = auth.uid()
       and p.role = 'admin'
       and u.email_confirmed_at is not null
       and lower(u.email) = lower(public.admin_email())
  );
$$;

-- A2. handle_new_user: keep the display_name cap that admin-powers.sql dropped (a >80 char name made
--     sign-up fail with a constraint error), and do NOT hand out admin at insert time.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, mode, role)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'display_name', ''), 80),
    case when lower(coalesce(new.raw_user_meta_data->>'mode', '')) = 'pro'
         then 'pro' else 'beginner' end,
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- A3. Auto-promote the designated admin only once their email is CONFIRMED (and on email change
--     to that address). Serialised with set_admin() so two promotions can't race the unique index.
create or replace function public.promote_admin_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null
     and lower(coalesce(new.email, '')) = lower(public.admin_email()) then
    perform pg_advisory_xact_lock(hashtext('plasma-table-admin'));
    update public.profiles set role = 'user' where role = 'admin' and id <> new.id;
    update public.profiles set role = 'admin' where id = new.id and role <> 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.promote_admin_on_confirm();

-- set_admin: same behaviour, now serialised. Still refuses any email but the locked one.
create or replace function public.set_admin(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  em text := lower(trim(coalesce(p_email, '')));
  uid uuid;
begin
  if em = '' or position('@' in em) = 0 then
    raise exception 'Enter a valid email address.';
  end if;
  if em <> lower(public.admin_email()) then
    raise exception 'Only % can be admin.', public.admin_email();
  end if;
  perform pg_advisory_xact_lock(hashtext('plasma-table-admin'));
  update public.app_settings set admin_email = em, updated_at = now() where id = 1;
  if not found then
    insert into public.app_settings (id, admin_email) values (1, em)
    on conflict (id) do update set admin_email = excluded.admin_email, updated_at = now();
  end if;
  select u.id into uid from auth.users u where lower(u.email) = em and u.email_confirmed_at is not null;
  update public.profiles set role = 'user' where role = 'admin' and id is distinct from uid;
  if uid is not null then
    update public.profiles set role = 'admin' where id = uid;
    if not found then
      insert into public.profiles (id, display_name, mode, role)
      values (uid, '', 'beginner', 'admin')
      on conflict (id) do update set role = 'admin';
    end if;
    return jsonb_build_object('ok', true, 'email', em, 'id', uid, 'status', 'promoted');
  end if;
  return jsonb_build_object('ok', true, 'email', em, 'id', null, 'status', 'reserved',
    'note', 'No CONFIRMED account with that email yet. Sign up, click the confirmation link, then run this again (or it happens automatically on confirmation).');
end;
$$;

-- Do not expose the admin address to every signed-in user (nothing in the app calls it).
revoke execute on function public.admin_email()                 from public, anon, authenticated;
revoke execute on function public.set_admin(text)               from public, anon, authenticated;
revoke execute on function public.promote_admin_on_confirm()    from public, anon, authenticated;
revoke execute on function public.handle_new_user()             from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- B. job_events: users could INSERT/UPDATE rows directly (any machine serial, any timestamps and
--    numbers, unlimited rows, NaN that poisons admin_usage_stats). Writes now only go through
--    log_job_event(), which validates, clamps and rate-limits.
-- --------------------------------------------------------------------------
drop policy if exists job_events_insert_own on public.job_events;
drop policy if exists job_events_update_own on public.job_events;
revoke insert, update, delete, truncate on public.job_events from public, anon, authenticated;
grant select on public.job_events to authenticated;

-- clean any rows already poisoned
update public.job_events set duration_s = null      where duration_s      is not null and (duration_s      = 'NaN' or duration_s      > 172800);
update public.job_events set cut_length_mm = null   where cut_length_mm   is not null and (cut_length_mm   = 'NaN' or cut_length_mm   > 100000000);
update public.job_events set part_count = null      where part_count      is not null and part_count > 100000;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'job_events_sane') then
    alter table public.job_events add constraint job_events_sane check (
      (duration_s is null or (duration_s >= 0 and duration_s <= 172800)) and
      (cut_length_mm is null or (cut_length_mm >= 0 and cut_length_mm <= 100000000)) and
      (part_count is null or part_count <= 100000) and
      (machine_serial is null or length(machine_serial) <= 64)
    ) not valid;
  end if;
end $$;

create or replace function public.log_job_event(
  p_status text,
  p_serial text default null,
  p_duration_s numeric default null,
  p_cut_length_mm numeric default null,
  p_part_count int default null,
  p_event_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  st text := lower(trim(coalesce(p_status, '')));
  ser text := left(upper(trim(coalesce(p_serial, ''))), 64);
  dur numeric := p_duration_s;
  len numeric := p_cut_length_mm;
  pc int := p_part_count;
  row public.job_events;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  if st not in ('started', 'finished', 'aborted') then
    raise exception 'Unknown job status.';
  end if;
  -- numbers are advisory statistics: anything absurd (or NaN) is dropped, never stored
  if dur is not null and (dur = 'NaN' or dur < 0 or dur > 172800) then dur := null; end if;
  if len is not null and (len = 'NaN' or len < 0 or len > 100000000) then len := null; end if;
  if pc is not null and (pc < 0 or pc > 100000) then pc := null; end if;
  -- only a serial the caller really owns may be recorded
  if ser <> '' and not exists (select 1 from public.machines m where m.serial = ser and m.owner = uid) then
    ser := '';
  end if;
  perform public.touch_last_active();

  if p_event_id is not null and st <> 'started' then
    update public.job_events e
       set status = st,
           ended_at = now(),
           duration_s = coalesce(dur, least(extract(epoch from (now() - e.started_at)), 172800)),
           cut_length_mm = coalesce(len, e.cut_length_mm),
           part_count = coalesce(pc, e.part_count),
           machine_serial = coalesce(nullif(ser, ''), e.machine_serial)
     where e.id = p_event_id and e.user_id = uid and e.status = 'started'
     returning * into row;
    if row.id is not null then
      return jsonb_build_object('ok', true, 'id', row.id);
    end if;
  end if;

  -- new row: rate limit (per user) so a client bug or a hostile script can't flood the table
  if (select count(*) from public.job_events j where j.user_id = uid and j.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many job events. Try again later.';
  end if;
  if (select count(*) from public.job_events j where j.user_id = uid) >= 20000 then
    raise exception 'Job log is full.';
  end if;
  if st = 'started' then
    insert into public.job_events (user_id, machine_serial, status, started_at, part_count, cut_length_mm)
    values (uid, nullif(ser, ''), 'started', now(), pc, len)
    returning * into row;
  else
    insert into public.job_events (user_id, machine_serial, status, started_at, ended_at, duration_s, cut_length_mm, part_count)
    values (uid, nullif(ser, ''), st, now(), now(), dur, len, pc)
    returning * into row;
  end if;
  return jsonb_build_object('ok', true, 'id', row.id);
end;
$$;
revoke execute on function public.log_job_event(text, text, numeric, numeric, int, uuid) from public, anon;
grant  execute on function public.log_job_event(text, text, numeric, numeric, int, uuid) to authenticated;

-- --------------------------------------------------------------------------
-- C. Cut presets feed cutting parameters: validate every field server-side (NaN, negative, absurd).
-- --------------------------------------------------------------------------
create or replace function public.admin_upsert_cut_preset(
  p_material text, p_thickness_mm numeric,
  p_pierce_delay_s numeric default null,
  p_pierce_height_mm numeric default null,
  p_cut_speed_mm_min numeric default null,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  mat text := left(trim(coalesce(p_material, '')), 80);
  notes text := left(coalesce(p_notes, ''), 200);
  row public.cut_presets;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if mat = '' or mat ~ '[[:cntrl:]]' or notes ~ '[[:cntrl:]]' then
    raise exception 'Material is required (no control characters).';
  end if;
  if p_thickness_mm is null or p_thickness_mm = 'NaN' or p_thickness_mm < 0.1 or p_thickness_mm > 100 then
    raise exception 'Thickness must be 0.1 to 100 mm.';
  end if;
  if p_pierce_delay_s is not null and (p_pierce_delay_s = 'NaN' or p_pierce_delay_s < 0 or p_pierce_delay_s > 10) then
    raise exception 'Pierce delay must be 0 to 10 s.';
  end if;
  if p_pierce_height_mm is not null and (p_pierce_height_mm = 'NaN' or p_pierce_height_mm < 0.5 or p_pierce_height_mm > 20) then
    raise exception 'Pierce height must be 0.5 to 20 mm.';
  end if;
  if p_cut_speed_mm_min is not null and (p_cut_speed_mm_min = 'NaN' or p_cut_speed_mm_min < 50 or p_cut_speed_mm_min > 15000) then
    raise exception 'Cut speed must be 50 to 15000 mm/min.';
  end if;
  insert into public.cut_presets (material, thickness_mm, pierce_delay_s, pierce_height_mm, cut_speed_mm_min, notes, updated_by, updated_at)
  values (mat, p_thickness_mm, p_pierce_delay_s, p_pierce_height_mm, p_cut_speed_mm_min, notes, auth.uid(), now())
  on conflict (material, thickness_mm) do update
    set pierce_delay_s = excluded.pierce_delay_s,
        pierce_height_mm = excluded.pierce_height_mm,
        cut_speed_mm_min = excluded.cut_speed_mm_min,
        notes = excluded.notes,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into row;
  return to_jsonb(row);
end;
$$;
revoke execute on function public.admin_upsert_cut_preset(text, numeric, numeric, numeric, numeric, text) from public, anon;
grant  execute on function public.admin_upsert_cut_preset(text, numeric, numeric, numeric, numeric, text) to authenticated;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cut_presets_sane') then
    alter table public.cut_presets add constraint cut_presets_sane check (
      thickness_mm between 0.1 and 100 and
      (pierce_delay_s is null or pierce_delay_s between 0 and 10) and
      (pierce_height_mm is null or pierce_height_mm between 0.5 and 20) and
      (cut_speed_mm_min is null or cut_speed_mm_min between 50 and 15000) and
      length(material) between 1 and 80 and length(notes) <= 200
    ) not valid;
  end if;
end $$;

-- If the admin has already confirmed, make sure the role is in place now.
select public.set_admin('jchappell2003@gmail.com');

notify pgrst, 'reload schema';
