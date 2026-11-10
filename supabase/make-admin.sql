-- Make jchappell2003@gmail.com the only admin.
-- Run this in the Supabase SQL Editor AFTER that account has signed up.
-- It demotes any other admin and refuses any other email.
select public.set_admin('jchappell2003@gmail.com');
