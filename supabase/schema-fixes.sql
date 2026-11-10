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
