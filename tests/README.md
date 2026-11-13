# Tests (unit + end-to-end, one command)

    cd tests && npm install          # once (playwright, axe-core, ws). Needs node, google-chrome and python3 on PATH
    npm test                         # everything: unit, then end-to-end   (= node run-all.mjs)
    npm run test:unit | test:e2e     # one group
    node run-all.mjs 20 55 03        # only the suites with these numbers (unit/03_*, e2e/20_*, ...)
    JOBS=3 node run-all.mjs          # suites in parallel (default 2: each opens its own Chrome, so keep it modest)
    SITE_DIR=/path/to/copy node run-all.mjs 49    # test another copy of the site (default: the repo root)

Every suite prints `<name>: <passed>/<total> passed, <failed> failed` and exits non-zero on a failure or a crash. The runner prints a
table and a TOTAL; logs are in `tests/results/`, screenshots in `tests/screenshots/` (both git-ignored).

## Layout

| path | what |
|---|---|
| `run-all.mjs` | the runner (the only entry point you need) |
| `unit/NN_*.mjs` | pure logic and structure, no browser: expressions, shapes/G-code, variants, Pro tools, fuzzing, job import, accounts (demo store), admin powers, UX helpers, and **`90_module_graph`** (header comments, unique names, imports resolve, no cycles, no orphans) |
| `e2e/NN_*.mjs` | Playwright + Chrome against a local static server of the repo (table below). `_cf_helpers.mjs` is shared by 56 |
| `lib/` | the one shared harness: `browser.mjs` (server, pages, profiles, practice-table helpers), `site.mjs` (finds modules **by file name**, so moving a module never breaks a test), `t.mjs` (check recorder), `env.mjs` (loads modules in node with a fake DOM), `analyze.mjs` / `verify.mjs` (G-code analysis), `r2compat.mjs` (helpers some older suites use) |
| `data/` | sample drawings and fixtures |

Safety: everything runs against a local static server. Accounts are the browser-only **demo** store (`?demo=1`, claim code `DEMO-0000`) or
Playwright `route` stubs for the Supabase host; the live project, its keys, SQL and every real machine are never touched. The "cloud" parts
(50, 62) use a fake origin and a mocked Supabase, so they need **no credentials** and nothing to skip.

`window.plasmaTest` exists only on localhost with `?test=1`; the sign-in gate is bypassed there unless `&gate=1`.

## End-to-end suites

| suite | covers |
|---|---|
| 10 ui_functional | menu -> Make -> shapes, Beginner/Pro (Make only), type-in sizes, cut check, G-code export |
| 11 huge_values_crash | absurd sizes/counts do not hang or crash |
| 12 inspector | the Pro inspector panel and its validated API |
| 20 demo_job_safety | real jobs on the practice controller, every byte analysed: torch pairing, STOP button and Space, Esc never stops, E-stop, hold-to-release, work zero cleared by STOP/Home/unlock |
| 22 stop_overlay | the STOP button above every overlay and dialog |
| 30 security | XSS, hostile files, CSP, no secrets, test hook only on localhost |
| 40 layout_a11y | 7 viewports x (make, menu, cutting screen): no overflow, tap targets, STOP size; axe-core; slow network; offline reload via the service worker |
| 41 accounts | demo accounts: sign up/in through the gate, claim, save/load parts |
| 45 admin_powers | admin tools (demo admin) |
| 46 edit_edge | edge editing on drawn outlines |
| 47 / 48 / 49 | UX2, modes, round-4 flow (gate, menu, one cutting screen, E-stop) |
| 50 accounts_security | live host + demo, cloud mode with stubbed Supabase, forged flags, shared device, CSP, secrets |
| 52 bug_regressions | fixed bugs from earlier batches (part counts, import errors, first-job practice, operator row, hover/pointer rows, ...) |
| 53 cad_parts | the CAD part library, hole patterns, ducts, packing (313 checks) |
| 55 r5_safety | round-5 safety group: hold-to-release, latch blocks, work zero, Space = STOP, STOP only on the cutting screen, Score/Mark block Start |
| 56 cut_features | live torch/arc panel + lost-arc resume, 9-point job origin offsets, saved start points, cut-test coupon, pierce counter |
| 57 layout_lock | the sheet layout / Bed & start only PLACES parts: every shape-or-size route is refused; dragging, turning, copies, delete, Arrange, Nest and the origin still work |
| 58 text_trace_nest | Add text, Trace a picture, true-shape nesting (numeric no-overlap / min-distance checks), saved remnants |
| 59 hardening_sw_csp | gating, CSP, service worker precache (every js and css file is listed), atomic install, offline reload |
| 62 admin_security | console filter, restore validation, announcements XSS, STOP above admin dialogs, live-origin gating, job_events (cloud, mocked), phone edge edit |
| 69 phone_cut | the phone cutting screen (844x390, 390x844, 320x568, 750x340): STOP the largest button by area, Pause / progress / X-Y / TORCH in view while cutting, the More sheet (dialog, focus, Escape, controls moved back), banners never covered, no page scroll; none of it on the laptop |
| 70 laptop_cut | the laptop cutting screen (1366x768, 1440x900, 1920x1080, mouse): bed picture big in the middle, STOP the largest control and in view, Start / Start here / checklist in view on Bed & start, Pause / progress / X-Y-Z / TORCH / speed in the right-hand panel while cutting, the job and machine card, banners and toasts clear, no page scroll, light and dark contrast; phones and touch tablets unchanged |
| 71 laptop_cad | laptop Make: side panels, shortcuts, type-while-drawing, snaps, layers, CAD mouse, Preset parts browser, no auto full screen, phone sideways hint |
| 72 make_header | Make a part: Undo / Redo / Fit / Delete sit in the header next to the title (not over the canvas) on laptop and phone, Simple and Advanced; Advanced has one parts list and a way to view all; Customise toolbar (add / remove / reorder, saved, reset); no machine or edge status on the drawing screen |
| 74 r7_cut | r7 Cut screen: the laptop top bar; panels swap and resize (dividers, Layout, Reset, saved per user) with STOP fixed and the bed at least 36% wide; "Cut starts here" follows the part; arrow keys move the torch; one safety tick box; no overlaps or wrapped labels at 1366x768 and 1440x900; Show me links; Stopped chip; link lost; Space in a number box; h1 and announced banners; practice without the homing question; phone on its side signed in: one header row, short Bed & start, sheet size in More; upright: the turn cover leaves Menu and STOP clear |

Coverage note: three older suites that drove UI flows which no longer exist (the old recent-jobs list, the Move tab, the early demo button flow)
were retired during the tidy-up; their still-relevant checks live in 52 and 55.

Known app bugs that tests report as `KNOWN` instead of failing: see `KNOWN-BUGS.md` (none open at the moment).
