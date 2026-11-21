# Dev status (kept by the app developer)

The checker reads this file. Its rules are in README.md on the `checker-reports` branch. Plan: `combined-plan-r15.md` (Josh changes it).

Last updated: 21 Nov 2026, 16:12 (UK time). Round 4 is live @ ec7cf4b (CI run 44921063938 green); this push adds two Round 4 follow-ups. Live: see `version.json`.

## Working on
- r15 Round 5 (folded parts, flat patterns, 3D), starting with 5.1 bend allowance, tests first. (Live signed-in motor-mount run: Josh does this himself at a later round end, t544u.)

## Ready to check
- r15 Round 1 (1.1–1.7) @ bb5aadb (already ✅ in the first report)
- r15 7.1, 7.2 (113_r15_fits), 7.3 (120_every_tool), 7.4 (121_features), all in the deploy gate @ bb5aadb
- r15 2.1, 2.3–2.5, 2.7–2.11, 2.13, 2.14, 2.16 (loose holes on open + DXF/SVG auto-adopt, 122_loose_holes) @ bb5aadb
- r15 3.1, 3.3, 3.7, 3.8 @ bb5aadb
- r15 2.12 Corners row (Fillet / Chamfer / Relief keep the shape editable; click-a-corner mode) @ 17bfc56, e2e 121 corner click @ f3d2a2b
- r15 2.6 Pattern (grid / circle / line) for slots, cut-outs, text, etch lines @ 48e4c50
- r15 2.2 Text row summary says where it is @ 549b7e5
- r15 2.18 phone Features bottom sheet (e2e 123_features_phone, now in the deploy gate) @ f904d5d
- r15 3.9 Arrange tab fits (your report item 1; every laptop size, not only 1280×600) @ 082955a, test @ 99965ed
- r15 4.14 Cut > Stopped: Download G-code on screen at 1280×600 (your report item 2) @ 3d47ed1, test @ 99965ed
- r15 2.19 (Josh t543u) a bigger size typed in the Size tab refits the view like Fit @ dd5f6ba, test @ 0c2358a
- r15 2.17 (no features = G-code unchanged): 339 presets + 35 DXF/SVG byte-identical before this push (tmp/precheck.sh)
- r15 2.15 Ctrl+D / Delete on a Features row (one undo each; also fixed: Delete on a focused row used to delete the whole part) @ 72b3783, test @ 94e3301 (made steadier under load @ b929d71)
- r15 Round 3, all checked by the new e2e 124_r15_round3 (67 checks, in the deploy gate @ 283dedf), tests @ 410e541:
  - r15 3.4 + 3.5 Enter finishes an etch line as an open mark; a two-point line says "add one more point or use Etch line" @ bcc2689
  - r15 3.2 the Length / Angle box docks over the side panel on a laptop, never over the drawing (1536×730, 1280×600) @ 038bd47
  - r15 3.11 Circular array with PCD 0 = auto: copies clear each other by 10 mm (4 and 8 round) @ 8d298da, test @ 13def84
  - r15 3.12 a spline shows dots only at the clicked points, arc-middle squares only on the picked edge @ bcf8fbd, test @ d431d84
  - r15 3.6 Rectangle / Circle buttons draw (click-click or drag, live W × H); double-click drops a standard one @ cc658e4, test @ b90e583
  - r15 3.10 tool dialogs: main button names the action ("Offset", "Make 3 copies", "Apply to the job"…), Cancel on the left,
    the app's switches and file button, old toasts cleared on open, "Automatic (recommended)" @ f6e1654, test @ 8a1e8a2;
    switches kept switch-shaped @ a52b7e6, test @ db5bad6; Add parts file button, Cancel first in Save the drawing /
    Save G-code as / Edit edge, no "Do it" in the Fillet / Chamfer help @ 33cfa50, test @ e764dbe
    (the saved-part rows in Add parts are a pick list, so they keep tick boxes; the safety dialog's buttons were not touched)
  - 339 presets + 35 DXF/SVG byte-identical before the push (tmp/precheck.sh)

- r15 Round 4 (screen polish), all checked by the new e2e 125_r15_round4 (212 checks, in the deploy gate @ 82d99d8):
  - your 11:47 New problems 1 + 2 (phone help line said twice; sideways pill over the Features sheet) @ 719194e, test @ c6c5189
  - r15 4.x-extra (Josh 21 Nov): ☰ Export DXF / SVG on a laptop opens its pop-up (it sat in a hidden wrapper); same fault fixed
    for Save G-code as (e2e 47 now gets past it) @ 9f58d62, test @ 5118952
  - r15 4.1 + 4.2 were already done by 7.2 @ 55c3d71 (tests @ 872e3e3 pass before any change)
  - r15 4.3 Practice run is a switch, 4.4 Cut speed shown once, 4.5 run options in the left column @ 3a6720e, test @ 872e3e3
  - r15 4.6–4.10 Setup: bed line + checklist wrap, Layout / Check cut secondary, Download G-code shows icon + "G-code",
    Torch card one i, bigger lamps, one X/Y/Z row, touch-off tag clear of the X beam and axis names @ 92b0334, test @ f04dd16
  - r15 4.11–4.14 + 4.25 one header pill (● Practice · Ready, a lit TORCH ON joins it loud), Torch off a plain line,
    tabular readouts, Demo hint on Setup only, Stopped actions one line each under the message @ 13695b3, test @ e8e09fa
  - r15 4.16 + 4.22 no greyed Size box; "Set hole position" / "Clean up tiny gaps" (old names still searchable) @ 9fadbda
  - r15 4.15 + 4.17–4.21 versions in 2 columns, X/Y chips off the outline, one Arc ▾ rail button, Select/Snap normal weight,
    Delete red only when it can delete, Snap only in the header (still in ⋯ More), preset names on 2 lines, quiet Remove;
    ⋯ More's 28 px rows now really apply at 600 px tall so it still fits over the drawing @ 9935557, tests @ 1632269
  - r15 4.23 + 4.24 Machine setup jog strip (3 × 3 pad left, fixed-width readouts, boxed "Step" group), "Bed and home"
    heads the bed card @ fc315ec, test @ 089c3b4
  - r15 4.26 Barlow bundled (OFL, fonts/OFL.txt), page font, precached @ cf46f75, test @ 7787224. Your 1440 × 800
    "Lowest point / Floating head" overlap: the bold term now stays on one line (same commit)
  - 339 presets + 35 DXF/SVG byte-identical before this push (tmp/precheck.sh)
  - follow-ups found in the Round 4 screenshots: Machine setup opened from Cut › Setup lost its Floating head / Torch / E-stop
    lamps (a Cut jog-card rule, from 20 Nov) @ d464c55, test @ 5f129d5; Snap showed on the rail as well right after
    switching to Advanced (rail drawn before the header Snap ▾) @ 98e7a66, test @ 7cfe949. e2e 125 now 220 checks.

## Why 96/113 missed report items 1 and 2
- Item 1: the walk only ever opened the Size and Holes tabs in Advanced, never Arrange. Now "make-advanced-arrange" at every size.
- Item 2: the walk stopped a ONE-part job before its first pierce, so Save speed, "Stopped during cut N" and Continue from cut never
  showed. Now "cut-stopped-midjob": 3 parts, speed changed, STOP after cut 2, checked before and after the E-stop reset.

## Next up
- r15 Round 5, tests first.

## Not a bug
- Space-bar STOP path (e2e 49 ESTOP ×3: Space also sends "$$" after "!" + Ctrl-X, and is not ignored on Make; 55 section 11 ×4):
  Josh: keep as is (21 Nov, relayed). A stop is always sent first.
- Report ❌ "41 item 11 since 55c3d71": not the app. 55c3d71 also changed `tests/lib/browser.mjs` launchKillable to a real laptop
  Chrome (hover + fine pointer), so 41 now gets the r13 laptop bed layout, where Link a machine sits in the header connection menu
  by design. 75b7df1's app code shows the same layout under the new launcher. 41 still expects the touch layout; I'll fix the
  test to match each layout in Round 7/8 (no app change, nothing weakened).

## For Josh to decide (found while testing, not in the plan; all there before r15)
- Nothing open (the Export pop-up was fixed in 4.x-extra; the space bar is under Not a bug).

## Questions for the checker
- 41 item 11 (your request): `node run-all.mjs 41` fails item 11 ×3 on 75b7df1, on 55c3d71, and on HEAD (rerun 21 Nov 15:50 at 82d99d8) with today's `tests/lib/browser.mjs`.
  The difference between your two runs is the launcher: 55c3d71 changed launchKillable from raw headless Chrome (no hover, so the
  touch layout) to Playwright's Chrome (hover + fine pointer, so the r13 laptop layout, Link a machine in the header menu). See Not a bug.
- 2.17 (G-code unchanged when a part has no features): the developer checks it before every geometry/import push with `tmp/precheck.sh` (339 presets + 35 DXF/SVG byte-identical). Can you confirm it independently on the next push?
- Pre-existing failures outside the deploy gate (listed for Round 7/8): 57 ×3, 52 item 21, 10 (Advanced persists, line-array timeout), 41 item 11 (see Not a bug), 55 section 11, 53, 58 (Nest panel; crashes at a hidden select), 65 "Advanced tools" label 13 px ×2, 69_phone_cut (#torchBig at 320×568), 69_simple_advanced_phone (Advanced not kept after reload), 71 ×4, 73_r7_make ×8, 83, 85 (C46/C48/C49), 96_fold3d ×3, 106_r9_features ×2 (F10 rail list, ME1 checklist), 49 ESTOP ×3 (Josh: keep as is). Round 4 found more, all identical on the commit before each change: 40_layout_a11y ×6, 47 [iphone14] library search 'l bracket' (hidden behind the old Save G-code as crash), 47 'TORCH ON pill' once under load (passes alone: flaky), 52 slothole crash, 63 ×4, 72_make_header ×4 + crash, 76 item 11 ×2, 77 ×4 (d1440/d1366 info icon), 100 'long help behind i icons' ×1. The new ones (47, 49, 65, 69, 73, 106) fail identically on 71e68d5, before the Round 3 work. Do you see any of these, and do you agree they were there before r15?
