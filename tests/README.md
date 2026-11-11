# End-to-end tests (Playwright + Chrome, no build step)

    cd tests && npm install          # once (playwright). Needs google-chrome and python3 on PATH
    ./run-e2e.sh                     # every suite;  ./run-e2e.sh 20 55  for some
    SITE_DIR=/path/to/another/build ./run-e2e.sh 49

Safety: everything runs against a local static server of the repo root. Accounts are the browser-only **demo** store (`?demo=1`, claim code `DEMO-0000`) or
Playwright `route` stubs for the Supabase host; the live project, its keys, SQL and every real machine are never touched. The "cloud" parts (50, 62) use
a fake origin (`https://fake-live.example`, `https://plasma-live.test`) and a mocked Supabase, so they need **no credentials** and nothing to skip.

`window.plasmaTest` exists only on localhost with `?test=1`; the sign-in gate is bypassed there unless `&gate=1`.

| suite | covers |
|---|---|
| 10 ui_functional | menu -> Make -> shapes, Beginner/Pro (Make only), type-in sizes, cut check, G-code export |
| 11 huge_values_crash | absurd sizes/counts do not hang or crash |
| 20 demo_job_safety | real jobs on the practice controller, every byte analysed: torch pairing, STOP button and Space, Esc never stops, E-stop, hold-to-release, work zero cleared by STOP/Home/unlock |
| 30 security | XSS, hostile files, CSP, no secrets, test hook only on localhost |
| 40 layout_a11y | 7 viewports x (make, menu, cutting screen): no overflow, tap targets, STOP size; axe-core on every round-4 screen; slow network; offline reload via service worker |
| 41 accounts | demo accounts: sign up/in through the gate, claim, save/load parts |
| 45 admin_powers | admin tools (demo admin) |
| 46 edit_edge | edge editing on drawn outlines |
| 47/48/49 | UX2, modes, round-4 flow (gate, menu, one cutting screen, E-stop) |
| 50 accounts_security | live host + demo, cloud mode with stubbed Supabase through the sign-in gate, forged flags, shared device, CSP, secrets, STOP position |
| 55 r5_safety | round-5 safety group (92 checks): hold-to-release, latch blocks, work zero, Space = STOP, STOP only on the cutting screen, Score/Mark block Start |
| 62 admin_security | console filter, restore validation, announcements XSS, STOP above admin dialogs, live-origin gating, job_events (cloud, mocked), phone edge edit |

Known app bugs that tests report as `KNOWN` instead of failing: see `KNOWN-BUGS.md`.
