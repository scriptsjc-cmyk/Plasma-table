# Dev status (kept by the app developer)

The checker reads this file. Its rules are in README.md on the `checker-reports` branch. Plan: `combined-plan-r15.md` (Josh changes it).

Last updated: 22 Nov 2026, 06:36 (UK time). Live: r15 Round 10 @ 21e59af (CI green, version.json 2026.11.22-21e59af), on top of the editor-redesign test review and Round 9. Working on: nothing new until Josh answers the questions below.

## r16 – done by Claude while the developer was away (branch `claude-r16`; LIVE on main @ 9662935 since 22 Nov 16:15, Josh: "Go live")
Josh, 22 Nov 13:13: "Would you be able to do this update as dev is out of action for abit" → Rounds A, B and C of
`porta-plan-r16.md` (project doc), test branch first; 13:17: "I also need a more tidier code" (split the big files).
- A0 Porta Plazma → Porta Plasma everywhere (40 places). Old `porta-plazma-machine-backup` files still restore (OLD_BACKUP_KINDS).
  Not in the app (Josh does these): Supabase e-mail templates, re-upload config.yaml to the ESP32, stickers / adverts.
- A1 folded presets whose sizes say "Inside" start on Sizes are: Inside (bends.js attachBendAllowance). A2 dustpan: no change –
  the 3D base IS tapered (the checker's earlier note was wrong).
- B the ANDELI CUT-65DS is the default plasma: config/cut_chart.json is its chart (profile, supplies, nozzles, duty, per-material
  limits, more materials via `same_as`); the Reboot 60A chart moved to config/cut_chart_reboot60.json (Settings › Torch › Your
  plasma, reload to switch). js/cut/plasmaprofile.js holds the pure logic (rowFor between rows, supply caps, cutStatus badges,
  duty cycle, parseThickness). Cut › Material: More… materials, Other… thickness, "Set your Andeli to" card (amps, PSI, nozzle,
  2T/ECO), badges, duty line, "Plugged into" supply (13 A / 110 V notice once; Next asks once when over the supply's limit),
  Best edge / Balanced / Fastest. Coupon result: admin can publish it as the tested factory value.
  Machine.findCut uses rowFor for a thickness between rows (exact rows unchanged, so existing G-code is unchanged).
  NOT done: the 75 % exit slow-down for edge starts (needs the sheet edges in the CAM); edge start is a badge + advice.
- C1 Toolbar position offered on phones / tablets only. C2 44 px mode switch + preset tabs on laptops ≥ 760 px tall;
  "More holes" back on laptop Simple as a pop-over. C4 report.js DROP_KEY; e2e 30 skips only the scrubber's own pattern lines.
  C3 (load time) NOT done: 205 start-up modules over HTTP/1.1 in the test; needs a bundler in the deploy (no network here).
- Tidy: screen-make.css → +laptop +panels; screen-cut.css → +laptop +setupgrid (rules hashed identical); sketch-edit.js →
  +sketch-arrange.js +sketch-shapeops.js; 8.2 (Josh: "Yes to 8.2" in his own words, to Claude) laptop.js MOVES table.
- Tests: new unit 65_r16. Disclosed updates: 18 (Andeli chart: 25 mm, 10 mm 65 A), 34 (asks for Outside), 58 (hash for the
  Material rules, six cut files), 60 (reads the split cut files), page-ids (+16, none removed), e2e 30 (above).
  Deploy gate (ci-gate.mjs, JOBS=1, this box): first run blocked 96 (closed More-holes pop-over seen by the fit check; preset
  tabs at 1440x800) and 111 (its buttons had no text while closed); fixed (closed pop-over display: none, preset tabs 44 px from
  860 px tall) and both re-run clean: 96 270/270, 111 19/19. Every other gate suite passed (89 suites).
  Not changed and not checkable here: e2e 66 / 71 / 73 crash in this box before the app loads (same on main) – the toolbar-position
  checks in them still expect the laptop choice; please align them with C1.

## Working on
- Nothing new: Round 10 is done (below). Waiting on the questions in "For Josh to decide".

## Ready to check
- r15 Round 10 (later / nice to have; approved in the same t534u words as Round 9), tests first: unit 64 (58 checks) @ 0f7d0f6,
  e2e 130 (51 checks, now in the deploy gate) @ 2c2ec61, both red before the code:
  - 10.1 ⋯ More › Edit points on any outline: a library part becomes its real points (arcs fitted before rounding, so a rounded
    plate is 8 points, a circle 4 arcs; feature rows stay rows; one Undo puts the library part back). While it is on, every point has
    a handle, smooth arc joins too; Esc or picking another part ends it. Outside it, smooth joins keep NO dot but stay grabbable
    (Josh: keep the click behaviour). Edge panel: Make arc / Make straight. Double-click adds a point, Delete removes one (as before) @ a59dfa4
  - 10.2 dragging a part shows the gap to the nearest part (label "gap 80 mm" + a dimension line; "touching / overlapping" at 0) @ d02a0bc
  - 10.3 ⋯ More › Copy along a path (pick the part, Shift-click the path last; n copies shared out by length, ends included on an
    open line, optional "turn to follow") @ 7cc1fee; Features › Holes along a curve, fitted to the part's longest curved edge when
    added, end holes kept off the edges the curve meets @ 42d125a, a83002f
  - 10.4 Add text with a range ("TAG 001–050", up or down, keeps leading zeros, max 200) makes numbered copies, 10 to a row,
    each named after its number @ d9fe223
  - 10.5 Array › "As many as fit on the sheet" fills the drawing sheet a gap apart; the button says how many ("Fill the sheet (143)") @ 7cc1fee
  - 10.6 DXF: blocks (INSERT, with scale, turn, rows / columns, nested; a block that places itself is stopped with a warning) are
    drawn where placed instead of skipped; layer names say what to do: etch / mark / score / engrave / scribe → etched, drill /
    punch → a drill-mark cross at each circle's centre, anything else → cut; parts keep their layer or block name. Layer-0 files
    are read exactly as before (all 35 DXF/SVG files byte-identical) @ 91a13e7. This finishes F11.
  - 10.7 with Rectangle / Circle picked, typing a number opens the size box: "120 x 80" (× * by , also), "Ø40", "R20" in the
    box; Enter places it mid-view, a click places it there. Letters stay tool shortcuts @ 8c9d86e, a3bad69
  - 10.8 typed values take units anywhere numbers are typed as text (2in, 2", 5cm, 50mm; always mm inside). The drawing's size
    tags, drag and gap labels follow the existing Settings › Units › Display units (inches show "4.00 in"; mm unchanged) @ 5ca65ec, d02a0bc
  - 10.9 the live Z readout already exists (Setup jog strip, live torch panel). **Set top is NOT built** (it would send a new Z-zero
    command to the controller and change pierce heights; held for Josh, below)
  - No G-code change for existing parts: 339 presets (only the 8 known ones differ, as before) and 35 DXF/SVG byte-identical before the push
  - Disclosed test changes: page-ids snapshot +edgeArc (none removed); e2e 120 gets plans for the two new tools; edge panel
    "Add corner in the middle" → "Add corner" (tooltip keeps the words) so the panel still fits 1366×640; my own new unit 64 /
    e2e 130 adjusted before the gate (a wrong 7-vs-8 count, R25 typed in the box, the existing "inch" value, curve-hole ends)
  - CI fix: e2e 129 (my review test) crashed on CI because it waited a fixed 600 ms for the app; it now waits for the app to load (no check changed)
  - Live @ 21e59af (the first push, 4c9bf45, stopped at that 129 crash and never deployed)
  - Out-of-gate sweep after the push: e2e 10 "linear array dialog opens with 3 fields" now counts the 3 number fields plus the new
    10.5 fit checkbox (left off) instead of 4 inputs (disclosed; 268/268). Every other out-of-gate failure fails the same on d9df4d2 (before Round 10)
- Editor-redesign test review (the r13-layout group) @ 4e9610e..4cb872c:
  - Fixed, against approved rounds (e2e 129, in the deploy gate, fails 15/24 on the code before): the laptop Make header says
    "Make a part" again (r12 3.2); Simple's panel title "Pick a template" / "Set the size" with its help in an "i" (r12 4.2: the
    banner text had been hidden with no title in its place); pressing Advanced tools shows the Drawing sheet box at once (it stayed
    hidden until the next edit, a real bug)
  - Tests updated where an approved round clearly meant the change (disclosed in 78de558 / 4cb872c): 66 (rail 32 px, r13 #11),
    71, 72, 73, 77, 83, 85, 97 (panel never scrolls, r12 3.3: now checks nothing on any tab is clipped), 106
  - Not changed, asked: the "Make it yours" toolbar position does nothing on a laptop since the r12 rail (66 ×1, 68 ×1, 71 ×1,
    73 ×3); 36 px header buttons and preset tabs on tall laptops (73 ×4)
- r15 Round 9 (before selling; approved: Josh t534u, 21 Nov, "I give permission to do all of the ideas" covers r15 rounds 1–10 except 9.7 and the 'Waiting on Josh' items, as quoted to me by the reviewer), tests first: unit 62 (31 checks) @ b5d9cfe, e2e 128 (83 checks, now in the deploy gate) @ ed990b2, unit 63 (28) @ 7609a77; live @ 4739e75
  - 9.6 cut history (date, part, material, thickness, time, finished / stopped and why) with CSV download; the last job's log and alarms kept for the report; practice jobs are marked practice @ 3b76051
  - 9.5 consumables: tip and electrode pierce counts in Settings › Torch, each with its own "New tip / New electrode" (asks first); practice never counts @ 3cabe0f. **Tip size → kerf is NOT done** (it changes G-code; held for Josh)
  - 9.3 ☰ Send a problem report: version, screen, settings, last job log and alarms; anything named like a password / key / token / session and any JWT, sb_secret_ key, Bearer value or e-mail is removed. It is a download or copy (there is no support address or upload place yet; question for Josh) @ 59a0b4a
  - 9.4 Settings › Backup: back up / restore machine settings (edges, speeds, material, slow holes, start points, sheet, app settings, presets). Checked as a whole first, nothing half-restored; refused while connected; asks before replacing; reloads after @ 95c18c5
  - 9.2 ☰ Setup guide: connect → motor direction → torch test → edges → test coupon. Each step opens the real screen; it never presses Connect; connect and edges tick themselves @ 4bc7b84
  - 9.1 stable channel: the deploy publishes `stable/` (newest release Josh promoted) and keeps the newest 3 promoted releases at `v/<commit>/` for rollback, from `stable-*` tags made only by the hand-run "Promote to stable" workflow (needs the "I cut a real part" tick; only commits on main). Each copy has its own service-worker cache; About shows "stable". **No stable-* tag exists yet, so the live site is unchanged; nothing was promoted.** docs/RELEASES.md @ d55c04f, fabf389
  - start-up cost kept as before Round 9 (the new modules load after start-up or on use) @ 73dea1a
  - Disclosed test changes: tests/data/r15-page-ids.json gains the 30 new ids (none removed, order kept); my own new e2e 128 adjusted before it was committed to the gate; unit 54 now has 19 checks (one partial fewer); 40_layout_a11y is the same as before Round 9 (59/62: cut-bed axe ×2 and SLOW-NET, all pre-existing)
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
      0.001 mm offset). Now the true development (unit 47: area, base and seam lengths against an independent triangulation). Josh 21 Nov: keep.
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

- r15 Round 8 part 1 (code tidy), all in the deploy gate (units run automatically):
  - tests/tools/visual-snap.mjs @ f91220b: 9 scenes × 6 sizes, in-browser pixel compare. Baseline at 8b0c852; after 8.3–8.6 all 54
    shots identical (only the known 4 px logo flicker).
  - 8.3 one HTML-escape helper (core/dom.js esc) @ 02aaf7b / ba31ff3 (unit 51)
  - 8.6 the Sketch's Features methods in their own make/sketch-features.js @ b850391 / 4daccee (unit 52)
  - 8.5 fold3d.js split into fold3d-geom / -models / -render / -view + vec3.js; fold3d.js is a barrel with the same exports
    @ 9de61f4 / 45d837d (unit 53: same exports, sizes, layering)
  - 8.4 index.html 1,218 → 415 lines: dialogs and sheets move to html/ partials (new account.html, settings.html; more in make.html and
    cut.html), each filled at the spot where it sat @ 9c37a43 / 1200a26 (unit 54: the page built from the partials has the same 849
    ids in the same order; STOP, E-stop / alarm / link-lost banners, safety prompt and turn overlay stay in the shell). The live DOM
    (id, parent, order) is identical at 1440×800 and iPhone 14 landscape. Test change (disclosed): unit 14 reads the built page for the
    claim dialog's role="alert" (now stricter: it must be inside #claimDlg)
  - pre-existing e2e 59 "30" fixed: the committed sw.js precache list was missing 16 modules (the deploy re-stamps it, so live was fine,
    but a local offline reload came up without the app; this also fixes 40_layout_a11y [OFFLINE], so 40 is ×5 now) @ dda10cb / 1d71682
    (unit 55 keeps it in step)
  - **r15 7.5-redelbow (Josh 21 Nov), CUT CHANGE** @ 334a6d7 / 29dbe2b (+ 4c23be4 / e838c88: older saved parts open with 4 gores):
    the reducing elbow is n gores that taper and turn. One cone from the big Ø to the small Ø is cut by mitre planes tilted ±β
    (β = bend / 2(n−1), lobster-back lengths from CLR), and each gore is turned half a turn about its joint plane's normal through the
    joint ellipse's centre. The ellipse lands on itself, so the gores meet exactly, and the axis turns 2β per joint. Each flat pattern is
    that gore's part of the cone's development; the 3D is built from the same gores; new true-length table. New js/make/redelbow.js.
    Fields: "Length along the cone" replaced by "Number of pieces" (default 4). Unit 56 at 5 sizes: no stretch, seams close, joints
    planar and shared, ends round at Ø d / Ø d2 and turned by the bend, CLR chord within 5 %, taper, cut = gores, 3D on the gores.
    Test changes (disclosed): unit 40's old "gore + cone + gore" size check replaced (Ø d wide, round Ø d base, n gores); the
    lobster-back elbows' flange frames are unchanged
  - **r15 7.5-saddlehole (Josh 21 Nov), CUT CHANGE** @ 07803be / 2c53c79: the header wrap's hole is the true branch-on-header
    intersection, s = R·asin((r/R)·sinθ), y = r·cosθ: 2r along the pipe, 2R·asin(r/R) round it (100 on 110: 125.5 × 100, was a
    Ø 100 circle). The 3D wrap leaves out exactly that hole. A branch bigger than the header gives no hole and a note (unit 57)
  - tests/data/existing-preset-flat.json updated for redelbow and saddlehole only
  - Precheck: DXF/SVG 35 byte-identical. Classic mode vs the old baseline: redelbow and saddlehole are the only new differences (the rest
    are dustpan, s2roffset, fishmouth, takeoff, britches, teetemp from Rounds 5 / 7)
  - Screenshots: briefs r8-redelbow-cut / -3d, r8-saddlehole-cut / -3d (100 on 110)
  - Full gate passed (78 suites) at 2c53c79 before the push (120_every_tool passed on its retry)
  - 8.1 (part) screen-cut.css (3,258 lines) split in rule order into screen-cut.css + screen-cut-part / -run / -setup.css, linked one
    after another @ 7bce453 / a05e377 (unit 58: the same rules in the same order). Visual: identical apart from a timing flake in my snap
    tool at iPhone 14 landscape (a fold-out caught open or closed; the same diffs show up without the split). Full gate passed (79
    suites) at a05e377 before the push

- r15 Round 8 part 2:
  - 8.2: **Skipped (Josh 21 Nov)**. laptop.js keeps its JS moves, unchanged
  - 8.1 @layer @ 1bcc8a1 / e7c4c81 (unit 59): tokens.css declares `@layer tokens, app;`. The tokens sit in `tokens`, and every other
    stylesheet wraps its rules in `@layer app` in link order, so the cascade between files is exactly as before. tools/style-diff.mjs
    @ 987524a compares every element's computed style (and ::before / ::after) in two copies of the site, in 9 scenes at 6 sizes:
    54/54 identical; pixels identical. One layer per file was measured and not used: a later layer beats a more specific earlier
    rule, and !important flips between layers. Layering base.css alone changed 42 of 54 scene/sizes (button paddings 8 → 2 px,
    `.hidden` beating later importants), and all files layered changed hundreds of values. Making that identical means rewriting each
    conflicting rule, which is new work, not a tidy. Test changes (disclosed): unit 59 (new this round) now checks the two-layer
    form; unit 58 sets the `@layer app` wrapper aside before hashing the cut rules (same rules)
  - 8.1 container queries @ 2264e7c (unit 60, written first): the Setup step's `.cutgrid` is container `cutgrid`, and the
    1200–1439 px "Download G-code is an icon" range is `@container cutgrid (max-width: 1397px)`. Its content box is the viewport
    less 42 px, measured at 1200 / 1439 / 1440 / 1441 px, identical to the old rule. The laptop conditions (hover, fine pointer,
    height) stay a media query, because a container can't answer them. style-diff: only the new container-name / -type differ; pixels
    identical. The three-column grids themselves stay viewport media queries: they are the page layout, so their container would be
    the viewport, and nothing would be gained. Test change (disclosed): unit 58's pinned rule hash updated for this one rule move
  - pre-existing 41 item 11 @ 12699a5 (tests) / 5bb7c5c / 7de123a (app): it was partly the test and partly the app. On the laptop
    bed (hover + fine pointer), with no linked machine, nothing visible asked you to link one, and "Before you cut" said "Home the
    machine". Now the list starts with a "Link a machine to run jobs" button that opens the link prompt (a demo account gets its
    "Demo accounts can't control a real machine…" line as plain text), and "Home the machine" shows only once a machine is connected.
    blockers() unchanged. Test changes (disclosed, no checks removed): item 11 is layout-aware (the laptop checks on the 1280×900
    page; the old touch checks moved to an iPad page), and the account pill is opened through ☰ on laptops, where Account has lived
    since 46e9604 (this also fixes the crash that hid the rest of 41). 41: 54/54
  - pre-existing 65 ×2 @ 02ce572: the Beginner / Advanced tools mode switch is 14 px again (named token `--fs-modesw`), as round 5
    look M6 set it. e825afa's type-scale pass had moved its five rules to 13 px. 65: 71/71. Test change (disclosed): unit 58's pinned
    cut-rule hash updated (one screen-cut.css line). Full gate passed (81) at 02ce572
  - Checker "new problems" 1 and 2: e2e 92 item 2 flaky @ 649594f (test: Menu › Machine setup must land on Setup in the same
    click) / 4f07d69: Menu › Cut and Machine setup set the tab through core/hooks `showTab` in the click itself, not a dynamic import a
    moment later (92 40/40 ×6, three at once). e2e 122 @ 73651ea: after the reload it waits for `window.plasmaTest`, not a fixed 800 ms
    (test timing only)
  - pre-existing 10 PRO-PERSIST and 69_simple_advanced_phone, **a real bug** @ abc71af (unit 61, written first) / 3f1d700:
    since 9f22b5b (20 Nov), the cut panel's start-up save of speeds and material ran before Make it yours loaded the prefs, and wrote the
    defaults over them. Every reload lost Simple / Advanced, theme, accent, toolbar and the rest. Prefs now read what is stored before
    the first save. 69_simple_advanced_phone 14/14
  - **found via 10, a real bug** @ c821e91 / 0c71dcf: with a machine connected (practice or real), each status report (about 10 a
    second) ran refresh(), which rebuilt the whole Make tool bar, the pinned Undo / Redo / Fit / Delete and the Arc ▾ menu. A press and
    its release could land on different buttons, and hover and keyboard focus were lost. They are now rebuilt only when their markup
    changes (10's new QB-STABLE check fails without it). 10: 268/268 (it used to crash at the line array). Test changes (disclosed):
    10 opens Linear array from the laptop tool bar's ⋯ More menu, where it lives, and types the letters into the number field rather
    than using page.fill() (which can't, and its error was swallowed)
  - pre-existing 85 C49 @ c4d59ba: Ctrl+K and / now focus the tool search. The More menu opens first, then the search box on screen
    gets focus (it used to focus the hidden one)
  - pre-existing 40 A11Y ×2 @ 6d5a926: the Make header's Snap and Drag-selects switches drop aria-pressed (not allowed on
    role="switch"; aria-checked carries the state and the CSS already used it). 40 is ×3 now
  - pre-existing 52 item 21 @ 036c3bf (test): the hand-built page now confirms the "Before you cut" safety prompt after Start; the
    first-job flag is recorded as before
  - pre-existing 83 C30 and 106 F10 @ 578ca88 (test): arcs and spline count as on the rail when they are in its Arc ▾ menu (r15 4.18),
    and Etch / mark's name is read from the button label on the compact icon rail
  - Precheck: DXF/SVG 35 byte-identical. Presets: the same 8 as last push (dustpan, s2roffset, fishmouth, takeoff, britches,
    teetemp, redelbow, saddlehole); no new cut changes (rerun at 0c71dcf)
  - Full gate passed (82 suites, no retries) at 0c71dcf before this push
  - Full gate passed (81 suites, no retries) at 7de123a before the push

- Checker's new problems (Round 8 report), each test written first and failing:
  - 4.10 touch-off tag over the Y rail @ dac5a38 (test) / 23d44ef: the gantry's Y leg, carriage and torch handle are label boxes on
    Setup too, not only the X beam. The touch-off tag slides beside the leg when no height clears it, and "Sheet corner (0, 0)" tries
    the other side of the corner. 125 checks, after Start here at 1280 / 1366 / 1536, that neither sits on the leg (the leg's box is
    checked against the picture's dark fill)
  - 4.17 X / Y chips over a hole @ 60a46a2 (test) / 126585e: Plate with holes fitted to the view: default, Ø16 at 12 mm (fails before
    the fix at all three sizes) and 300 × 60. The chips go under the part, else just inside its corner when that is clear of holes,
    else stacked in the gutter left of the part, else inside, stepped clear
  - Bed and home labels over the gantry (your report, item 3) @ 8e81eeb (test) / 013a1a7: `gantryBoxes()` in machinedraw.js gives the beam,
    Y leg, carriage and torch handle with the drawing's own numbers (Setup uses it now too). "Controller 0,0 …" / "Home 0,0 …" and
    "Torch X … Y … Z …" take the first clear spot: where they always went, then further out, the other side, the other way up.
    125 checks both are off the gantry, off each other and on the canvas, at 1280 / 1366 / 1536
  - Precheck: DXF/SVG 35 identical; the same 8 presets as last push. Full gate passed (82 suites) before this push

## Why 96/113 missed report items 1 and 2
- Item 1: the walk only ever opened the Size and Holes tabs in Advanced, never Arrange. Now "make-advanced-arrange" at every size.
- Item 2: the walk stopped a ONE-part job before its first pierce, so Save speed, "Stopped during cut N" and Continue from cut never
  showed. Now "cut-stopped-midjob": 3 parts, speed changed, STOP after cut 2, checked before and after the E-stop reset.

## Next up
- Josh's answers below (Set top, inch scope, toolbar position, 36 px buttons, 8.2, More holes, upload bar). r15 rounds 1–10 are done except 9.7.

## Not a bug
- Space-bar STOP path (e2e 49 ESTOP ×3: Space also sends "$$" after "!" + Ctrl-X, and is not ignored on Make; 55 section 11 ×4):
  Josh 21 Nov: keep as is (his own answer card). A stop is always sent first.
- Report ❌ "41 item 11 since 55c3d71": the launcher change (55c3d71: real laptop Chrome, hover + fine pointer) moved 41 onto the r13
  laptop bed layout. Part of it was the test (it expected the touch layout) and part was a real gap on the laptop layout: with no
  linked machine, nothing visible asked you to link one, and the list said "Home the machine". Both fixed in Round 8 part 2 (below).

## For Josh to decide (found while testing, not in the plan; all there before r15)
- **e2e 30 [SECRETS] fails since 9.3 (59a0b4a; my miss, 30 is not in the deploy gate).** No key is in the code: the check looks for
  the bare words "secret" / "api key", and core/report.js names them in its scrubber (the rules that DROP such keys from a problem
  report). 30 passes 22/22 on the commit before. Fix choices: (a) 30 skips only report.js's scrubber lines (a security-test change,
  so your call), or (b) report.js lists the key names another way (that would only hide the words from the check, so I have not).
- **e2e 40 SLOW-NET (pre-existing):** on a 400 ms-per-request network the app is usable after ~17.5 s (limit 15 s; it was failing
  before r15). Round 10 adds one more file level (~0.4 s), and the suite now stops at its 15 s wait instead of reporting the fail.
  A real fix is fewer chained module loads (preload hints or a bundle). Do you want that as a round?
- **10.9 Set top:** a button that marks where the torch is now as the top of the sheet would send a new command to the controller
  (a work-Z zero) and change every pierce and cut height after it. That touches G-code safety, so it is not built. Build it (how
  should it behave with touch-off off, for the air-start torch)?
- **10.8 inches:** done as display + typed units. Not done: every input box showing inches (the Size tab, dialogs and the click-a-size
  box still show mm, but accept 2in). Enough, or do you want full inch boxes everywhere?
- **"Make it yours" toolbar position (top / bottom / left) does nothing on a laptop in Advanced** since the r12 rail (the old r7 CSS
  no longer applies). Tests 66 ×1, 68 ×1, 71 ×1, 73 ×3 still expect it. Remove the choice on laptops (I update the tests), or make it move the rail?
- **36 px header mode switch and preset category tabs on tall laptops (1366×768, 1440×900):** the compact-buttons choice is on by
  default, while the tokens say 44 px above 720 px tall. Tests 73 ×4. Keep 36 px (I update the tests) or 44 px there?
- **9.1:** to start the stable channel, cut a real part, then run Actions › Promote to stable (docs/RELEASES.md). Also add
  `https://scriptsjc-cmyk.github.io/Plasma-table/stable/` to the Supabase Auth redirect URLs (you change that yourself).
- **9.3:** where should problem reports go (a support e-mail, or an upload place)? For now they are a file or a copy.
- **9.5:** should the tip size change the kerf? That changes G-code, so it waits for you.
- **Checker report "Decisions from Josh (21 Nov, 22:52)" says 8.2 is approved** (keep the JS moves, drive them from one table). Your
  answer card at 22:14 said skip 8.2, and I only act on your own words, so 8.2 stays skipped. Which do you want?
- **"More holes" (slot, corner, row, ring, grid of holes) is hidden in Simple view on laptops ≥ 1280 px** since 9314773 (20 Nov,
  "hide controls that still overflow"). That's a control hidden to make the page fit. Put it back (in a popover, or by letting the
  form scroll), or leave it? (52 crashes there.)
- **76 item 11:** on the laptop Part step (three columns, no page scroll, 1685ac9) the upload bar no longer opens into a bigger drop
  zone when clicked (your r8 item 11). The whole screen takes dropped files. Keep it compact (then I update the test) or bring the
  bigger zone back?
- Reducing elbow and saddle hole: decided 21 Nov (both redesigned, above).
- 8.2: decided 21 Nov 22:14, skipped (Josh 21 Nov). The JS moves stay.

## Questions for the checker
- e2e 20 STOP-STREAM change (f9d612d, accepted by the reviewer): it now counts job lines from the moment of the STOP press (button
  pointerdown / Space keydown), not from a mark taken ~ms before it. Please confirm independently that STOP still sends nothing from the
  job after the press: button and Space, mid-cut, on the practice table (timestamps of every byte after the press).
- Cut changes in this push (please check independently): the reducing elbow (`redelbow`, unit 56: do the gores meet and make the
  bend?) and the saddle hole (`saddlehole`, unit 57: does the branch fit the hole?). Last push: `s2roffset` (unit 47) and the saddle
  template in fishmouth / takeoff / britches / teetemp (unit 49).
- 41 item 11 (your request): `node run-all.mjs 41` fails item 11 ×3 on 75b7df1, on 55c3d71, and on HEAD (rerun 21 Nov 15:50 at 82d99d8) with today's `tests/lib/browser.mjs`.
  The difference between your two runs is the launcher: 55c3d71 changed launchKillable from raw headless Chrome (no hover, so the
  touch layout) to Playwright's Chrome (hover + fine pointer, so the r13 laptop layout, Link a machine in the header menu). See Not a bug.
- 2.17 (G-code unchanged when a part has no features): the developer checks it before every geometry/import push with `tmp/precheck.sh` (339 presets + 35 DXF/SVG byte-identical). Can you confirm it independently on the next push?
- Pre-existing failures outside the deploy gate, re-run 22 Nov 06:20 at 21e59af (each fails the same on d9df4d2 and, where checked, before r15): 30 SECRETS ×1 (9.3, above), 40 cut-bed axe ×2 + SLOW-NET (now a crash, above), 47 iphone14 library search 'l bracket', 49 ESTOP ×3 and 55 section 11 ×4 (Josh: keep), 52 crash (slothole / More holes), 53 s2r ×3 (don't touch), 56 crash (35 arc lost; also on 71e68d5), 57 ×3 (layout drag / layout toolbar), 58 crash (Nest panel), 63 ×1 (phone picture 54 % vs 55 %), 66 ×1 / 68 ×1 / 71 ×1 / 73 ×7 (toolbar position + 36 px, For Josh), 69_phone_cut #torchBig at 320×568, 96_fold3d ×1 (iPhone 14 picture 119 px), 76 item 11 ×2 (upload bar, For Josh), 94 ×1 (disconnect reminder; also on 71e68d5), 100 ×1 (long help behind i icons). Fixed since the old list: 10, 41, 65, 69_simple_advanced_phone, 72, 77, 83, 85, 97, 106. Do you see any others?
- Round 8 part 2 update to that list: fixed 10, 41 item 11, 52 item 21, 65, 69_simple_advanced_phone, 83 C30, 85 C49, 106 F10 and two of
  40's axe findings. Still open: 57 ×3, 52 slot-hole crash (Josh), 53 s2r ×3 + crash and unit 22 C9-S2R ×2 (cut geometry, so I left
  them), 58, 63 ×1, 66 ×2, 68_layout_polish ×1 (newly seen, the same r13 laptop tool bar group), 69_phone_cut, 71 ×4, 72 ×4 + crash, 73 ×9,
  76 item 11 ×2 (Josh), 77 ×4, 83 crash (Export button moved), 85 C46 / C48, 96_fold3d ×1, 97 ×6, 100 ×1, 106 ME1, 40 ×3 (zeroCard
  summary has buttons inside it; making the iPhone bed picture focusable needs care around Space-as-STOP; slow-net), 47 ×1, 49 ESTOP ×3
  (Josh: keep). Most of 66 / 68 / 71 / 72 / 73 / 77 / 85 / 97 are older tests against the r13 laptop editor layout. Each needs a
  "was this change meant?" check before the test is updated, which is the next job.
