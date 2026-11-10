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
