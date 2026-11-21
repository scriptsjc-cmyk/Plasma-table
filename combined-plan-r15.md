# Porta Plazma: combined plan r15 (replaces the three 21 Nov reports)

**For:** the app developer · **From:** Josh · **Date:** 21 Nov 2026 · **Checked against:** live `f47ca41`
**Replaces:** `r14-review.md`, `cad-review.md` and `hard-design-and-3d-review.md`. Every item from those three is in here once, with no repeats. Each item notes where it came from (r14 / CAD / 3D + its old number), so you can go back to the original steps and screenshots.

**House rules still apply:**
- Build only what Josh approves (he can approve one round at a time).
- Don't change `blockers()`, safety gates, STOP wiring or the space bar, the torch test, G-code safety or element ids.
- Never hide a control to pass a test. Never weaken a test. Practice table only.

**How it's organised:** ten rounds, in the order to build them. Each round touches different files, so they don't step on each other. Where one fix solves several old items, they are merged under that fix. Round 2 (the Features list) solves 11 old items on its own, so many smaller fixes were folded into it rather than done twice.

| Round | What | Main files | Solves |
|---|---|---|---|
| 1 | Safety and parts that cut wrong | `cut/run.js`, `presets/*`, `core/dom.js` | 7 items |
| 2 | **Features list** (holes, slots, cut-outs as editable rows) | `make/sketch*.js`, `make/inspector*.js`, new `make/features*.js` | 11 items |
| 3 | Make-a-part tool bugs | `make/quickbar.js`, `sketch-input.js`, `drawhud.js`, tool dialogs | 12 items |
| 4 | Screen polish (Cut, Setup, Machine setup, header) | `css/screen-*.css`, `html/*` | 26 items |
| 5 | Folded parts: accurate flat patterns and 3D | `make/fold3d.js`, `presets/fold-parts.js` | 8 items |
| 6 | Plasma cut quality | `cut/cam.js`, `cut/check.js`, cut chart | 5 items |
| 7 | Tests and CI (all new checks in one place) | `tests/*` | 9 items |
| 8 | Code tidy | `css/*`, `ui/laptop.js`, `index.html` | 6 items |
| 9 | Before selling | new settings/report/setup files, workflow | 7 items |
| 10 | Later / nice to have | — | 9 items |

---

## Round 1: safety, and parts that cut wrong (do first)

**1.1 A cut can start from the home menu with no STOP on screen** (r14 A1)
- **Steps:** Setup → Start cutting → while "Before you cut" is open, click ‹ Menu → the box stays open over the menu → "Everything's correct – start" → the job runs on the menu screen, with no STOP visible.
- **Fix:**
  - any screen, step or tab change cancels an open `askConfirm` (it resolves `false`);
  - `btnStart.onclick` returns unless Cut step 2 is still showing;
  - while a Start confirm is open, Menu, ☰ and the step tabs are disabled.
  - The gated test is in Round 7.

**1.2 Safety sentence cut off** on Cutting ("…Keep this tab") (r14 A2). Let it wrap. Safety text must never be clipped.

**1.3 The Stopped toast covers the main next-step button** (r14 A3). Show the message in the stopped panel, not as a toast over the actions.

**1.4 Two overlapping holes cut on two presets** (3D B1)
- **Sign / flag bracket** (`signbr`) and **Folded shelf bracket** (`foldshelf`) each cut two Ø6 holes 2 mm apart (centres x 14 and x 16), which makes a figure-of-eight.
- Put each hole on its own panel, at its own inset.

**1.5 The fan duct's square piece has no opening** (3D B4). The 140 × 140 square is solid, so it would block the duct. Add the inner opening, as `s2r` has.

**1.6 Gusset with flanges cuts without flanges** (3D B3). The `flange` size has no effect on the cut part. Either add the flanges and fold lines, or remove the flanges from the 3D and the name.

**1.7 Hopper with flanges** (3D B5): there's an odd notch where the lip meets the seam in the flat pattern, and the top flange is drawn twice in the 3D. Check the flat pattern first.

---

## Round 2: the Features list (the big one)

### Why
Today every hole, slot, bolt circle, cut-out and piece of text is a **separate part** lying on top of the plate. That one design choice causes 11 of the problems found:
- the Holes tab is empty (3D P1-2);
- new things land off to the right (3D P1-3);
- a bolt circle moves when its count changes (3D P1-4);
- typed positions drift by 0.02 mm (3D P1-5);
- a rotated slot loses its position boxes (3D P1-6);
- text arrives as 6 loose pieces (3D P1-7);
- position is in different tabs for different shapes (3D P1-8);
- Centre on part can't be found (3D P1-9, CAD A11 part);
- Cut out / Fillet / Scale turn a plate into an uneditable "Joined part" (CAD A10, 3D P1-10);
- overlapping holes give no warning (3D P1-11);
- picking a version wipes typed values (3D P1-1).

### The idea, in plain words
A **part** is its outline (plate, gusset, flange…) **plus a list of the things done to it**. Each thing is a row you can click to change, at any time, like the parts list in Fusion or Onshape, but kept simple.

```
┌ Plate with holes ─────────────── 200 × 150 · R10 ┐
│ ▸ Outline   Rectangle 200 × 150, corners R10     │
│ ● Holes     4 × Ø8.5, 12 mm from corners    👁 ⋯ │
│ ● Hole      Ø60 bore, centre of part        👁 ⋯ │
│ ● Bolt circle  4 × Ø6.5 on 80 PCD, 45°      👁 ⋯ │
│ ⚠ Slot      30 × 8.5, X 40 Y 75, 90°        👁 ⋯ │  ← overlaps the bore
│ ● Slot      30 × 8.5, mirror of the one above 👁 ⋯ │
│ ● Cut-out   Triangle 50 × 30, X 100 Y 130   👁 ⋯ │
│ ● Etch      "PORTA 01", 12 mm, X 100 Y 20   👁 ⋯ │
│ [ + Add ▾ ]                                       │
└───────────────────────────────────────────────────┘
```

### How it behaves
1. **Where it lives:** in the inspector's **Holes** tab, relabelled **"Features"** (keep the id). It shows whenever one part is picked. It replaces today's empty tab.
2. **Each row shows:** icon · type · a one-line summary of the sizes · a ⚠ if Check cut has a problem with it · an eye (hide it from the drawing *and* the cut) · ⋯ menu.
3. **Click a row:**
   - it opens in place, showing that feature's size fields;
   - **position X / Y (by centre)**, **angle**, and **measured from** (part centre · a corner · another feature's centre);
   - **how it's cut:** Cut · Etch · Mark for drilling (a small etched centre dot).
   
   On the drawing, the feature is highlighted and everything else on the part is greyed.
4. **Click a feature on the drawing** to open its row. **Drag it** to move it, and the X / Y in the row updates live. Arrow keys nudge by the snap step, and Shift + arrow by 10×.
5. **+ Add ▾** offers: Hole · Slot · Bolt circle · Grid of holes · Holes along an edge · Rectangle cut-out · Shape cut-out (any closed shape or preset) · Text · Etch line · Corner (round or chamfer one or all).
   - **New features always land at the centre of the part**, not off to the side, with their row open so the size can be typed straight away.
6. **The ⋯ menu offers:** Duplicate · **Mirror across centre** (left↔right or top↔bottom) · Make a pattern (circle, grid, along an edge) · Move up/down · Delete.
   - A mirrored copy stays **linked**: change one slot and its twin follows, until "Unlink".
7. **Patterns are one row:** "Bolt circle 4 × Ø6.5 on 80 PCD" is one feature with a count, not 4 loose holes. Its centre is stored as the centre, so changing the count never moves it.
8. **Text is one row** (one group) with X / Y / angle / height / font / cut-or-etch. Editing the words re-lays it in place.
9. **Exact numbers:** store exactly what was typed (centre X / Y, sizes) and build the geometry from it. Never read positions back from the drawn polygon, which is what causes 100.02 instead of 100.
10. **Live checks on each row**, using the job's material and thickness:
    - hole smaller than 1.5 × thickness ("drill it instead?");
    - feature overlapping another feature;
    - feature closer than 1.5 × thickness to the outline;
    - feature outside the part.
    
    The ⚠ links to the same message in Check cut.
11. **The outline row** holds the outline's own sizes (width, height, corner radius, and the version chips). **Changing version keeps every matching value** (corner radius stays 10). Features stay where they are, measured from the part centre.
12. **Corners as a feature:** Fillet or chamfer on a rectangle sets its corner radius. On other outlines it adds a "Corner R5 at 2 corners" row that you can change or remove later. The shape never becomes a fixed outline because of a fillet.
13. **Cut out / Join with another shape:** cutting a shape out of a part adds a **Shape cut-out** row; the part stays editable. Joining two plates is the only operation that makes a new combined outline. It's called **"Outline"** (not "Joined part"), and the features of both are kept as rows on the new part.
14. **Handles:** show handles only at real corners and feature centres. No dots on every arc join.
15. **Undo / Redo** treat a row edit as one step. **Ctrl+D** duplicates the open row; **Delete** removes it.
16. **Existing drawings:** on opening, any loose hole, slot or bolt circle that sits fully inside a part is offered as "Put 6 loose holes into this part?" (one click, undoable). DXF imports put holes into the part they sit in automatically.
17. **What gets cut doesn't change:** the CAM still gets the same outlines. Features are flattened to contours just before `cam.js`, so G-code and the cut order rules are untouched.
18. **Phone:** the same list, shown as a bottom sheet.

### Done when (Round 2)
Josh can build this motor-mount plate in under 5 minutes, typing only numbers, without dragging, and change any of it afterwards:
- 200 × 150 R10 plate;
- 4 × Ø8.5 corner holes;
- Ø60 bore;
- 4 × Ø6.5 bolt circle on 80 PCD at 45°;
- two mirrored vertical 30 × 8.5 slots;
- a triangle cut-out;
- etched "PORTA 01".

The tests for this are in Round 7.

---

## Round 3: Make-a-part tool bugs

**3.1 Measure never works.** Every click throws `pts is not iterable`. In `measureAt()` (`sketch-input.js` ~149), `detectCircle(c)` should be `detectCircle(c.pts)`. (CAD A1)

**3.2 The Length/Angle drawing box sits over the drawing** (x 448–1088, y 542–706 at 1536 × 730) and silently eats clicks. Dock it outside the canvas. (CAD A2)

**3.3 "⋯ More" opens off the top of the screen.** Open it beside the rail, fitted to the window. Make its search box visible. List every tool there, including Ungroup, Align right / top / centres, Distribute, Make tangent / concentric, Curve from points, Hole distance, Merge slivers and Standard flange. (CAD A3, A11)

**3.4 Etch line: Enter doesn't finish it**, though the hint says it does. (CAD A4)

**3.5 A two-point line can't be finished.** Allow an open cut line (with a Check cut note), or say "add one more point to close it". (CAD A5)

**3.6 The Rectangle / Circle buttons drop a fixed size**, while the R / C keys draw. Make the buttons draw (click-click and drag, with a live W × H); a double-click on the button drops a standard one. (CAD A6)

**3.7 Tool dialogs taller than the screen:** Add text (bottom fields off-screen) and Cut control (Do it / Cancel off-screen). Use 2 columns. (CAD A7)

**3.8 Escape doesn't close Trace a picture.** Every dialog closes on Escape and on a click outside it. (CAD A8)

**3.9 Arrange tab overflows:** the Position X / Y labels print on top of each other, and buttons are cut off at the left and bottom. This becomes simpler once Round 2 moves position into each row, but fix the overlap here regardless. (CAD A9)

**3.10 Make the dialogs consistent:**
- name the action ("Offset", "Make 3 copies"), not "Do it";
- Cancel always on the left;
- the app's own file button and switches, not native ones;
- "Automatic (recommended)" instead of "Automatic (current behaviour)";
- clear old toasts when a dialog opens. (CAD A12)

**3.11 Circle array default:** "PCD 0 = auto" stacks copies on top of each other. Make the default clear the part. (CAD A12)

**3.12 The spline shows ~50 handle dots.** Show only the clicked points. This is the same rule as Round 2 item 14, so do it here for drawn curves. (CAD A12)

---

## Round 4: screen polish

### Get to cutting, step 1 Part (r14 B1–B5)
1. Header row 2 sits on top of the panels when the pills read "Not connected" / "Practice + Ready + TORCH OFF".
2. "Cut speed" and "More cut options" are hidden under Next. Lay the right column out in fixed slots.
3. Practice run: use the app's switch, not an empty 44 px box.
4. Cut speed is shown twice. Keep one.
5. Balance the columns: move Practice run and More cut options to the half-empty left column.

### Setup (r14 B6–B10)
6. The left card's bottom line is cut off.
7. Check cut and Layout look like plain text. Give them the secondary button style.
8. Download G-code shows as a bare ↓. Use a download icon with a label or tooltip.
9. Torch card: the empty gap, two "i" icons, and tiny X/Y/Z chips. Use one bigger readout row.
10. Move the touch-off pill off the gantry rail.

### Cutting / Stopped (r14 B11–B14)
11. One "Torch off" status (sentence case), not a button-like box plus a header pill.
12. Fixed-width readouts with tabular numbers.
13. Show the demo hint on Setup only.
14. Stopped: close the empty gap and stop the action buttons wrapping.

### Make a part, visual only (r14 B15–B21, CAD C)
15. Version chips cut off ("Corner + ce…"). Use 2 columns.
16. Remove the duplicate "Size 120 × 80 mm" box.
17. Move the X 0 / Y 0 chips off the part outline.
18. Rail: top icons touch the border; group the three similar arc tools into one **Arc ▾**.
19. Simple: drop or quieten the duplicate **Remove** button.
20. Header: Select / Snap shouldn't be bold; Delete shouldn't be red when it can't be used. **Snap is set in two places** (the rail # and the header menu). Keep the header one.
21. Preset names cut with "…". Allow 2 lines.
22. Plain names for the expert tools: "Clean up tiny gaps" (Merge slivers), "Set hole position" (Hole distance).

### Machine setup (r14 B22–B23)
23. Jog strip: fixed-width readouts, a 3 × 3 arrow pad on the left, the step chips as their own group.
24. Put the "Bed and home" title inside its card.

### Every screen (r14 B24–B25)
25. One status pill ("● Practice · Ready"), not three.
26. **Bundle the Barlow font** (OFL licence), so buyers see the same layout as Josh. Re-run suite 96 straight after.

---

## Round 5: folded parts, accurate flat patterns and 3D

**5.1 Bend allowance** (3D B2). Flat patterns take nothing off for bends (`fold-parts.js`: "no extra k-factor deducted"), so folded parts come out oversized.
- Add **Sheet thickness** (default: the job's) and **Inside bend radius** to every fold preset.
- Shorten each flange by the bend deduction, with K ≈ 0.44–0.5 for air bending.
- Let Josh save a **measured deduction per thickness**, as the cut chart saves speeds.
- Say whether sizes are **outside** or **inside**.

**5.2 Build the 3D from the flat pattern and its fold lines**, instead of a separate hand-written model per preset (3D D). This fixes the eight wrong models in one go:
- chimney flashing (round and square);
- roof jack;
- skylight curb;
- cricket;
- pan flashing;
- dustpan;
- pipe clamp.

Keep hand-written models only where a fold-line unfold can't describe the shape (rolled cones, elbows), and check those with the Round 7 test.

**5.3 Holes go through to the 3D automatically.** Today about 15 presets cut holes that the 3D doesn't show (Z / U brackets, cable tray, corner guard, firepit, BBQ panel, pipe clamp, chimney / roof jack, tee template, saddle hole), and the fan duct shows one that isn't cut.

**5.4 Templates:** mark fishmouth, pipe-on-flat, tee template, Y-branch and britches as `template: true`. Draw the cut piece in the accent colour on the grey pipe.

**5.5 Fold direction** on the flat pattern: mark each fold "up" or "down".

**5.6 Make the pale fold lines visible** on the sign bracket, shelf bracket and pipe clamp.

**5.7 3D viewer extras:**
- thickness on every face (check it uses the job's thickness);
- dimension labels in 3D;
- an **Unfold** slider from flat to folded.

**5.8 Fix or gate `96_fold3d`:** the fold tile is no longer on page 1 of Preset parts since paging (r14 C5).

---

## Round 6: plasma cut quality

1. **Slow down for small holes:** holes under 25 mm at about 60 % speed (Hypertherm guidance). It's a cut-chart setting, on by default. `cam.js` currently cuts holes at full speed. (CAD D1)
2. **A hole lead-in:** an outward spiral from near the centre, used automatically for round holes. (CAD D2)
3. **The small-hole rule** (under 1.5 × thickness) is shown live in hole size fields, with **Mark for drilling** as the alternative. The engine is the same check as Round 2 item 10, so build it once. (CAD D3)
4. **A better cut order:** nearest-next plus a 2-opt pass to cut travel. Holes are still cut before outlines. (3D P1-13)
5. **Check cut in Make uses the job's material and thickness**, with a "Change" link, rather than asking again. (3D P1-12)

---

## Round 7: tests and CI (every new check from all three reports, in one place)

All of these go in the CI deploy gate.
1. **Safety (Round 1.1):** with Start confirm open, changing screen (Menu, ☰ → Machine setup, step tabs) cancels it, and no job starts. **A job can never run while STOP isn't visible.**
2. **Suite 96 additions:**
   - the header pill states "Not connected" and "Practice + Ready + TORCH OFF";
   - safety text (`#safetyHint`, run warnings) never clipped;
   - no toast over a control;
   - **every tool dialog opened**;
   - the **More** panel open;
   - the Holes / Features tab never empty when a part is picked.
3. **New `120_every_tool` e2e:** for every tool in `TOOL_GROUPS` + `HEADER_TOOLS`, at 1366 × 640 and 1536 × 730:
   - open it by a real click;
   - check its dialog fits and closes on Escape;
   - do one real mouse action;
   - check the drawing changed;
   - **no page error**.
4. **New `121_features` e2e:** build the Round 2 motor-mount plate by typing only. Check:
   - exact positions (100.00, not 100.02);
   - version change keeps the radius;
   - the bolt-circle centre is stable when its count changes;
   - mirror links work;
   - the plate stays editable after a cut-out;
   - the overlap ⚠ appears.
5. **New unit `40_fold_consistency`:** for every fold preset, fail if:
   - the flat and 3D areas differ by more than 2 % (templates excepted);
   - the hole counts differ;
   - the 3D size doesn't match the size fields;
   - **any two cut outlines overlap** (catches Round 1.4).
6. **New unit `41_bend_deduction`:** a 100 × 50 × 50 U-channel at 2 mm with K 0.44 gives the expected flat length.
7. **New unit `42_small_hole_speed`:** a Ø10 hole in a 3 mm job gets 60 % feed in the G-code; the outline keeps 100 %.
8. **Re-run phone 63 / 66** (not run since `5a609b2`).
9. **Escape-in-`innerHTML` lint** (Round 8.3).

---

## Round 8: code tidy (r14 C)

1. **CSS grows with each round** (6,702 → 7,844 lines; `screen-cut.css` 3,001 lines).
   - Add `@layer`.
   - Split `screen-cut.css` into part / setup / run.
   - Use container queries for the three columns, instead of size-specific overrides.
2. **Stop moving header nodes in JS** (`laptop.js` `safeInsert`). Place each control once, with CSS grid areas. This removes the cause of the header-row bugs in Round 4.
3. **One HTML-escape helper** in `core/dom.js`, instead of 5 copies plus an inline one, plus the lint in Round 7.9.
4. **Move the screen markup** out of `index.html` (1,208 lines) into the `html/` partials.
5. **Split `fold3d.js`** (1,465 lines) when Round 5 rebuilds it: unfold geometry / renderer / lightbox.
6. **New Round 2 code** goes in its own modules (`make/features.js` model, `make/features-ui.js` list), not into `sketch-edit.js` or `inspector-ui.js`.

---

## Round 9: before selling (r14 D)

1. **A stable release channel:** buyers get the `stable` version, which Josh promotes after a real cut; the last 3 versions are kept for rollback.
2. **"Set up your new table" guide:** connect → motor direction → torch test → edges → test coupon.
3. **"Send a problem report"** in ☰: version, settings, last job log and alarms, with no passwords or keys.
4. **Back up / restore machine settings** to a file.
5. **Consumables counter** (tip and electrode pierces, with a reset) and **tip size** feeding the kerf.
6. **Cut history:** date, part, material, thickness, time, finished or stopped.
7. **Install for offline use** (Josh said not yet; this is a reminder only).

## Round 10: later / nice to have

1. Point editing on any outline: drag, add or delete points; edge ↔ arc. (CAD D4)
2. A live distance-between-parts readout while dragging. (CAD D5)
3. Copy along a path, plus holes along a curved edge (partly covered by "Holes along an edge" in Round 2). (CAD D6)
4. Numbered copies in text ("TAG 001–050"). (CAD D7)
5. "As many as fit on the sheet" in Array. (CAD D8)
6. Keep DXF layers and blocks (cut / etch / drill). This finishes F11. (CAD D9)
7. Typed sizes in Rectangle / Circle ("120 × 80", "Ø40"). (CAD D10)
8. Inch units, if selling abroad. (CAD D11)
9. The live Z readout and Set top button (older offer).

## Waiting on Josh (no build)
- Run the r9 SQL.
- The Bluetooth test.
- Confirm the Andeli order (then the arc-OK / pilot-arc work).
- "Start here" → "Set sheet corner here"?
- Which rounds to approve.

---

### Where each old item went
- **r14:** A1–A3 → 1.1–1.3 · B1–B14 → Round 4 items 1–14 · B15–B21 → Round 4 items 15–21 · B22–B25 → Round 4 items 23–26 · C1–C6 → Round 8 + 7.8 + 5.8 · D1–D10 → Round 9 + 10.9 (Andeli is under "Waiting on Josh").
- **CAD:** A1–A12 → Round 3 (A10 → Round 2) · B (what works) → no change · C1–C5 → Round 4 items 16, 18–20, 22 · D1–D3 → Round 6 · D4–D11 → Round 10 · E → 7.3.
- **3D:** Part 1 items 1–11 → Round 2 · items 12–13 → Round 6 · B1, B3–B5 → Round 1 · B2 → 5.1 · C → 5.2 · D → 5.3–5.4 + 7.5 · E → 5.5–5.7.
