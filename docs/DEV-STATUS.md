# Dev status (kept by the app developer)

The checker reads this file. Its rules are in README.md on the `checker-reports` branch. Plan: `combined-plan-r15.md` (Josh changes it).

Last updated: 21 Nov 2026, 20:03 (UK time). This push is r15 5.9 / 5.10 (Josh 21 Nov) and Round 7 (7.5–7.9), with r15 7.5-saddle (Josh 21 Nov); Round 6 is live. Live: see `version.json`.

## Working on
- Nothing open from Round 7. 7.8 left two pre-existing phone/laptop layout failures (below) for Round 8. (Live signed-in motor-mount run: Josh does this himself at a later round end, t544u.)

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

- r15 Round 5 (folded parts, flat patterns, 3D), checked by unit 34–39 and the new e2e 126_r15_round5 (30 checks, in the deploy gate @ a7477ce):
  - r15 5.8 e2e 96_fold3d finds the fold tile in Preset parts by name (paging moved it off page 1) @ 2e4c03b. 14/15: the last is the
    iPhone 14 Make picture height (119 px, same root as e2e 63), so 96_fold3d stays out of the gate (Round 7/8 list)
  - r15 5.1 bend allowance: every folded preset gets Sheet thickness (0 = the job's), Inside bend radius, K-factor, Measured
    deduction and "Sizes are Outside / Inside / As cut"; flanges are shortened by the deduction; a measured deduction can be saved
    per thickness like the cut chart @ b6bd65d, tests @ 87ec045, f0608eb
  - r15 5.2 the 3D is built from the flat pattern and its fold lines (js/make/flat3d.js) instead of hand-written models; the eight
    wrong ones fixed (pan flashing, skylight curb, chimney round + square, roof jack, cricket, dustpan, pipe clamp: its feet now
    fold out at the fold lines) @ 6d932d8, tests @ fb08be4, aede102. Rolled cones / elbows keep their own models
  - **Cut change, on purpose:** the dustpan bottom's back edge was 1.5 × the back width (it didn't meet the back); it now matches.
    precheck: 339 presets identical except dustpan (new + saved); 35 DXF/SVG identical
  - r15 5.3 holes go through to the 3D: Z / U brackets (U-bracket holes on the legs), firepit, BBQ panel, cable tray, corner guard
    are folded from their cut pattern; saddle hole / tee template show their hole; cyclone hopper no longer shows a ring that isn't
    cut @ dac82a4, tests @ 86356a7
  - r15 5.4 fishmouth, pipe-on-flat, tee template, Y-branch, britches are `template: true`: the template is drawn in accent blue on
    a grey pipe, with a caption saying so @ b90ef5d, tests @ d7a1f08
  - r15 5.5 each fold line carries up / down (and its angle when not 90°); the drawing marks ▲ Up / ▼ Down (Make only, up to 12 folds
    per part) and the 3D folds the same way @ ae31f44, tests @ d818df8
  - r15 5.6 fold lines are darker amber, longer dashes, with a light halo, so they show on narrow strips (sign bracket, shelf bracket,
    pipe clamp); dark-theme tokens @ 15571f1, test @ 5785d53
  - r15 5.7 3D viewer: drawn at the part's sheet (its own bend thickness, else the job's), overall sizes in mm on the view (neutral
    ink, since blue means "template"), an Unfold slider (0 flat, 100 folded; not shown on rolled parts; a new part starts folded)
    @ 7a949ef, 4a5f10e, tests @ 3f2d109
  - Screenshots: briefs r5-1 … r5-8 (Josh has them)

- r15 Round 6 (plasma cut quality), checked by unit 42–45 and the new e2e 127_r15_round6 (28 checks, in the deploy gate @ 182c853):
  - r15 6.1 (also plan 7.7) holes under 25 mm cut at 60 % of the cut speed: cut chart `small_holes` (on, 25 mm, 60 %, source
    noted), switch "Slow down for small holes" in More cut options (remembered). CAM tags the run `(PORTA-SLOW 60)`; the job builder
    sets the slower F at that pierce only, and the time estimate counts it @ 2aff779, tests @ a5219fe, 0a284c3
  - r15 6.2 round holes (r ≥ 0.8 mm, lead-in on) pierce near the centre and spiral out onto the line: two arcs inside the hole,
    tangent at the join. Only where every point of the lead is scrap; outlines, discs and tight holes keep the old lead @ 54476ef, test @ 7d544bc
  - r15 6.4 automatic cut order = nearest-next plus a 2-opt pass per depth; holes still before outlines; never more travel; capped by
    work, not by the clock, so the same drawing always gives the same G-code @ f506695, test @ 251f8de
  - r15 6.3 one small-hole rule (`js/make/holerule.js`, under 1.5 × thickness) for the Features rows and every hole-size field: shown
    live under the field with "Mark for drilling" (draws a drill cross, mark op, instead of cutting it; "Cut it instead" undoes; one undo
    step); Features hole rows get op "Mark for drilling" @ 1e75c5b, tests @ 642c0bf, ba783aa. Limits: the phone quick sheet has no note
    yet; drill marks match by size, so two hole fields of the same size on one part are marked together
  - r15 6.5 Check cut in Make checks straight away for the job's material and thickness ("Checked for the job's sheet: mild steel, 3 mm."),
    with Change to pick another (it becomes the job's); no job material = asks as before @ f21c4b0, test @ fe3ad70
    Also fixed, found in the r6 screenshots: the Check cut box was the only dialog without the overlay class (since 12 Nov), so it
    opened under the page and squashed the drawing; it now opens over it like the others, with the dialog card background
    @ b3c76e9, 846d218, tests @ 416f4ef, ef6996d
  - e2e 127 also checks the app's own job: a flange's round holes spiral in and the outline is cut last @ 36e6080
  - **Cut change, on purpose:** G-code differs for 187 of 339 presets (precheck, new defaults): 155 only by the spiral hole leads,
    2 only by the cut order (boltcircle, holegrid), 30 by both (baseplate, flanges, motormount, brackets…); 0 for any other reason.
    The other 152 (no round holes big enough, one cut) are byte-identical. 2 of 35 DXF/SVG differ (motor-mount.dxf, plate-circles.svg:
    round holes). Slow-hole tags come on top of this in the app (chart setting). The old path is still there
    (`holeSpiral: false, tidyOrder: false`): with it, precheck gives 339 presets identical except dustpan (the Round 5 fix) and 35 DXF/SVG
    identical. A second check (`tmp/r6-cutsame.mjs`) takes every cut with its lead removed: the same cuts for all 339 presets
    (505 spiral leads, 32 parts in a new order, 0 bad), and every hole still before its outline
  - Test kit change (disclosed, nothing loosened): `tests/lib/analyze.mjs` records where each move ends and `tests/lib/verify.mjs` also
    accepts a loop that starts after a two-arc spiral lead. The old one-move-lead check is unchanged
  - **Found by the gate (DEMO-SAFETY), fixed:** on connect, the motor-direction read could ask the controller `$$` after Start; the ask
    waited behind the job and went out right after it ended (only with jobs over ~5 s, so the longer Round 6 demo job showed it). It now
    never asks while a job runs @ 84acdc8, test @ b78e33f (e2e 127, fails before the fix)
  - e2e 20 STOP-STREAM counted from a mark taken just before the STOP press, so a job line written 10 ms before the press counted as
    "after STOP" (timestamps checked). It now counts from the press itself; without a press time it keeps the old, stricter window @ f9d612d
  - Screenshots: briefs r6-1 … r6-7, r6-5b (Josh has them)

- r15 5.9 / 5.10 (Josh 21 Nov), 3D only (cut G-code byte-identical), tests @ 73c9a08 (unit 46) + 0ca1437:
  - 5.10 folded pieces are thickened from the drawn surface toward the inside of their bends (outside sizes = the sizes drawn) @ f6e823e
  - 5.9 skylight curb flashing: head / sill pans wrap their upstand ends round the curb corners, side pans lap over them @ 861580e
  - test changes (disclosed, they followed the approved spec): unit 35 skylight block now checks the wrapped model; unit 39 U-bracket
    outside width = web (was web + sheet under the old about-the-middle rule)
  - Screenshots: briefs r7-59-skylight-3d(-view/-expanded), r7-510-ubracket-3d(-view)
- r15 Round 7 (tests and CI), all in the deploy gate (units run automatically):
  - 7.5 unit 40_fold_consistency @ 5fc5fea (93 fold presets: areas within 2 %, same holes, every size field that changes the cut
    changes the 3D, no overlapping outlines, exact sizes for foldubr / tube / rectelbow / redelbow). It found 3D models that did not match
    their cut; each fixed from the cut, test first:
    - rectangular duct elbow (sizes swapped, uncut stubs) @ d76d7f6; round duct take-off (was the tube alone) @ b3ee939; saddle-hole wrap
      @ f2d6016 (+ unit 40 counts declared openings @ 321c02d); reducing elbow @ f048af5 / fef167c (see For Josh to decide);
      offset rectangular transition ignored ox @ c8a6d62 / 0d3b012 (also: the bottom flange of offset transitions was moved with the top);
      hopper with flanges drew a closed mitred flange frame the cut lip cannot fold into @ 5587b5e / 324a7a7
    - **CUT CHANGE, offset square-to-round (`s2roffset`)** @ f3b1346 / 15a2237: its side panels folded back over themselves in the
      flat (developSide3 took the fan point on the wrong side), so the blank was about a third too small (69,867 vs 103,241 mm² even at a
      0.001 mm offset). Now the true development (unit 47: area, base and seam lengths against an independent triangulation). Josh can veto.
    - 3D viewer: ghost parts (main duct, header, plate) were framed on their own, at another size and place @ 47cebc1 / ad726f9; sitting a
      thickened 3D on the table moved shared points 2–3 times and left holes behind (only visible when the shift wasn't 0, e.g. the
      take-off over its duct) @ e1c2af8 / 6018ae9 (unit 50)
  - 7.6 unit 41_bend_deduction @ 53f23f4 (100 × 50 × 50 U at 2 mm, K 0.44 → 193.047786 mm, fold lines at leg − BD/2)
  - 7.7 unit 42_small_hole_speed (done in Round 6)
  - 7.8 phone 63 / 66 rerun 21 Nov 19:32: 63 fails 1 ("5 phone: picture ≥ 55 % of the Make pane": 200 of 373 px = 54 %), 66 fails 2 (laptop
    toolbar "wraps under the picture" ×2: the r13 layout puts it in a column). At 5a609b2 (their last run) 63 failed 4 and 66 the same 2,
    so nothing new; both stay out of the gate and are on the Round 8 list
  - 7.9 unit 48_r15_html_escape (escape-in-innerHTML lint) @ c287745: every innerHTML / outerHTML / insertAdjacentHTML template in js/
    must escape names, labels, titles, notes, messages, errors and file names; self-tests that it catches raw ones. Fixed @ 408a2f6:
    Check cut dialog material names (attribute and text), its error text and result lines (my Round 6 code), start-point and coupon labels,
    cut status, context menu, pager, the size-check file name (its inline copy now uses the shared `esc` from core/dom.js)
  - **r15 7.5-saddle (Josh 21 Nov), CUT CHANGE**: the pipe-on-pipe saddle template was the right curve upside down
    (R − √(R² − r²sin²θ) instead of √(R² − r²sin²θ) − √(R² − r²)), so it rocked on the header (6.35 mm gap for 100 on 110, 0.62 mm for
    80 on 140). Tests @ c5b0540 (unit 49: exact intersection at 80/140, 100/110, 80/120, 50/200, 150/160, 100/100; the wrapped edge lies on
    the header; the four presets cut it; the take-off 3D collar sits on its duct), fix @ a57c4a6 (take-off 3D duct turned to match)
  - test changes (disclosed): unit 22 C9 "opposite offset panels are not identical" wanted south ≠ north for an x-only offset (only true
    while the panels lapped); now east ≠ west and south = north. Unit 19 "offset s2r falls back to two halves" (the overlap was the bug)
    now: one blank at defaults, two halves when it's too big for the bed. Unit 32's 1.7 hopflange "one closed frame" check now: the 3D
    flange is the cut lip and no strips cross (the other 1.7 checks unchanged). tests/data/existing-preset-flat.json updated for
    s2roffset, fishmouth, takeoff, britches, teetemp only
  - Precheck: DXF/SVG 35 byte-identical. Presets vs live Round 6 (c31bd09), normal settings: 334 of 339 byte-identical; changed exactly
    britches, fishmouth, takeoff, teetemp (7.5-saddle) and s2roffset (7.5). Classic mode vs the old baseline: those five plus dustpan (Round 5)
  - Screenshots: briefs r7-75-redelbow-3d, -hopflange-3d, -recttransoff-3d, -takeoff-3d(-expanded), -s2roffset-3d, -fishmouth-cut (+ -view)
  - Full gate passed (71 suites) at HEAD before the push

## Why 96/113 missed report items 1 and 2
- Item 1: the walk only ever opened the Size and Holes tabs in Advanced, never Arrange. Now "make-advanced-arrange" at every size.
- Item 2: the walk stopped a ONE-part job before its first pierce, so Save speed, "Stopped during cut N" and Continue from cut never
  showed. Now "cut-stopped-midjob": 3 parts, speed changed, STOP after cut 2, checked before and after the E-stop reset.

## Next up
- r15 Round 8 (code tidy), plus the pre-existing failures list (incl. 63 ×1, 66 ×2 from 7.8).

## Not a bug
- Space-bar STOP path (e2e 49 ESTOP ×3: Space also sends "$$" after "!" + Ctrl-X, and is not ignored on Make; 55 section 11 ×4):
  Josh 21 Nov: keep as is (his own answer card). A stop is always sent first.
- Report ❌ "41 item 11 since 55c3d71": not the app. 55c3d71 also changed `tests/lib/browser.mjs` launchKillable to a real laptop
  Chrome (hover + fine pointer), so 41 now gets the r13 laptop bed layout, where Link a machine sits in the header connection menu
  by design. 75b7df1's app code shows the same layout under the new launcher. 41 still expects the touch layout; I'll fix the
  test to match each layout in Round 7/8 (no app change, nothing weakened).

## For Josh to decide (found while testing, not in the plan; all there before r15)
- **Reducing elbow (`redelbow`) cut does not make an elbow.** It cuts a square-ended cone and two "end" gores (each one square end, one
  mitred end at bend / 4). Pieces only join where diameters and ends match, so the only way they go together is gore – cone – gore,
  square to square: a straight reducer with a slanted cut at each end. The 3D now shows exactly that (r7-75-redelbow-3d). A real reducing
  elbow needs a different development (e.g. tapering gores). Your call: redesign the cut, rename it, or keep it.
- Saddle hole (`saddlehole`): the hole cut in the header wrap is a flat circle; the true developed hole is slightly wider round the wrap
  (about 2.4 mm each side for 70 on 120). Fix or leave?

## Questions for the checker
- e2e 20 STOP-STREAM change (f9d612d, accepted by the reviewer): it now counts job lines from the moment of the STOP press (button
  pointerdown / Space keydown), not from a mark taken ~ms before it. Please confirm independently that STOP still sends nothing from the
  job after the press: button and Space, mid-cut, on the practice table (timestamps of every byte after the press).
- Cut changes in this push (please check independently): `s2roffset` (offset square-to-round, now the true development, unit 47) and the
  saddle template in fishmouth / takeoff / britches / teetemp (unit 49: exact pipe-on-pipe intersection). Do the cut pieces fit?
- 41 item 11 (your request): `node run-all.mjs 41` fails item 11 ×3 on 75b7df1, on 55c3d71, and on HEAD (rerun 21 Nov 15:50 at 82d99d8) with today's `tests/lib/browser.mjs`.
  The difference between your two runs is the launcher: 55c3d71 changed launchKillable from raw headless Chrome (no hover, so the
  touch layout) to Playwright's Chrome (hover + fine pointer, so the r13 laptop layout, Link a machine in the header menu). See Not a bug.
- 2.17 (G-code unchanged when a part has no features): the developer checks it before every geometry/import push with `tmp/precheck.sh` (339 presets + 35 DXF/SVG byte-identical). Can you confirm it independently on the next push?
- Pre-existing failures outside the deploy gate (listed for Round 7/8): 57 ×3, 52 item 21, 10 (Advanced persists, line-array timeout), 41 item 11 (see Not a bug), 55 section 11, 53, 58 (Nest panel; crashes at a hidden select), 65 "Advanced tools" label 13 px ×2, 69_phone_cut (#torchBig at 320×568), 69_simple_advanced_phone (Advanced not kept after reload), 71 ×4, 73_r7_make ×8, 83, 85 (C46/C48/C49), 96_fold3d ×1 (iPhone 14 picture 119 px; was ×3 before 5.8), 97_pro_panel_scroll ×6 (panel no longer overflows since Barlow, same at HEAD before Round 5), 106_r9_features ×2 (F10 rail list, ME1 checklist), 49 ESTOP ×3 (Josh: keep as is). Round 4 found more, all identical on the commit before each change: 40_layout_a11y ×6, 47 [iphone14] library search 'l bracket' (hidden behind the old Save G-code as crash), 47 'TORCH ON pill' once under load (passes alone: flaky), 52 slothole crash, 63 ×1 (was ×4; rerun 21 Nov for 7.8), 66 ×2 (7.8), 72_make_header ×4 + crash, 76 item 11 ×2, 77 ×4 (d1440/d1366 info icon), 100 'long help behind i icons' ×1. The new ones (47, 49, 65, 69, 73, 106) fail identically on 71e68d5, before the Round 3 work. Do you see any of these, and do you agree they were there before r15?
