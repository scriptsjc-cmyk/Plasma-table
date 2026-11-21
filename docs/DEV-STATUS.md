# Dev status (kept by the app developer)

The checker reads this file. Its rules are in README.md on the `checker-reports` branch. Plan: `combined-plan-r15.md` (Josh changes it).

Last updated: 21 Nov 2026, 12:20 (UK time). Live: see `version.json`.

## Working on
- r15 Round 4 (screen polish), starting next. (Live signed-in motor-mount run: Josh does this himself at a later round end, t544u.)

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

## Why 96/113 missed report items 1 and 2
- Item 1: the walk only ever opened the Size and Holes tabs in Advanced, never Arrange. Now "make-advanced-arrange" at every size.
- Item 2: the walk stopped a ONE-part job before its first pierce, so Save speed, "Stopped during cut N" and Continue from cut never
  showed. Now "cut-stopped-midjob": 3 parts, speed changed, STOP after cut 2, checked before and after the E-stop reset.

## Next up
- r15 Round 4 (screen polish), items 1–26

## Not a bug
- Report ❌ "41 item 11 since 55c3d71": not the app. 55c3d71 also changed `tests/lib/browser.mjs` launchKillable to a real laptop
  Chrome (hover + fine pointer), so 41 now gets the r13 laptop bed layout, where Link a machine sits in the header connection menu
  by design. 75b7df1's app code shows the same layout under the new launcher. 41 still expects the touch layout; I'll fix the
  test to match each layout in Round 7/8 (no app change, nothing weakened).

## For Josh to decide (found while testing, not in the plan; all there before r15)
- Menu > Export DXF / SVG on a laptop opens nothing: the pop-up sits inside a wrapper hidden at laptop sizes (css/screen-make.css,
  from 5a609b2, 20 Nov). Same family: e2e 47 waits for "Save G-code as" and it never shows. Fix now, or Round 7/8?
- e2e 49 ESTOP ×3: Space sends "!", Ctrl-X and then "$$" (a settings read), where the STOP button sends only "!" and Ctrl-X; and
  Space on Make is not ignored. Same on 71e68d5. A stop is always sent first, so it is the safe direction, but it is the STOP path,
  so I have not touched it (house rule). Your call.

## Questions for the checker
- 2.17 (G-code unchanged when a part has no features): the developer checks it before every geometry/import push with `tmp/precheck.sh` (339 presets + 35 DXF/SVG byte-identical). Can you confirm it independently on the next push?
- Pre-existing failures outside the deploy gate (listed for Round 7/8): 57 ×3, 52 item 21, 10 (Advanced persists, line-array timeout), 41 item 11 (see Not a bug), 55 section 11, 53, 58 (Nest panel; crashes at a hidden select), 65 "Advanced tools" label 13 px ×2, 69_phone_cut (#torchBig at 320×568), 69_simple_advanced_phone (Advanced not kept after reload), 71 ×4, 73_r7_make ×8, 83, 85 (C46/C48/C49), 96_fold3d ×3, 106_r9_features ×2 (F10 rail list, ME1 checklist), 47 (Save G-code as never shows), 49 ESTOP ×3. The new ones (47, 49, 65, 69, 73, 106) fail identically on 71e68d5, before the Round 3 work. Do you see any of these, and do you agree they were there before r15?
