# Architecture

> **Changing the look?** Read [`UI-RULES.md`](UI-RULES.md) first (tokens, button types, breakpoints, layers, "STOP never moves", transitions). The component gallery is [`gallery.html`](gallery.html).

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
* **Cutting** (`cut`), steps: 1 *Part* (material and thickness, or "Add parts"), 3 *Bed & start / Get set up* (lay the parts on the sheet, start point,
  checks; **placing only**, the layout lock refuses any shape/size edit there), 4 *Cut* (live status, pause, STOP). Machine setup is a tab on this screen.
* The laptop machine view is always drawn as seen from the **front of the table**: the X gantry rail is at the top of the screen, home is back-left (top-left on screen), +Y is towards the operator (down the screen). G-code itself is not flipped, and Make a part is not flipped.
* Connection is **USB or Bluetooth serial** (Web Serial in Chrome or Edge). There is no Wi-Fi / WebSocket path. On FluidNC a cut is uploaded as `/job.nc` by XModem and started with `$LocalFS/Run`, so a dropped laptop link does not stop the board mid-cut.
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
| `ui/` | screen plumbing: navigation and steps, Simple / Advanced on Make, the big `refresh()`, why-is-it-off tips, version banner, icons, the laptop chrome and Pro inspector | everything below |
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

Eleven plain files, linked from `index.html` **in this order** (later files win ties, so the order is part of the design; each file's
header says what it holds and which rules must stay in cascade order): `tokens.css` (colours, type, spacing variables), `base.css`
(resets, utilities, buttons, forms), `layout.css` (app shell, step grid, stepper, nav bar), `components.css` (dialogs, keypad, jog pad,
chips, lists), then one file per screen: `screen-signin-menu.css`, `screen-make.css`, `screen-cut.css`, `screen-parts.css`,
`screen-setup.css`, `screen-admin.css`, and finally `yours.css` (the "Make it yours" appearance overrides).
Put a new rule in the file of the screen it styles; a new colour or size becomes a token. A new `css/*.css` file must be linked in
`index.html`; the offline list picks it up by itself (`scripts/stamp-version.sh` rewrites the `sw.js` precache from the files on disk).

## 2c. Other folders

| path | what |
|---|---|
| `index.html`, `html/` | The page shell, plus the Make / Cut / Your parts / Machine setup HTML partials `boot.js` fetches at start-up. |
| `config/` | Served to the app: `machine.json` (bed and defaults), `cut_chart.json` (pierce/cut speeds), controller setting lists and the FluidNC **template** `fluidnc-plasma.yaml`. |
| `hardware/` | Josh's board `config.yaml` (and a no-OLED variant). Pin polarity here can differ from the template and from the file actually on the ESP32 — check the board before changing pins. |
| `docs/` | This map, `DEPLOY-STAMP.md`, `FLUIDNC.md`, `ACCOUNTS-SETUP.md`. |
| `tests/` | Unit + end-to-end tests (`tests/README.md`). |
| `scripts/` | `stamp-version.sh` (deploy stamp + offline file list), `harden-csp.sh`, `serve-local.sh`. |
| `samples/` | Example drawings. |
| `supabase/` | Schema and policies Josh runs himself. The app never uses the service_role key. |

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
                                       │  FluidNC: xmodem.js uploads /job.nc, boardrun.js runs $LocalFS/Run
                                       │  (or stream line-by-line over the serial link; practice table uses sim.js)
                       machine/grbl.js protocol over usbserial.js (USB or Bluetooth serial)
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
| CSP: no inline scripts, no `ws:` or `wss:` | `index.html`, `scripts/harden-csp.sh` (deploy checks the policy is clean) |
| FluidNC console, restore and announcements are validated and escaped | `machine/admin-machine.js`, `account/announceui.js`, tests 62/30 |

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
* After adding or moving a JS module, the committed `sw.js` precache list must include it (suite 59 compares it to `scripts/stamp-version.sh`). Deploy stamps the list anyway, but a missing entry fails the test in the repo.
* Never press Connect or send commands to a real machine from tests or from this app while developing.

## 9. Module reference

Line counts are approximate. The one-line description is taken from each file's opening comment.
Regenerate this table when you add or move a module, and keep the opening comment accurate.

### `js/`

| file | lines | what it is |
|---|---:|---|
| `app.js` | 392 | The entry point: init() wires the modules and bind() binds the controls. |
| `boot.js` | 40 | Fetches the main-menu HTML partials (Make, Cut, Your parts, Machine setup) before the app starts. No build step. |
| `sw-register.js` | 16 | Registers the offline cache (sw.js). Its own file because the page CSP does not allow inline scripts. |
| `version.js` | 4 | The release this copy belongs to (rewritten by the deploy stamp; version.json is the live truth). |

### `js/core/`

| file | lines | what it is |
|---|---:|---|
| `arcs.js` | 640 | Arc fitting, intersections, 3-point and tangent arcs, splines, and DXF/SVG export helpers. |
| `dom.js` | 51 | Tiny DOM and text helpers used everywhere: $, $$, esc, clock, toast. |
| `expr.js` | 58 | Safe numeric expressions for the size keypad: 100/2, 50+12.5, 80-5, 25*4, (30+10)/2. |
| `geom.js` | 627 | 2D geometry helpers for CAD import and the shape maker (contours in mm). |
| `hooks.js` | 18 | Late-bound calls so a low-level module can ask for refresh() and similar without a circular import. |
| `prefs.js` | 281 | Per-user "Make it yours" preferences: theme, accent, toolbar, grid, snap, canvas, Cut layout. |
| `safeprompt.js` | 107 | In-app confirm and prompt dialogs (replaces window.confirm for operator questions). |
| `state.js` | 18 | The one shared state object S, plus the live references init() fills in (machine, sketch, …). |

### `js/machine/`

| file | lines | what it is |
|---|---:|---|
| `access.js` | 32 | Machine access rules: send a command only when allowed (signed in, machine linked, not e-stopped). |
| `admin-machine.js` | 414 | Admin-only Advanced Machine panel: $ settings, filtered console, calibration, invert, limits, firmware. |
| `boardrun.js` | 261 | Run a cut from FluidNC on-board flash ($LocalFS/Run) so a USB/Bluetooth drop does not stop it. |
| `connection.js` | 120 | Connect / disconnect (USB or Bluetooth serial, and the practice table), keep-awake, unload safety stop. |
| `console.js` | 43 | The controller console pane: log lines and the typed-command box. |
| `dialect.js` | 94 | Turn the prepared GRBL/grblHAL job into another controller dialect for download. |
| `events.js` | 150 | Reacts to everything the machine reports: status, safety flags, events, job log entry. |
| `fluidnc.js` | 10 | Detect FluidNC from the controller banner or status text. |
| `grbl.js` | 434 | The GRBL text protocol for every link: streaming, status poll and watchdog, handshake, real-time bytes. |
| `jog.js` | 123 | Jogging: on-screen pad, arrow keys, hold-to-glide, and the position read-out. |
| `machine.js` | 415 | Machine model: ties the controller link, job builder and safety checks together; E-stop latch, start guard. |
| `motordir.js` | 328 | Machine setup: Reverse X / Y / Z, reading and writing FluidNC direction pins (skips $CD over Bluetooth). |
| `panels.js` | 223 | Machine panels on Get set up: edges/limits, settings backup, test patterns, command buttons. |
| `probefilter.js` | 62 | Debounce and safety helpers for the floating-head / probe input. |
| `safety.js` | 139 | Keep the torch inside the machine (soft limits, travel, raise height). |
| `settings.js` | 464 | Settings menu: appearance, machine, speeds, torch, pierce/cut, materials, homing, I/O, backup/restore. |
| `setupbed.js` | 115 | Machine setup bed picture: the table, gantry, home corner and current torch position (front-of-table view). |
| `sim.js` | 303 | Practice table: a pretend controller in the browser, same protocol as a real board. |
| `torchtest.js` | 182 | Machine setup: hold-to-fire Test torch (pointer capture, keepalive, writeNow for M5). |
| `usbserial.js` | 226 | USB or Bluetooth serial via Web Serial: open the port, read lines, notice a drop; Bluetooth uses a gentler poll. |
| `xmodem.js` | 135 | XModem-CRC sender for FluidNC $Xmodem/Receive (used to upload /job.nc). |

### `js/make/`

| file | lines | what it is |
|---|---:|---|
| `blockfont.js` | 101 | Procedural block / stencil-cut stroke font used by the text tool. |
| `cad.js` | 252 | CAD dialog (trim, offset, …) and the Advanced command runner. |
| `cadpreview.js` | 39 | Thumbnail and 3D/preview helpers for preset parts in the browser. |
| `cadui.js` | 40 | Make-screen CAD chrome: tools, status and wiring for the Advanced editor. |
| `camprofile.js` | 70 | CAM profile helpers for gears, sprockets and similar generated parts. |
| `checkcut.js` | 157 | The "check this cut" summary on Make, before sending the drawing to Cut. |
| `ctxmenu.js` | 70 | Right-click / long-press context menu on the drawing. |
| `cutsummary.js` | 48 | Short cut-time / size summary shown on Make. |
| `dimedit.js` | 126 | Click a dimension on the drawing to type a new size, plus the number pad. |
| `drawexport.js` | 61 | Export the drawing as DXF or SVG. |
| `drawhud.js` | 256 | Heads-up overlay on the drawing: snaps, lengths, angles, cursor hints. |
| `duct.js` | 501 | Flat patterns for sheet-metal transitions (pure maths, no DOM). |
| `dxf.js` | 234 | Read 2D shapes from an ASCII DXF (Fusion 360, FreeCAD, Onshape, …). |
| `editable.js` | 153 | Turn imported DXF/SVG outlines (many short segments) into editable lines and arcs. |
| `files.js` | 290 | Open, add and replace files; drag and drop; start over; edit-drawing and resize. |
| `flange-tables.js` | 182 | Standard flange size tables used by the pipe-flange presets. |
| `fold3d.js` | 1465 | 3D / folding preview and unfold helpers for folding presets (thickness, flanges, etch folds). |
| `fontdata.js` | 4 | Single-line (Hershey) letter shapes for the text tool. |
| `headertools.js` | 54 | Make-screen header tools (selection status and common actions). |
| `layers.js` | 142 | Layers / parts list: pick, hide and lock shapes. |
| `library.js` | 100 | The shape library, the version pop-up, and the Add text / Trace tool launchers. |
| `maketools.js` | 236 | Make a part: "Add text" and "Trace a picture" dialogs on top of textshape.js and trace.js. |
| `phonesheet.js` | 272 | Phone-sized bottom sheets for Make tools (phone must still not break). |
| `picture.js` | 44 | Place and trace a picture / logo on the drawing. |
| `pipeflanges.js` | 207 | Pipe flange geometry used by the flange presets. |
| `presetbrowser.js` | 114 | The Preset parts browser (tabs such as 3D / folding and Pipework). |
| `protools.js` | 43 | Advanced tools: full-screen drawing, the tool buttons and their state. |
| `quickbar.js` | 407 | The Advanced quick bar: search palette and its actions. |
| `shape-helpers.js` | 72 | Small geometry helpers shared by the shape definitions. |
| `shapeform.js` | 367 | Simple-view shape tiles, the guide, and the size/position form for the selected shape. |
| `shapes-fab.js` | 238 | Ready-made fabrication parts, each with adjustable sizes. |
| `shapes.js` | 717 | Shape maker: common plasma parts from a few sizes. Each shape returns contours in mm. |
| `sheetopts.js` | 134 | Sheet options on Make (material area used as the drawing sheet). |
| `sheetsize.js` | 40 | Drawing-sheet size helpers. |
| `shortcuts.js` | 97 | Keyboard shortcuts on the Make screen. |
| `sizecheck.js` | 70 | Size check after a DXF/SVG import: shows the size and asks before scaling (inches vs mm). |
| `sketch-edge.js` | 838 | Sketch: edit corners and edges of a custom outline (length, angle, curve, add / delete / move). |
| `sketch-edit.js` | 823 | Sketch: commands that change picked shapes (turn, mirror, align, join, arrays, offset, subtract, nest, resize). |
| `sketch-geom.js` | 277 | Sketch: where a shape really is (world outlines, boxes) and which holes belong to which part. |
| `sketch-input.js` | 694 | Sketch: mouse, touch and keyboard (pick, drag, snaps, resize handles, pan and zoom). |
| `sketch-lock.js` | 22 | Sketch: the layout lock. On Bed & start, parts can only be placed, never reshaped or resized. |
| `sketch-stage6.js` | 280 | Sketch: later-stage edit tools (trim / extend family and related commands). |
| `sketch-trim.js` | 608 | Sketch: trim, extend and break tools. |
| `sketch-util.js` | 94 | Small helpers shared by the Sketch class files, and the mixin() that joins them. |
| `sketch-view.js` | 590 | Sketch: the view (fit, zoom, pan) and drawing the canvas. |
| `sketch.js` | 334 | Shape editor core: the Sketch class that the mixin files hang their methods on. |
| `snaps.js` | 92 | Snap points and snap guides for drawing and dragging. |
| `straight.js` | 21 | Straight cut: one line across the sheet. |
| `svg.js` | 209 | Read 2D shapes from an SVG (Inkscape, Illustrator, online designers). |
| `textshape.js` | 275 | Text tool engine: typed text to closed cutting outlines in mm. Pure maths, no DOM. |
| `toolbarcustom.js` | 186 | Customise which tools appear on the Advanced toolbar. |
| `trace.js` | 188 | Raster-to-outline engine, shared by the text tool and the photo / logo trace. |
| `useshape.js` | 94 | Send the drawing to the cut side (useShape) and the sketch toolbar. |
| `variants.js` | 76 | Families of shape versions (tap a version to swap the part, keeping its size). |

### `js/make/presets/`

| file | lines | what it is |
|---|---:|---|
| `enclosures.js` | 139 | Preset parts: boxes and enclosures. |
| `fab-transitions.js` | 443 | Preset parts: square-to-round and other sheet-metal transitions. |
| `flanges.js` | 128 | Preset parts: flanges. |
| `fold-parts.js` | 555 | Preset parts: folding / 3D parts that unfold to a flat blank with etch fold lines. |
| `gears-sprockets.js` | 189 | Preset parts: gears and sprockets. |
| `gussets.js` | 132 | Preset parts: gussets. |
| `helpers.js` | 469 | Shared builders used by the preset-part modules. |
| `hooks-hangers.js` | 217 | Preset parts: hooks and hangers. |
| `index.js` | 85 | Preset catalogue: groups the preset modules into the browser tabs. |
| `plates-brackets.js` | 200 | Preset parts: plates and brackets. |
| `r8-parts.js` | 255 | Later preset parts added in the r8 batch (still imported by the catalogue). |
| `signs-frames.js` | 114 | Preset parts: signs and frames. |
| `tabs-slots.js` | 182 | Preset parts: tabs and slots. |

### `js/cut/`

| file | lines | what it is |
|---|---:|---|
| `bedview.js` | 117 | Front-of-table bed view helpers: how the laptop picture is rotated and how jog arrows map to machine axes. |
| `cam.js` | 577 | CAM: turn closed outlines into plasma G-code (kerf, lead-in, pierce, etch pass, cut order). |
| `camedit.js` | 105 | Cut options (tabs, lead-out, overcut) and the start-point / tab handles on the preview. |
| `check.js` | 223 | Cut check: can this design be cut well on this machine at this thickness? |
| `checklist.js` | 110 | Pre-start checklist and the list of reasons Start is blocked (blockers()). |
| `coupon.js` | 64 | Cut-test coupon and pierce counter. Pure logic (storage injected), no DOM. |
| `cutbar.js` | 30 | The cutting-screen action bar (Start, Pause, trace, and related buttons). |
| `cutfeatures-ui.js` | 224 | Cutting-screen extras: live torch/arc panel, saved work origins, 9-point origin, cut-test coupon. |
| `cutlist.js` | 61 | Cut list: reorder cuts, skip a cut, change where each one starts. |
| `cutlive.js` | 88 | Live torch / arc panel logic (no DOM; tests drive it with fake status reports). |
| `cutpanels.js` | 178 | Cutting-screen side panels and their show/hide layout. |
| `cutstatus.js` | 104 | Live job and machine status on the cutting screen. |
| `etch.js` | 226 | Plasma etch / scribe pass (fold lines and text) before the through cuts, including optional amp-change pauses. |
| `export.js` | 87 | Download G-code (dialect, line numbers) and its menu. |
| `job.js` | 321 | Turn CAM G-code into a plasma job (pierce, torch on/off, feeds, plan, summary). |
| `machinedraw.js` | 119 | Draw the machine bed, gantry and torch on the cutting preview (front-of-table view). |
| `material.js` | 186 | Material, thickness, cut settings, speed and the saved-speed memory (step 1). |
| `nest.js` | 470 | True-shape nesting and saved remnants. Pure maths, no DOM. |
| `nestui.js` | 151 | Bed & start: Nest to fit and saved remnants. |
| `origins.js` | 87 | Saved work origins and the 9-point job origin (localStorage, no DOM). |
| `pierce.js` | 39 | Live pierce delay: change it while cutting. |
| `playback.js` | 103 | Playable preview: play / pause the cut path, speed multipliers, numbered cut order. |
| `prepare.js` | 101 | Turn the drawing into a job: kerf / lead-in, the safety check and loadJob(). |
| `preview.js` | 198 | The preview canvas: sheet, parts, cut order, torch path, machine bed and gantry. |
| `previewnav.js` | 137 | Pan and zoom the cutting preview. |
| `progress.js` | 54 | Live cut progress: a time-based estimate re-synced when the torch fires or stops. |
| `restart.js` | 79 | Restart from cut N after a stop, and the checks that the position is still known. |
| `run.js` | 77 | Cut-step buttons: set start point, trace, Start, Pause, cut again, new file. |
| `setup.js` | 572 | Bed & start: lay parts on the sheet (drag, turn, copy, delete, snaps, gaps), start point, checks. |
| `startmark.js` | 33 | The start-point marker on the bed picture. |
| `timeline.js` | 72 | Turns the prepared job into a timeline (torch position at second t) for the playable preview. |
| `turncover.js` | 7 | The "turn the phone sideways" cover on the cutting screen. |

### `js/ui/`

| file | lines | what it is |
|---|---:|---|
| `about.js` | 68 | New-version banner and the About lines: reads version.json and offers a reload when a new release is out. |
| `demo.js` | 61 | Practice-table helpers: set up the edges, fit dressing, jump to pierce. |
| `dialogs.js` | 59 | Escape / Enter / Tab handling for open dialogs (capture phase, so a dialog wins over the page). |
| `features.js` | 22 | Starts optional screen features (version banner, playable preview, cut list, restart, size check, demo helpers, icons). |
| `flow.js` | 182 | The app screens, the "can't leave while cutting" lock, and the E-stop (big red button and the space bar). |
| `gate.js` | 64 | Why a control is switched off (hover text), and the sign-in / link-your-machine gate on Start. |
| `header.js` | 55 | The top header bar, including hide/show (STOP must stay visible on Cut). |
| `host.js` | 6 | What the screen modules need from the app (state, toast, cmd, refresh, …): app.js hands it over once with setHost(). |
| `hovertip.js` | 93 | Hover / focus tips on controls. |
| `howto.js` | 100 | Built-in "How to use" guide. |
| `icons.js` | 108 | Replaces emoji with the app's own line icons. |
| `inspector-api.js` | 118 | The small, validated API the Advanced inspector talks to. mm and degrees clockwise. |
| `inspector-ui.js` | 535 | Docked Advanced inspector (shell and layout only). |
| `labels.js` | 43 | Keeps the preview labels off the sheet and machine drawing. |
| `laptop.js` | 54 | Laptop chrome (wide, fine pointer) and the phone "turn sideways" hint. |
| `menu.js` | 99 | The top menu and the phone cutting screen's More sheet. |
| `mode.js` | 88 | Simple / Advanced editor on Make a part. Older Beginner / Pro names are still accepted as aliases. |
| `nav.js` | 169 | Screens and steps: menu, Make a part, Bed & start, Cut, tabs and the stepper. |
| `refresh.js` | 318 | The big repaint: refresh() brings every button, banner and lamp in line with the current state. |
| `scrollrow.js` | 92 | Horizontal sliding toolbars (wheel / trackpad map to sideways scroll, fade hints when more tools sit off-screen). |
| `viewport.js` | 31 | Window size / orientation relayout and the machine-outline toggle. |
| `whyoff.js` | 29 | Greyed controls say why: aria-disabled + data-why on every watched control. |
| `whytip.js` | 62 | The "why is this off" tip that appears when you press a switched-off control. |
| `yours.js` | 110 | Settings → Make it yours: per-user appearance and canvas preferences, applied live. |

### `js/account/`

| file | lines | what it is |
|---|---:|---|
| `account-ui.js` | 42 | Start-up wiring for the account dialogs (the pieces live next to it). |
| `account.js` | 12 | The account API: one place that re-exports every account module. |
| `accounthome.js` | 200 | The account dialog (signed-in view), claim and gate dialogs, and the account chrome (pill, gating). |
| `acctbase.js` | 56 | Account basics shared by every account module: storage keys, listeners, demo-mode switch, string helpers. |
| `acctcrypto.js` | 46 | SHA-256 (works without a secure context) and claim-code generation. |
| `acctstate.js` | 108 | Who is signed in and what they may do: user, profile, mode, admin, Pro / firmware gating, linked machines. |
| `adminapi.js` | 114 | Admin-only calls: users, usage stats, job events, cut presets. |
| `adminview.js` | 261 | The admin dialog: machines, users, usage stats, announcements, cut presets. |
| `announce.js` | 60 | Announcements from the admin: list, mark read, create, delete. |
| `announceui.js` | 63 | Announcement bar and inbox. |
| `auth.js` | 230 | Sign up / in / out, sign-in link, reset, new PIN, mode and display name. |
| `authforms.js` | 102 | Sign in, sign up, sign-in link, reset and new-PIN forms. |
| `cloud.js` | 146 | Talking to the cloud account service: auth headers, token refresh, profile and entitlements. |
| `config.js` | 41 | Site config for the accounts backend (publishable key only; ?demo=1 stays local). |
| `demostore.js` | 57 | The practice (demo) account: everything stays in localStorage in this browser. |
| `jobevents.js` | 55 | Records that the user is active and logs job events (start, finish, alarm) for the admin. |
| `machines.js` | 183 | Linking a machine (claim code) and the admin machine list: add, unlink, transfer, claim log. |
| `parts.js` | 132 | Saved parts: list, load, save (with conflict check), rename, delete, move local parts to the account. |
| `partsfolders.js` | 222 | Folders for the parts list and batch "Import DXF / SVG". |
| `partslist.js` | 132 | The saved-parts list in the account dialog: folders, rows, rename, delete, open. |
| `savepart.js` | 123 | Save the current drawing as a part (over / copy), the conflict dialog and the 8-second undo. |
| `uibase.js` | 37 | Shared by the account dialogs: host callbacks from app.js, dialog open/close, toast / esc helpers. |
| `userprefs.js` | 102 | Cloud sync for per-user "Make it yours" and Cut panel layout (localStorage is the offline cache). |
