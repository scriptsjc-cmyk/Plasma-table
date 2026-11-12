-- user-prefs.sql: sync "Make it yours" and Cut panel layout with the signed-in account (r7 J14).
-- IDEMPOTENT: safe to run more than once. Run it ONCE in the Supabase SQL Editor
-- (Dashboard -> SQL Editor -> New query -> paste this file -> Run), AFTER schema.sql
-- (and its fixes) are already applied. Needs only the SQL editor: never the service_role / secret key.
--
-- Until you run it the app keeps working exactly as before: preferences stay in this browser
-- (plasma.yours.v1.<userId>). After you run it, the same choices follow the account across devices.
-- The app degrades gracefully if this file has not been applied (a missing column is ignored, never shown as an error).
--
-- What it does
--   1. public.profiles.prefs (jsonb, default {}). The existing profiles row-level security already
--      lets a signed-in user read and update only their own row (admins may also read/update, as they
--      already can for display_name and mode). No new admin bypass and no service_role key.
--   2. A size cap: octet_length(prefs::text) must stay under 32 KB.
--   3. Column grant: API users may UPDATE prefs (in addition to display_name and mode). They still
--      cannot change role, id, or any other column.
--
-- Honest limit: until this SQL has been applied, nothing is stored in the cloud.

alter table public.profiles
  add column if not exists prefs jsonb not null default '{}'::jsonb;

alter table public.profiles drop constraint if exists profiles_prefs_size;
alter table public.profiles
  add constraint profiles_prefs_size
  check (octet_length(coalesce(prefs, '{}'::jsonb)::text) < 32768);

-- Additive: keeps the existing display_name / mode grant, and allows prefs.
grant update (display_name, mode, prefs) on public.profiles to authenticated;

notify pgrst, 'reload schema';
