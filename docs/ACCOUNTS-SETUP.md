# Accounts, parts and machine claims — setup for Josh

The website stays a static GitHub Pages site. Accounts, saved parts and machine
claims live in the **Supabase** project you already created:

- Project URL: `https://sjtjgumbsnakipkgskxt.supabase.co`
- Region: `eu-central-1` (Frankfurt)
- Email auth is on, with **Confirm email** turned on
- Site URL: `https://scriptsjc-cmyk.github.io/Plasma-table/`
- Redirect URL: `https://scriptsjc-cmyk.github.io/Plasma-table/**`

The publishable key and the legacy anon JWT are already in `js/config.js`.
Never put the **service_role** key in the website, in `js/config.js`, or on
the Pi. Only the public/anon key is used in the client. All permission rules
are enforced by Row Level Security and the SQL functions in
`supabase/schema.sql`.

Until the schema is applied (step 2), or whenever you open the site with
`?demo=1`, the app runs in a clearly labelled **local demo mode**: accounts
and parts stay in the browser, and the claim code `DEMO-0000` unlocks a
practice machine. Automated tests use `?test=1`, which also forces demo mode
so they stay offline.

## 1. Project — already done

The project, email provider, Site URL and redirect URL are in place. If you
later serve the site from the Pi at `http://plasma.local`, add that as a
redirect URL too. `http://localhost:*` and `http://127.0.0.1:*` are useful
when trying the site on a laptop.

## 2. Run the schema (still to do)

The tables have **not** been created yet. In the project open **SQL Editor**
→ **New query**, paste the whole of `supabase/schema.sql` and press **Run**.
It is a single script and is **safe to re-run** (it replaces functions and
policies; it does not drop tables or stored data).

This creates:

- `profiles` — display name, Beginner/Pro mode, `user` / `admin` role
- `parts` — each user's saved drawings
- `machines` — serial, hashed claim code, optional owner
- `claim_log` — every claim attempt (used for rate limiting and the admin log)
- a trigger that inserts a `profiles` row when someone signs up
- `claim_machine(...)` — the only way a user can link a table
- admin functions to add serials, unlink and transfer

Users can only read and write **their own** profile and parts. Machines can
only be claimed through the function (an already-claimed table is refused).
Claim codes are stored as a SHA-256 hash, never as plain text. The function
allows 8 tries per account per 15 minutes, and every try is logged.

After this has run, live sign-up against the project will work. Until then,
use `?demo=1` (or leave the tests to use `?test=1`).

## 3. Keys — already in `js/config.js`

`SUPABASE_URL`, the publishable key (`sb_publishable_…`) and the legacy anon
JWT are filled in. The REST Auth calls use the JWT form of the anon key
(the publishable key is what supabase-js v2 prefers). Leave the
**service_role** key out of the repo.

To go back to local demo on a machine that already has this build, open:

```
https://scriptsjc-cmyk.github.io/Plasma-table/?demo=1
```

## 4. Make yourself admin

Sign up once through the website (pick Beginner or Pro — you can switch later
in the Account menu). Because **Confirm email** is on, you will be asked to
open the link in your inbox, then come back and sign in. Then run this in
the SQL editor (change the email):

```sql
update public.profiles set role = 'admin' where id = (select id from auth.users where lower(email) = lower('jchappell2003@gmail.com'));
```

That one-liner also lives in `supabase/make-admin.sql`. Reload the site,
open **Account** — you should see an **Admin** button.

If the confirmation email does not arrive, check **Authentication → Users**
for the address, and the project's email rate limits (the free tier is
modest). The Account dialog has a **Resend the email** button.

## 5. Add your machine serials and claim codes

In the Admin page:

1. Type the serial (the one on the table / sticker).
2. Press **Generate** for a random one-off code (or type your own, at least 8
   characters). Codes look like `K7MQ-4NPD` (no 0/O/1/I, so they are easy to
   read off a sticker).
3. Add an optional note, then **Add / update machine**.
4. Write the serial and the claim code on the sticker **before** you close the
   dialog — the code is hashed as soon as it is saved and cannot be shown
   again. If a sticker is lost, generate a new code for the same serial
   (this also un-uses the old code).

You can also generate codes on your laptop without opening the site:

```
node scripts/gen-claim-codes.mjs 5
```

That prints five codes and, if you have `openssl`, the SHA-256 hashes (the
same hash the database stores). Unlink or **Transfer** from the same admin
page if a table changes hands.

## 6. What customers do

1. Open the site, **Create an account**, pick **Beginner** or **Pro**.
2. Check their email, open the confirmation link, then sign in.
3. Design and save parts — this is free, including without a machine. They can
   switch Beginner/Pro later under Account → Save settings.
4. When the table arrives they tap **Link a machine** and type the claim code
   from the sticker (the serial is optional).
5. **Connect**, jog, **Send** and **Start cutting** then unlock.

### Gating choice

| Action                    | Without a linked machine | With a linked machine |
| ------------------------- | ------------------------ | --------------------- |
| Design, CAM preview, save | Allowed                  | Allowed               |
| Download G-code           | **Allowed**              | Allowed               |
| On-screen “Try the demo”  | Allowed (nothing moves)  | Allowed               |
| Connect / jog / Send / Run (real USB or Wi-Fi Pi) | Locked, with “Link your machine to run jobs” | Allowed |

Download G-code stays free so someone can still take a file to another
controller. To lock export as well, set `ALLOW_GCODE_EXPORT_WITHOUT_MACHINE`
to `false` in `js/config.js` and reload. That is the only switch.

## 7. Real enforcement (because the website is public)

The lock on the buttons is only a courtesy — anyone can change the JavaScript.
The Pi bridge can enforce it for **Wi-Fi** connections:

1. Create `pi/bridge.account.json` on the Pi (see `pi/README.md`) with this
   table's serial, the project URL and the **anon JWT** (the `eyJ…` value in
   `js/config.js`, not the service_role key).
2. Restart the bridge. It keeps requiring the usual pairing token, and also
   checks the user's session and that `machines.owner` matches this serial
   **before it will accept G-code**.

### Pro and firmware limits on the server (`supabase/b5-gating.sql`)

Run **`supabase/b5-gating.sql`** once in the Supabase SQL editor (Dashboard → SQL Editor → New query → paste the file → Run).
It is safe to run twice, needs no secret key, and changes nothing for anyone today. It adds:

- `profiles.pro_allowed` (default true). If you ever set it to false for someone, the server puts their mode back to Beginner on every
  write and the app shows Beginner. Users cannot change this column.
- `my_entitlements()`: the server's own answer to "may this account use Pro / firmware tools?" (admin, or Pro allowed; firmware also
  needs a linked machine). The app uses it instead of what the browser stored and asks again right before a firmware write.

Until you run it the app works as before and **Admin** says "Pro and firmware limits are only checked in this browser".
After you run it and reload, Admin says "…enforced by the server". The machine itself still trusts anyone on its own network, so keep
the Wi-Fi password, the Pi pairing token and the table's STOP as your real protection there.

### Direct USB (Web Serial)

When the laptop is plugged straight into the controller there is **no server
in the middle**. The app still hides Connect / Run / Jog until a machine is
linked, but a modified copy of the page can talk to the serial port anyway.
Mitigations, for later if you want them:

- A small firmware (or grblHAL) setting that refuses motion until it is given
  a short unlock token the app would only request after a successful claim.
- Store the table serial in firmware / EEPROM and have the app refuse to send
  jobs unless the live serial matches a claimed one (still bypassable, but it
  raises the bar).
- Prefer the Wi-Fi Pi path for customer machines, where the check above is
  actually enforced.

## 8. Parts: offline, sync, first login

- The existing local autosave (`plasma.sketch`) still runs with or without an
  account, including offline.
- Once signed in, **Save to account** (or **Save current drawing** in the
  Account menu) writes to Supabase, or to this browser in demo mode.
- If the same part was edited in two places, you get last-write-wins plus a
  **Keep both** option (the device copy is saved under “name (device)”).
- The first time someone signs in on a device that already has a drawing, they
  are asked whether to add it to the account.

## 9. Self-hosting later

Supabase is open source. If you outgrow the free hosted tier, you can run
the same schema on your own Postgres with [self-hosted Supabase](https://supabase.com/docs/guides/self-hosting)
and point `SUPABASE_URL` at it. No licence fee, and you keep the data.

## Checklist

- [x] Project created (region `eu-central-1`)
- [x] Site URL and redirect URLs set for GitHub Pages
- [x] Email auth on, Confirm email on
- [x] `js/config.js` has the Project URL, publishable key and anon JWT (no service_role key)
- [ ] `supabase/schema.sql` ran cleanly in the SQL Editor
- [ ] Your account (`jchappell2003@gmail.com`) exists, is confirmed, and is the only admin (`supabase/make-admin.sql`, or `select public.set_admin('jchappell2003@gmail.com');`). Then run `supabase/admin-powers.sql` after `schema-fixes.sql` if those have not been applied yet, and then `supabase/admin-powers-fixes.sql` (idempotent; a fresh `schema.sql` already contains all of it). The admin account must have a **confirmed** email: `is_admin()` is false until it is.
- [ ] Five (or however many) serials added, codes written on the stickers
- [ ] Optional: `pi/bridge.account.json` on each Pi
