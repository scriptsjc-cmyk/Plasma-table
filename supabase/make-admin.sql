-- Make one account an admin (run in the Supabase SQL Editor after that person has signed up).
-- Replace the email, then run:
update public.profiles set role = 'admin' where id = (select id from auth.users where lower(email) = lower('you@example.com'));
