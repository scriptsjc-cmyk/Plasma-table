LAST_CHECKED_COMMIT: a289e67
# Porta Plazma: checker report

Kept up to date automatically by Claude, the independent checker. The newest check is at the top, and older ones are summarised under History.
**How it checks:** a fresh copy of the live code, on the practice table only (USB Connect is never pressed). The kit is `porta_check.py` on this branch, and items are matched against `claude/combined-plan-r15.md`.

## Check of 21 Nov 2026, 11:00 UK (commit `a289e67`: only `docs/DEV-STATUS.md` added since `bb5aadb`)

### Safety (STOP, start confirm, torch)
- ✅ Start confirm: leaving by Menu or by a step tab with "Before you cut" open never runs a job off the cutting screen. STOP stays on screen.
- ✅ `112_r15_safety` 36/36 when run on its own. (One check failed once while 5 Chromes ran at the same time here: after ☰ → Machine setup, Start → confirm did not start the job. It's a slow-machine flake, not a safety problem: no job ran.)
- Torch test, STOP wiring and space bar: no code changes since the last check.

### Replies to "Ready to check"
- ✅ **r15 Round 1 (1.1–1.7) @ bb5aadb.** Re-confirmed (safety run above, unit `32_r15_parts` 20/20).
- ✅ **7.1–7.4 in the deploy gate.** `ci-gate.mjs` lists `112_r15_safety`, `113_r15_fits`, `120_every_tool`, `121_features` and `122_loose_holes`. Results when run one at a time: 112 36/36, 120 594/594, 121 44/44, 122 25/25. 113 is 278/280; see "Unit + e2e results" below (it's the font, and it fails on `f47ca41` too).
- ✅ **2.1, 2.3–2.5, 2.7–2.11, 2.13, 2.14, 2.16 @ bb5aadb.** `121_features` (the motor-mount plate typed in, exact 100.00, version keeps R10, bolt-circle centre stable, mirror link, still editable after a cut-out, overlap ⚠) and `122_loose_holes` both pass.
- ✅ **3.1, 3.3, 3.7, 3.8 @ bb5aadb.** Measure, the More panel and its search, dialog fit and Escape all pass in `120_every_tool` and in my own tool run. My kit reports no page errors.

### Answers to developer questions
1. **2.17 (G-code unchanged when a part has no features): ✅ confirmed independently.**
   - I made G-code for all 339 presets at `f47ca41` (before r15) and at `a289e67`: same position, kerf 1.5 and lead-in 3.
   - **334 match byte for byte.** The 5 that differ are exactly the Round 1 fixes: `signbr`, `foldshelf`, `fanduct`, `gusflange` and `hopflange`.
   - I did not repeat your 35 DXF/SVG files. Their auto-adopt runs through the import screen, so I'll check those in the browser on the Round 2 push.
2. **Failures outside the gate: were they there before r15?** I ran each suite on `f47ca41` and on HEAD:
   - **Same on both, so they were there before r15:** 10 (Advanced persists), 52 item 21, 55 section 11 ×4, 57 ×3, 85 C46/C48/C49, 96_fold3d ×3, 53 (s2r ring area), 58 (Nest panel).
     - 71 and 83 crash at startup on both here, before any check runs (71: `plasmaTest` not ready yet; 83: a timeout). That's probably this slower machine.
     - About 55 section 11: STOP is missing on Make, but Space sends feed-hold and reset bytes. That's the safe direction (a stop, never a move), so I see no safety risk in it.
   - **Better on HEAD:** 53 has 2 fewer failures (s2r frame and outline count), and 58's "3 second nest budget" now passes.
   - **❌ Worse on HEAD, so not from before r15: 41 item 11.**
     - On `f47ca41` only "no 'Home the machine' prompt" fails. On HEAD, two more fail as well: "one lock note on the bed screen" and "'Link a machine' is the green primary button".
     - The probe gives `{"notes":0, "linkGo":false}` while `#startWhy` says "Link a machine to run jobs", so the "Or, to cut for real: Link a machine" card is hidden when it should show.
     - **Bisected to `55c3d71`** (Cut r15 7.2: header keeps its height, `.cutmore-row` wrapper in `html/cut.html`). Its parent `75b7df1` passes.
     - It's the same test file on both, and it fails every time it runs (3 runs).

### New problems found (developer may fix without asking)
1. **41 item 11 regression since `55c3d71`.** See answer 2 above. Not a safety problem (Start stays off), but a buyer with no linked machine loses the Link a machine button on the bed step.
   - To check: `node run-all.mjs e2e 41` → "item 11: one lock note…" and "'Link a machine' is the green primary button" should pass.

### Got worse since last check
- Nothing in the app (no app code changed). The 41 item 11 slip above is older (`55c3d71`, 04:18 UTC); it showed up now because I compared against `f47ca41` for your question.

### Prep for Next up (Round 3 remainder)
I checked each one live on HEAD at 1536 × 730 and 1280 × 600. All are still open as the plan describes.

**3.2 Length/Angle box over the drawing**
- **Seen:** `#drawHud` is at 448–1088 × 542–706 at 1536 × 730 (canvas bottom 681) and at 320–960 × 417–576 at 1280 × 600 (canvas bottom 551).
- **Cause:** `css/screen-make.css:872`, where `.drawhud` is `position: fixed; left: 50%; bottom: 24px`, so it floats over the canvas.
- **Approach:** dock it in the Make status strip under the canvas, or in the inspector column while a draw tool is active. Don't shrink it to fit.
- **Test:** Line tool, click once on the canvas, then check that `#drawHud`'s rect does not intersect `sketch.cv`'s rect at all 3 sizes. Then click at the canvas spot where the box used to be: `drawPts.length` should go up by 1.

**3.4 Etch line: Enter doesn't finish**
- **Seen:** etch tool on, 2 clicks, Enter → still drawing (`items: []`, `pts: 2`).
- **Cause:** `js/make/sketch-input.js:616`. The canvas Enter only finishes when `drawPts.length >= 3`, and never checks `drawEtch`. The HUD's own Enter (`drawhud.js:218`) does, but the HUD isn't focused (on purpose, `drawhud.js:261`).
- **Approach:** at line 616, if `this.drawEtch && drawPts.length >= 2`, call `finishOpenDraw()`.
- **Test:** rail Etch, click 2 points, press Enter → one new item with `op === "score"`, and `sketch.tool === null`.

**3.5 A two-point line can't be finished**
- **Seen:** Line tool, 2 clicks, Enter → nothing happens. The toast still says "Click points … then Close outline."
- **Cause:** the same line 616 (`>= 3`), and `finishDraw()` in `sketch-edit.js` refuses fewer than 3 points.
- **Approach (pick one, it's in the plan):** at 2 points, Enter makes an open cut line with a Check cut note, or the message says "Add one more point to close it, or use Etch line".
- **Test:** 2 clicks + Enter → either a new open item that Check cut flags, or a message containing "one more point". Never silence.

**3.6 Rectangle / Circle buttons drop a fixed size**
- **Seen:** rail `[data-qb="rect"]` adds a 100 × 60 part straight away (`tool: null`), and `disc` adds Ø100.
- **Cause:** `js/make/quickbar.js:291`, where `case "rect"` / `"disc"` call `sketch.add(a)`. The R/C keys use `setTool("rect"/"disc")` (`sketch-input.js:625–626`).
- **Approach:** a single click calls `setTool`, the same as the keys; a double-click on the button keeps `sketch.add` (the standard size).
- **Test:** click `[data-qb="rect"]` → `sketch.tool === "rect"` and items are unchanged. Then click-click on the canvas → one rect with the size you drew. Double-click the button → a 100 × 60 rect.

**3.10 Consistent dialogs**
- **Cause:**
  - `index.html:429`: `#cadOk` says "Do it" for every tool;
  - `js/make/cad.js:189`: "Automatic (current behaviour)";
  - `quickbar.js:382/424`: hints that say "Do it".
  - Cancel comes first in the HTML, but check that each dialog's CSS keeps it on the left.
- **Approach:** `openCad(title, fields, onOk, onPreview, okLabel)` sets `#cadOk` text per tool ("Offset", "Make 3 copies"). Clear toasts in `openCad`.
- **Test:** for each cad tool, `#cadOk` text is not "Do it"; `#cadCancel` left < `#cadOk` left; no toast is visible after the dialog opens.

**3.11 Circular array default stacks copies**
- **Seen:** a 100 × 60 rect, Circular array 4 with PCD 0 → the copies' boxes overlap (e.g. [60,0,160,60] and [20,40,80,140]).
- **Cause:** `js/make/sketch-edit.js:484`, where `R = max(w, h)/2 + 10` ignores the count. The warning at 504 fires, but the default is still wrong.
- **Approach:** when PCD is 0, use `R = span / (2·sin(π/n)) + gap`, so the chord clears the part. Show the chosen PCD in the field.
- **Test:** add rect 100 × 60, `polarArray(4, 0, {mode: "shape"})` → no two `boxOf` boxes intersect. Repeat with n = 6 and 12.

**3.12 Spline shows too many handles**
- **Seen:** 5 clicked points become 70 points with 4 arcs, and it draws **21 dots and 4 squares** (≈25, not 5).
- **Cause:** `js/make/sketch-edge.js:819–838`. `isRealCorner` treats the small bends of the fitted polyline as corners, and the bulge-mid loop (828) draws a square on every arc.
- **Approach:** keep the clicked points on the item (e.g. `it.splinePts`), and for spline items draw handles only there and skip the bulge-mid squares.
- **Test:** Spline tool, 5 clicks + Enter; count `ctx.arc` calls at r 4.5/6.5 and `ctx.rect` 8 × 8 during `sketch.draw()` → 5 or fewer in total.

### Plan progress per round
- **Round 1:** done ✓.
- **Round 2:** mostly done. Verified: 2.1, 2.3–2.5, 2.7–2.11, 2.13, 2.14, 2.16, and 2.17 (presets). Working on: 2.2, 2.6, 2.12, 2.18. Not yet listed: 2.15.
- **Round 3:** partly done. Done: 3.1, 3.3, 3.7, 3.8. Working on: 3.9. Open: 3.2, 3.4, 3.5, 3.6, 3.10, 3.11, 3.12 (prepped above).
- **Round 4:** some header and Stopped fixes are in, but most items are open.
- **Round 7:** 7.1–7.4 done. 7.5–7.9 not started.
- **Rounds 5, 6, 8, 9:** not started.

### Unit + e2e results
- **Unit:** 24,842 / 24,844. Only the known C9-S2R fails.
- **Gate e2e (run one at a time):** 112 ✓ 36/36 · 120 ✓ 594/594 · 121 ✓ 44/44 · 122 ✓ 25/25 · 113 278/280.
  - 96_fits_screen is 238/240 with the same 2 checks: at 1440 × 800 on Machine setup, "Lowest point." overlaps "Floating head".
  - **Both fail on `f47ca41` too.** This machine has no Barlow font, so it's the fallback-font width. Plan 4.26 (bundle Barlow) should fix it.
- **My kit:** no page errors on any screen or tool. The same 3 known screen problems remain:
  - 1280 × 600 Arrange: Flip up/down off-screen, Offset and Lock covered;
  - 1366 × 640 Arrange: Flip covered;
  - 1280 × 600 Stopped: `#btnExport4` off-screen.
  
  These are already under Working on (3.9 and the Stopped fix). 3D: 25 of 93 flagged, as expected until Round 5.

### For Josh to decide / Ideas for Josh
- 113 / 96 at 1440 × 800 depend on the font (see above). Worth doing 4.26 early, so the checker and buyers see the same layout as the developer.

## History
- **21 Nov 09:30 (`bb5aadb`):** Round 1 verified done. Round 2 mostly done. Round 3: 3.1, 3.3, 3.7 and 3.8 done. Found: 1280 × 600 Arrange overflow (3.9) and Stopped `#btnExport4` off-screen. Unit 24,842/24,844 (C9-S2R only). 3D 25/93 flagged.
