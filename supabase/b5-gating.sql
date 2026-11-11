-- b5-gating.sql: server-side Pro / firmware gating (batch 5, item 26).
-- IDEMPOTENT: safe to run more than once. Run it ONCE in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query -> paste -> Run),
-- AFTER schema.sql (and its fixes) are already applied. Needs only the SQL editor: never the service_role / secret key.
-- Until you run it the app keeps working exactly as before (it falls back to the old browser-side check and says so in Account -> Admin).
--
-- What it does
--   1. profiles.pro_allowed (default true, so NOTHING changes for anyone today). If you set it to false for a user, the server
--      forces that user's mode back to 'beginner' on every write (even a hand-made API call) and the app shows Beginner.
--      API users cannot change pro_allowed: the existing column grant only lets them edit display_name and mode.
--   2. public.my_entitlements(): the server's own answer to "what may I use?", worked out from the signed-in user's token:
--        role (admin/user, admin only if is_admin() agrees), mode, pro (admin, or mode=pro and pro_allowed),
--        firmware (admin, or pro AND at least one linked machine), machines (count).
--      The app uses this instead of trusting what the browser stored, and refreshes it before any firmware write.
--
-- Honest limit: FluidNC / the controller take commands straight from the LAN or USB, so nothing on the server can physically stop
-- someone who is on the table's own network. This protects what the server holds (the Pro flag, the admin role, machine ownership)
-- and gives the app a trustworthy answer; it does not replace the machine's own protections (STOP, Wi-Fi password, the Pi token).

alter table public.profiles add column if not exists pro_allowed boolean not null default true;

-- ---- 1. Pro can only be on for users who are allowed it --------------------------------------------------------------------
create or replace function public.tg_enforce_pro()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r text := case when tg_op = 'UPDATE' then old.role else new.role end;   -- never trust a role the client sent
begin
  if new.mode = 'pro' and not new.pro_allowed and r <> 'admin' then
    new.mode := 'beginner';
  end if;
  return new;
end;
$$;

-- named so it fires before profiles_protect / profiles_touch (triggers run in name order)
drop trigger if exists profiles_enforce_pro on public.profiles;
create trigger profiles_enforce_pro
  before insert or update on public.profiles
  for each row execute function public.tg_enforce_pro();

-- anyone already switched off but still on Pro (nobody is today) is put back to Beginner now
update public.profiles set mode = 'beginner' where mode = 'pro' and not pro_allowed and role <> 'admin';

-- ---- 2. The server's answer to "what may I use?" ---------------------------------------------------------------------------
create or replace function public.my_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  p public.profiles;
  adm boolean;
  n int;
  is_pro boolean;
begin
  if uid is null then
    return jsonb_build_object('server', true, 'signed_in', false, 'role', 'user', 'mode', 'beginner', 'pro', false, 'firmware', false, 'machines', 0);
  end if;
  select * into p from public.profiles where id = uid;
  adm := public.is_admin();
  select count(*) into n from public.machines m where m.owner = uid;
  is_pro := adm or (coalesce(p.mode, 'beginner') = 'pro' and coalesce(p.pro_allowed, true));
  return jsonb_build_object(
    'server', true,
    'signed_in', true,
    'role', case when adm then 'admin' else 'user' end,
    'mode', case when adm then coalesce(p.mode, 'beginner') when is_pro then 'pro' else 'beginner' end,
    'pro', is_pro,
    'firmware', adm or (is_pro and n > 0),
    'machines', n
  );
end;
$$;

revoke execute on function public.my_entitlements() from public, anon;
revoke execute on function public.tg_enforce_pro()  from public, anon, authenticated;
grant  execute on function public.my_entitlements() to authenticated;

notify pgrst, 'reload schema';

-- ---- Optional, only if you ever want to switch Pro off for one person (never needed today) ---------------------------------
--   update public.profiles set pro_allowed = false where id = (select id from auth.users where lower(email) = lower('someone@example.com'));
-- and to give it back:
--   update public.profiles set pro_allowed = true  where id = (select id from auth.users where lower(email) = lower('someone@example.com'));
