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
