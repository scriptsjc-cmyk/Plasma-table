# Architecture

A static web app: `index.html` + ES modules in `js/` + CSS in `css/`, no build step. It runs the operator screen for a plasma
table (FluidNC / grblHAL), entirely in the browser. This file is the map: where things live, how data flows, which safety rules are
enforced where, how it is deployed and how to test it. Keep it up to date when you add or move a module.

## 1. The five-minute tour

```
index.html ── js/sw-register.js          registers sw.js (offline cache)
           ── js/app.js  (module)        the entry point: init() wires everything, bind() binds the controls
           ── js/ui/inspector-ui.js      Pro inspector panel (reads the API app.js hands it)
```

Screens (`body[data-screen]`): `boot → login → menu → make | cut`.

* **Make a part** (`make`): draw / add shapes, text, a traced picture or a DXF/SVG; edit sizes. Everything lives in one `Sketch`.
* **Cutting** (`cut`), steps: 1 *Part* (file or "Add parts"), 3 *Bed & start / Get set up* (lay the parts on the sheet, start point,
  checks; **placing only**, the layout lock refuses any shape/size edit there), 4 *Cut* (live status, pause, STOP).
* `window.plasmaTest` (localhost + `?test=1` only) is the test handle: state `S`, the sketch, `showScreen`, `goStep`, `sendToCutting`, …

## 2. Folder map (`js/`)

Every module starts with a comment saying what it is for. File names are **unique across folders** (tests and docs find modules by
name; `tests/unit/90_module_graph.mjs` enforces it).

| folder | holds | may import from |
|---|---|---|
| `core/` | pure helpers shared by everything: geometry, expressions, DOM helpers, the one shared state `S`, the hooks registry | `core/` only |
| `machine/` | talking to the controller and keeping the torch safe: GRBL/FluidNC links, the simulator, the `Machine` model, safety limits, console filter, settings, connection, jog, panels | `core/`, `machine/`, `account/` (gating) |
| `make/` | Make a part: shape catalogue, the `Sketch` editor (split over several files), DXF/SVG/text/trace import, the Make-screen forms and tools | `core/`, `make/`, and `cut/`, `ui/` for the few places that start a cut |
| `cut/` | CAM and the cutting screen: G-code generation, job building, cut check, nesting, set-up, preview, checklist, start/pause buttons | `core/`, `machine/`, `make/`, `ui/` |
| `ui/` | screen plumbing: navigation and steps, mode (Beginner/Pro), the big `refresh()`, why-is-it-off tips, version banner, icons, the Pro inspector | everything below |
| `account/` | sign-in, saved parts, machine claims, admin dialogs; backend is Supabase (publishable key only) or a browser-only demo store | `core/`, `account/` |
| (root) | `app.js` entry, `sw-register.js`, `version.js` (stamped at deploy) | everything |

### How modules talk to each other

1. **Shared state**: `core/state.js` exports `S` (jog step, status, job, material, thickness, …) plus live references
   (`M` the machine, `sketch`, `CFH`, `inspectorApi`, `makeTools`) with setters used once by `init()`. ES bindings are live, so other
   modules always see the current value.
2. **Imports go downwards.** The import graph has **no cycles** (checked by a test). Where a low-level module must call something
   higher up (for example any module asking for `refresh()`), it imports a forwarding function from `core/hooks.js`;
   `app.js` registers the real functions once with `provide({...})`. There are 13 hooks today; add one only when an import would
   otherwise be circular.
3. **Injected hosts**: older self-contained modules (`cut/setup.js`, `cut/cutfeatures-ui.js`, `ui/host.js` users, `account-ui`,
   `machine/settings.js`, `ui/flow.js`, `ui/inspector-api.js`) get what they need from the app through an `init…({...})` call in
   `app.js`. They never import app modules.
4. **Big classes are split by area** with a tiny mixin: `make/sketch.js` is the `Sketch` class core; `sketch-geom/edit/view/edge/input`
   hold the rest of its methods and `mixin(Sketch, …)` joins them; `sketch-lock.js` installs the layout lock last.

## 2b. Stylesheets (`css/`)

Eight plain files, linked from `index.html` **in this order** (later files win ties, so the order is part of the design; each file's
header says what it holds and which rules must stay in cascade order): `tokens.css` (colours, type, spacing variables), `base.css`
(resets, utilities, buttons, forms), `layout.css` (app shell, step grid, stepper, nav bar), `components.css` (dialogs, keypad, jog pad,
chips, lists), then one file per screen: `screen-signin-menu.css`, `screen-make.css`, `screen-cut.css`, `screen-admin.css`.
Put a new rule in the file of the screen it styles; a new colour or size becomes a token. A new `css/*.css` file must be linked in
`index.html`; the offline list picks it up by itself.

## 3. Data flow

```
file / shape form / text / trace ──► Sketch (items: shapes with params, holes, ops, positions)         make/sketch*.js
                                       │  useShape()                                                  make/useshape.js
                                       ▼
                                  S.design  (closed outlines, mm)   ◄── DXF/SVG: make/dxf.js, make/svg.js, make/editable.js
                                       │  loadJob()                                                    cut/prepare.js
                                       ▼
        cam.js: designToGcode ─► job.js: prepared job (lines, plan, summary) ─► check.js: cut check ─► S.prepared, S.check
                                       │  Start (blocked unless cut/checklist.js blockers() is empty)
                                       ▼
                       machine/machine.js  Machine.startJob(): safety rules, zero rule, latch
                                       │
                       machine/grbl.js protocol over usbserial.js (USB) | wifi / fluidnc.js (WebSocket) | sim.js (practice table)
                                       │  status, events
                                       ▼
                    machine/events.js onStatus/onEvent ─► ui/refresh.js refresh() ─► DOM
```

`refresh()` is the one repaint: after any state change call it (through `core/hooks.js` from low-level code).

## 4. Safety rules and where they are enforced

The browser UI is never the only guard: the same rule is also enforced in the model, and in the database for accounts.

| rule | enforced in |
|---|---|
| Torch stays inside the machine envelope; limits/edges | `machine/safety.js`, `Machine.startJob` and `Machine.command` (`machine/machine.js`), `cut/check.js` |
| **E-stop latch**: while latched, motion/torch commands, console M3/M4/moves and `startJob` are refused; release = press-and-hold 1.5 s; Space is the one STOP key (Esc never stops) | `ui/flow.js` (UI latch + `estopOn`), `machine/machine.js` (`M.estopProvider`, `LATCH_BLOCKED`) |
| **Work zero** must be confirmed to start; cleared by STOP/reset/home/unlock/alarm/restart; releasing the E-stop does not restore it | `machine/machine.js` (`zeroConfirmed`; `S.zeroSet` is a getter/setter onto it) |
| Score / Mark can't be cut on a torch that only switches on/off | `cut/checklist.js` (`scoreMarkProblem` → `blockers()`), `Machine.startGuard`; Download G-code refuses too (`cut/export.js`) |
| Start is blocked while the checklist has a blocker; a DOM poke cannot bypass the disabled button | `cut/checklist.js` `blockers()`, re-checked in `cut/run.js` Start handler |
| Console accepts only a short allow-list (`$$ $I $G $X $H $C $n=value`, a few safe G-codes); never M3/M4, `$RST`, `$N`, … | `machine/admin-machine.js` `filterConsoleCommand`, applied by the model itself (`Machine.command` console branch in `machine/machine.js`) and by `machine/console.js`, the admin console and the `$` editor; the list is in `docs/FLUIDNC.md` |
| The sheet layout only places parts; every shape/size route is refused there (handles, inspector, keys, 27 Sketch mutators) | `make/sketch-lock.js` (`this.layout` guards + prototype wrappers) |
| Machine control needs a signed-in account with a linked machine (live origins only; demo/test hooks don't arm real control) | `machine/access.js`, `account/acctstate.js` (`realControlAllowed`, `canPro`, `canFirmware`), server side `supabase/schema.sql` + `b5-gating.sql` (RLS, `profiles_enforce_pro`) |
| No secret in the client: only the **publishable** key; never the `service_role` key | `account/config.js`, scanned by `tests/e2e/50`, `59`, `unit/07` |
| CSP: no inline scripts, no `ws:` on the public https copy | `index.html` (repo copy keeps `ws:` for LAN use), `scripts/harden-csp.sh` (deploy only) |
| Pi / FluidNC console, restore and announcements are validated and escaped | `machine/admin-machine.js`, `account/announceui.js`, tests 62/30 |

## 5. Deploy, version stamp and the offline cache

* GitHub Pages runs from `.github/workflows/pages.yml` (workflow mode): checkout → `./scripts/stamp-version.sh` → `./scripts/harden-csp.sh`
  → upload `.`. There is no build step and no separate "stamp" commit.
* `scripts/stamp-version.sh` writes `version.json`, `js/version.js`, the service-worker cache name and the **precache list** in `sw.js`
  (between `/* precache:start */` and `/* precache:end */`). The list is built from what exists: `index.html`, **every
  `css/**/*.css`**, **every `js/**/*.js`** (any depth), icons, manifest and config. A new or moved file is picked up automatically.
  After adding or moving a module just run `./scripts/stamp-version.sh` locally if you want to see it; the deploy does it anyway.
* `sw.js`: atomic install (a broken release never half-installs), per-release cache, network-first, `version.json` never cached for
  online use. `ui/about.js` shows the "new version" banner only when `version.json` changes after the page loaded.
* Details: `docs/DEPLOY-STAMP.md`. Accounts backend setup: `docs/ACCOUNTS-SETUP.md`. FluidNC: `docs/FLUIDNC.md`.

## 6. Tests

All tests live in `tests/` (see `tests/README.md`): `cd tests && npm install && npm test`.
`tests/unit` = pure logic and structure checks (`90_module_graph` guards this document's folder rules); `tests/e2e` = Playwright + Chrome
against a local server, using the practice (simulated) controller and mocked Supabase — no real machine or backend is ever touched.
Tests find modules by file name (`tests/lib/site.mjs`), so moving a module between folders never breaks a test.

## 7. Adding or changing things

* **New module**: put it in the folder of its layer, start it with a one-line comment, keep the name unique, import only downwards.
  If it needs something from `app.js`, add an `init…({…})` host or a hook (last resort). Wire it in `app.js` (`init()`/`bind()`).
* **New control in `index.html`**: bind it in the `bind…()` function of the module that owns the screen area (each area exports one).
* **New style**: add it to the `css/` file of its screen (see 2b); a new file also needs its `<link>` in `index.html`, in cascade order.
* **New safety rule**: enforce it in `machine/machine.js` (or `safety.js`) as well as in the UI, and add a check to a `tests/e2e/5x` suite.
* **Moving files**: nothing hard-codes folders except `index.html` (`js/app.js`, `js/sw-register.js`, `js/ui/inspector-ui.js`) and the
  imports; run `node tests/unit/90_module_graph.mjs`.

## 8. Gotchas (learned the hard way)

* The shape form rebuilds on `change` (blur), so a click straight from one input to another can lose the first click; tests press Tab
  between fills.
* `window.ptInspector` is also the DOM element `<aside id="ptInspector">` (named access): check `.getCut`, not truthiness.
* A "Part" count has one source: `sketch.partCounter` → `sketch.partTotal()`.
* Sheet items count as one part (`Setup.unitsOf` works per item); a hole not in `sk._seen` with a host is skipped.
* `git pull --rebase` with a merge commit in local history replays the merged branch: use plain `git pull` / `git push`.
* Hard-coded folder names in tests break on a move: use `tests/lib/site.mjs` (`mod`, `readJs`, `allJsText`, page-side `window.__J`).

## 9. Module reference

Line counts are approximate. Regenerate the table's descriptions from each file's first comment line when you add a module.

### `js/`

| file | lines | what it is |
|---|---:|---|
| `app.js` | 346 | Plasma table operator screen (browser version): the entry point. |
| `sw-register.js` | 16 | Registers the offline cache (sw.js). Lives in its own file because the page's CSP does not allow inline scripts. |
| `version.js` | 4 | The release this copy belongs to (rewritten by the deploy stamp; version.json is the live truth). |

### `js/core/`

| file | lines | what it is |
|---|---:|---|
| `dom.js` | 29 | Tiny DOM and text helpers used everywhere: $ / $$, esc, clock, toast. |
| `expr.js` | 58 | Safe numeric expressions for the size keypad: 100/2, 50+12.5, 80-5, 25*4, (30+10)/2 |
| `geom.js` | 428 | 2D geometry helpers for the CAD import and shape maker. |
| `hooks.js` | 18 | Late-bound calls. A few low-level modules need to call something that lives in a higher layer (for example refresh()). |
| `state.js` | 18 | The one shared state object, plus the few live references init() fills in (machine, sketch, ...). |

### `js/machine/`

| file | lines | what it is |
|---|---:|---|
| `access.js` | 32 | Machine access rules: send a command only when allowed (signed in, machine linked, not e-stopped). |
| `admin-machine.js` | 414 | Admin-only Advanced Machine panel: GRBL `$` settings, firmware text, the filtered console (`filterConsoleCommand`). |
| `connection.js` | 143 | Connect / disconnect (USB, Wi-Fi, FluidNC, demo), keep-awake, and the unload safety stop. |
| `console.js` | 42 | The controller console pane: the log lines and the typed-command box. |
| `dialect.js` | 94 | Turn the app's prepared GRBL/grblHAL job into another controller dialect. |
| `events.js` | 104 | Reacts to everything the machine reports: status, safety flags, events, job log entry. |
| `fluidnc.js` | 142 | FluidNC over Wi-Fi: a raw GRBL-compatible WebSocket (default ws://host:81). |
| `grbl.js` | 390 | The GRBL text protocol for every link (FluidNC / grblHAL): streaming, status poll + watchdog, connect handshake, the Pi Wi-Fi transport. |
| `jog.js` | 107 | Jogging: on-screen pad, arrow keys, hold-to-glide; and the position read-out. |
| `machine.js` | 338 | `Machine`: ties the controller link, job builder and safety checks together; E-stop latch, work-zero rule, start guard. |
| `panels.js` | 143 | Machine panels on the Get set up screen: edge/limits panel, controller settings backup, test patterns, command buttons. |
| `safety.js` | 118 | Keeping the torch inside the machine (same rules as plasma/safety.py). |
| `settings.js` | 412 | Settings menu: machine, speeds, torch, pierce/cut, materials, homing, I/O, backup/restore. |
| `sim.js` | 238 | Demo mode: a pretend grblHAL controller in the browser (same as plasma/sim.py). |
| `usbserial.js` | 115 | USB to the controller (Web Serial, Chrome/Edge desktop): opens the port at 115200 8N1, reads lines, notices an unplug. |

### `js/make/`

| file | lines | what it is |
|---|---:|---|
| `cad.js` | 66 | CAD dialog (trim, offset, ...) and the Pro command runner. |
| `dimedit.js` | 123 | Click a dimension on the drawing to type a new size (with Tab / arrows), plus the old number pad. |
| `duct.js` | 95 | Flat patterns for sheet-metal transitions (pure maths, no DOM, so it can be unit-tested in node). |
| `dxf.js` | 203 | Read 2D shapes from a DXF file (ASCII DXF from Fusion 360, FreeCAD, Onshape, ...). |
| `editable.js` | 151 | Turn imported DXF/SVG outlines (many short segments) into editable shapes: lines and arcs. |
| `files.js` | 201 | Opening, adding and replacing files; drag and drop; start over; edit-drawing and resize. |
| `fontdata.js` | 4 | Single-line (Hershey) letter shapes for the text tool. Characters ! to ~ (code 33 to 126); each is [stroke path, advance]. |
| `library.js` | 95 | The shape library, the shape-versions pop-up and the Add text / Trace tool launchers. |
| `maketools.js` | 211 | Make a part: "Add text" and "Trace a picture". Two small dialogs on top of the engines in textshape.js and trace.js. |
| `protools.js` | 46 | Pro tools: full-screen drawing, the tool buttons and their state. |
| `quickbar.js` | 125 | The Pro quick bar: search palette and its actions. |
| `shape-helpers.js` | 72 | Small geometry helpers shared by the shape definitions (moved out of shapes.js unchanged). |
| `shapeform.js` | 243 | Make a part: beginner shape tiles, the guide, and the size/position form for the selected shape. |
| `shapes-fab.js` | 248 | More ready-made fabrication parts (round 5): complete parts with every size adjustable. |
| `shapes.js` | 625 | Shape maker: common plasma parts from a few sizes. Each shape returns contours (mm). |
| `sizecheck.js` | 70 | Size check after a DXF/SVG import: shows the size and asks before scaling (inches vs mm). |
| `sketch-edge.js` | 383 | Sketch: editing the corners and edges of a custom outline (length, angle, curve, add / delete / move a corner) and drawing its handles. |
| `sketch-edit.js` | 430 | Sketch: the commands that change the picked shapes (turn, mirror, align, join, arrays, offset, subtract, nest, resize, ...). |
| `sketch-geom.js` | 188 | Sketch: where a shape really is (base and world outlines, bounding boxes) and which holes belong to which part. |
| `sketch-input.js` | 327 | Sketch: mouse, touch and keyboard (picking, dragging, snapping guides, resize handles, pan and zoom). |
| `sketch-lock.js` | 22 | Sketch: the layout lock. On the sheet layout (Get set up / Bed & start) parts can only be placed, never reshaped or resized. |
| `sketch-util.js` | 59 | Small helpers shared by the Sketch class files (shape lookup, geometry bits) and the mixin() that joins them. |
| `sketch-view.js` | 222 | Sketch: the view (fit, zoom, pan) and drawing the canvas. |
| `sketch.js` | 249 | Shape editor: build parts on a canvas with the mouse or a finger. |
| `straight.js` | 21 | Straight cut: one line across the sheet. |
| `svg.js` | 209 | Read 2D shapes from an SVG (Inkscape, Illustrator, online designers). |
| `textshape.js` | 214 | Text tool engine: turns typed text into closed cutting outlines (mm). Pure maths, no DOM. |
| `trace.js` | 188 | Raster to outline engine, shared by the text tool and the photo / logo trace. |
| `useshape.js` | 89 | Sends the drawing to the cut side (useShape) and the sketch toolbar. |
| `variants.js` | 76 | Families of shape "versions" (tap a version to swap the part for a variant, keeping its size). |

### `js/cut/`

| file | lines | what it is |
|---|---:|---|
| `cam.js` | 398 | CAM: turn a 2D design (closed outlines) into plasma G-code. |
| `camedit.js` | 104 | Pro cut options (tabs, lead-out, overcut) and the start-point / tab handles you drag on the preview. |
| `check.js` | 223 | Cut check: can this design be cut well on this machine at this thickness? |
| `checklist.js` | 85 | Pre-start checklist and the list of reasons Start is blocked (blockers()). |
| `coupon.js` | 64 | Cut-test coupon + pierce counter (round 5, item 37). Pure logic (storage injected), no DOM. |
| `cutfeatures-ui.js` | 224 | Cutting-screen extras: live torch/arc panel with lost-arc resume, saved work origins and 9-point job origin, cut-test coupon. |
| `cutlist.js` | 61 | Pro cut list: reorder cuts, skip a cut, change where each one starts. |
| `cutlive.js` | 88 | Live torch / arc panel (round 5, item 35). Pure logic: no DOM, so tests can drive it with fake status reports. |
| `export.js` | 70 | Download G-code (dialect, line numbers) and its menu. |
| `job.js` | 271 | Turn a CAM G-code file into a plasma job (same rules as plasma/job.py). |
| `material.js` | 173 | Material, thickness, cut settings, speed and the saved-speed memory (step: material). |
| `nest.js` | 452 | True-shape nesting and saved remnants. Pure maths (no DOM), so the browser and the node tests run the same code. |
| `nestui.js` | 151 | "Get set up" > Put the parts on the bed: Nest to fit (true-shape packing) and saved remnants. |
| `origins.js` | 87 | Work origins (round 5, item 36): saved start points, and the 9-point job origin. Pure logic + localStorage, no DOM. |
| `pierce.js` | 33 | Live pierce delay: change it while cutting. |
| `playback.js` | 103 | Playable preview: play / pause the cut on the preview, speed multipliers, numbered cut order. |
| `prepare.js` | 89 | Turns the drawing into a job: kerf / lead-in, the safety check and loadJob(). |
| `preview.js` | 223 | The preview canvas: sheet, parts, cut order, torch path, machine bed and gantry drawing. |
| `progress.js` | 33 | Live cut progress: a time-based estimate re-synced every time the torch fires or stops. |
| `restart.js` | 79 | Restart from cut N after a stop, and the checks that the position is still known. |
| `run.js` | 37 | Cut-step buttons: set start point, trace, Start, Pause, cut again, new file. |
| `setup.js` | 480 | Step 3 "Get set up": lay the parts on the sheet (drag, turn, copy, delete, snap guides, live gaps), start point, checks. |
| `timeline.js` | 72 | Turns the prepared job into a timeline (where the torch is at second t) for the playable preview. |

### `js/ui/`

| file | lines | what it is |
|---|---:|---|
| `about.js` | 63 | New-version banner and the About lines: reads version.json and offers a reload when a new release is out. |
| `demo.js` | 84 | Practice-table helpers: set up the edges, fit dressing, jump to pierce. |
| `dialogs.js` | 46 | Escape / Enter / Tab handling for the open dialogs (capture phase, so a dialog wins over the page). |
| `features.js` | 23 | Starts the optional screen features (version banner, playable preview, cut list, restart, size check, demo helpers, icons). |
| `flow.js` | 170 | Round 4: the app's four screens, the "can't leave while cutting" lock, and the E-stop (big red button and the space bar). |
| `gate.js` | 57 | Why a control is switched off (hover text), and the sign-in / link-your-machine gate on Start. |
| `host.js` | 6 | What the screen modules in this group need from the app (state, toast, cmd, refresh, ...): app.js hands it over once with setHost(). |
| `howto.js` | 102 | Built-in "How to use" guide. |
| `icons.js` | 102 | Replaces emoji with the app's own line icons. |
| `inspector-api.js` | 106 | window.ptInspector: the small, validated API the Pro inspector panel talks to. mm and degrees CLOCKWISE. |
| `inspector-ui.js` | 532 | Pro docked inspector (shell and layout only). |
| `labels.js` | 43 | Keeps the preview's labels off the sheet and machine drawing. |
| `menu.js` | 37 | The top menu and a small scroll fix for the FluidNC box. |
| `mode.js` | 72 | Beginner / Pro mode switch and the account mode that decides it. |
| `nav.js` | 135 | Screens and steps: menu, Make a part -> Get set up -> Cut, tabs and the stepper. |
| `refresh.js` | 167 | The big repaint: refresh() brings every button, banner and lamp in line with the current state. |
| `viewport.js` | 27 | Window size / orientation relayout and the machine-outline toggle. |
| `whyoff.js` | 29 | Greyed controls say why: aria-disabled + data-why on every watched control. |
| `whytip.js` | 62 | The "why is this off" tip that appears when you press a switched-off control. |

### `js/account/`

| file | lines | what it is |
|---|---:|---|
| `account-ui.js` | 42 | Start-up wiring for the account dialogs (the pieces live next to it). |
| `account.js` | 12 | The account API: one place that re-exports every account module (import * as Acc from this file). |
| `accounthome.js` | 167 | The account dialog itself (signed-in view), claim and gate dialogs, and the account chrome (pill, gating). |
| `acctbase.js` | 50 | Account basics shared by every account module: storage keys, listeners, demo-mode switch, small string helpers. |
| `acctcrypto.js` | 46 | SHA-256 (works without a secure context) and claim-code generation. |
| `acctstate.js` | 108 | Who is signed in and what they may do: user, profile, mode, admin, Pro / firmware gating, linked machines. |
| `adminapi.js` | 114 | Admin-only calls: users, usage stats, job events, cut presets. |
| `adminview.js` | 230 | The admin dialog: machines, users, usage stats, announcements, cut presets. |
| `announce.js` | 60 | Announcements from the admin: list, mark read, create, delete. |
| `announceui.js` | 63 | Announcement bar and inbox. |
| `auth.js` | 226 | Sign up / in / out, sign-in link, reset, new PIN, mode and display name. |
| `authforms.js` | 88 | Sign in, sign up, sign-in link, reset and new-PIN forms. |
| `cloud.js` | 118 | Talking to the cloud account service: auth headers, token refresh, profile and entitlements, sign-in link parsing. |
| `config.js` | 41 | Site config for the accounts backend. |
| `demostore.js` | 57 | The practice (demo) account: everything is kept in localStorage in this browser, nothing leaves it. |
| `jobevents.js` | 54 | Records that the user is active and logs job events (start, finish, alarm) for the admin. |
| `machines.js` | 160 | Linking a machine (claim code) and the admin machine list: add, unlink, transfer, claim log. |
| `parts.js` | 132 | Saved parts: list, load, save (with conflict check), rename, delete, move local parts to the account. |
| `partsfolders.js` | 222 | Round 3: folders for the parts list + batch "Import DXF / SVG" (up to 20 files, each saved as a part). |
| `partslist.js` | 131 | The saved-parts list in the account dialog: folders, rows, rename, delete, open. |
| `savepart.js` | 119 | Save the current drawing as a part (over / copy), the conflict dialog and the 8-second undo. |
| `uibase.js` | 35 | Shared by the account dialogs: the host callbacks from app.js, dialog open/close, and the toast / esc helpers. |
