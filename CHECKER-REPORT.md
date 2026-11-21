LAST_CHECKED_COMMIT: 71e68d5
# Porta Plazma: checker report

Kept up to date automatically by Claude, the independent checker. The newest check is at the top, and older ones are summarised under History.
**How it checks:** a fresh copy of the live code, on the practice table only (USB Connect is never pressed). The kit is `porta_check.py` on this branch, and items are matched against `combined-plan-r15.md`.

## Check of 21 Nov 2026, 11:09 run (commit `71e68d5`, 16 commits since `bb5aadb`)

### Safety
- **OK.** I tried to start a cut and then leave the cutting screen, by Menu and by the Part tab, at 1280 × 600. No job ran without STOP on screen. `112_r15_safety` passes 36/36.
- The torch stays off in Practice. Nothing that touches STOP, the start confirm or the torch test changed in these commits.

### Replies to Ready to check
- ✅ **Round 1 (1.1–1.7)**, plus **7.1–7.4 in the gate**, **2.1, 2.3–2.5, 2.7–2.11, 2.13, 2.14, 2.16**, and **3.1, 3.3, 3.7, 3.8** @ bb5aadb. Still pass (unit tests, 112, 120, 121 and 122 are all green).
- ✅ **2.12 Corners row.** On a gusset, + Add › Corners gives "R5 at all corners" and it stays a gusset. Fillet click mode on one corner gives "R6 at 1 corner". On a rectangle, + Add › Corners is the radius row (R = p.r). Fillet-clicking one corner of a rectangle adds an "R7 at 1 corner" row and leaves p.r at 0, which makes sense: one corner can't be a single radius.
- ✅ **2.6 Pattern.** Checked on Text, Etch line and Rectangle cut-out, as well as the slot in 121. Each gives one row "… · 2 × 1, pitch …" and the copies are cut. No page errors at 1280 × 600 or 1536 × 730.
- ✅ **2.2 Text row** now reads `"TEXT" 10 high at 100, 75`. The Etch line row still has no "at X, Y" ("40 long"), but the plan only asked for Text.
- ✅ **2.18 Phone Features sheet** (iPhone 14). "Features (2)" opens a bottom sheet with the same rows and + Add. `123` passes 23/23. One small leftover is under New problems.
- ✅ **3.9 Arrange tab at 1280 × 600.** Every button is on screen above Cut this part, and the X / Y labels don't overlap. `113` make-advanced-arrange passes at every size.
- ✅ **4.14 Cut › Stopped at 1280 × 600.** Continue from cut, Set a new start point, Cut a different part and Download G-code are all on screen after stopping at cut 2 of 5.
- ✅ **2.19 Size tab refit.** Typing 900 in the width zooms out to the same view as Fit, and 121 passes. Typing with pauses, nothing jumped.
- ✅ **2.17 No features means G-code unchanged.** For all 345 shape and preset ids, each was put on a part and run through `designToGcode()` at `bb5aadb` and at `71e68d5`. All 339 that produce a part gave byte-identical G-code. The other 6 (`flange4`–`flange12`, `flangeblind`) give no part with default sizes on both commits.
- ✅ **2.15 Ctrl+D / Delete on a Features row.** Delete on a focused row removes only that row (part count stays 1 at 1280 × 600 and 1536 × 730). Ctrl+D and its undo pass in 121.

**Round 2 is verified done**, apart from your own live-site motor-mount run, which is still under Working on.

### Answers to developer questions
1. **2.17:** confirmed independently (method and result above).
2. **Failures outside the gate:** all seen, and all were there before r15. The same suites at `f47ca41` and `71e68d5` fail one for one: 57 ×3; 52 item 21; 10 PRO-PERSIST (crashes after it); 41 item 11 ×3; 55 section 11 ×4; 53 s2r ×3; 58 "Nest to fit"; 71 and 83 crash; 85 C46, C48, C49; 96_fold3d ×3.
   - **Note from Josh's chat:** the earlier 11:00 run reported 41 item 11 as a *regression* bisected to `55c3d71` (two extra failures: "one lock note on the bed screen" and "'Link a machine' is the green primary button"). This run found the same failures at `f47ca41`. The two runs disagree, so please run `node run-all.mjs 41` once on `75b7df1` and on HEAD and add the result under Questions; the next check will settle it.
   - **One extra here:** `96_fits_screen` and `113_r15_fits` fail at **1440 × 800 machine-setup / machine-setup-edges** ("overlap-box: Lowest point. / Floating head"). This also fails at `f47ca41` and `bb5aadb` on this machine. It's font-dependent: the app uses `system-ui` (`css/tokens.css:77`), and this container's system font is wider than the CI runner's. A buyer with a wider system font would see the overlap, which is one more reason for 4.26.

### New problems found (developer may fix without asking)
1. **Phone, Make › Set the size (iPhone 14):** the help line reads "Type how big it should be. Type how big it should be, turn it…": the short label and the full tip both show. Cause: `setInfoText()` (`js/ui/hovertip.js:82`) with the short and full text from `js/make/shapeform.js:78-79`; the `.info-body` copy is visible on touch. The same happens on Cut › More cut options (`html/cut.html:70`).
2. **Phone:** the "Turn your phone sideways" pill sits over the first Features row in the bottom sheet until it's dismissed (`js/ui/laptop.js:171`). It could hide while `#featSheet` is open.

### Got worse since last check
- Nothing. Unit tests are 24,868 / 24,870 (up from 24,842); the only failure is the known C9-S2R.

### Prep for Next up
**Round 3 remainder** (3.2, 3.4, 3.5, 3.6, 3.10, 3.11, 3.12): see the prep in the previous report (git history of this file, commit `89c6650`). File and line pointers are unchanged.

**Round 4 (highest-value first):**
- **4.3 Practice run box.** `html/cut.html:48` is a native checkbox sized to 44 px by `css/base.css:78` (`#dryRun`).
  - Fix: use the same `button.switch` + `.switch-track` as Drag selects (`html/make.html:15`, `css/base.css:47-55`). Keep `#dryRun` as the real input (hidden, or with role="switch"), so `S.dryRun` and the tests keep working.
  - Test: 1280 × 600, Cut step 1. `#dryRun`'s visible control is at least 40 × 24 with `role=switch`; a click toggles `aria-checked` and `S.dryRun`.
- **4.4 Cut speed shown twice:** in the amps card (`js/cut/material.js:87`) and in the `#speedBox` summary (`css/screen-cut.css:2324`, shown on step 1).
  - Fix: keep the `#speedBox` summary (which you can change); drop the dd from the card on step 1.
  - Test: 1366 × 640, step 1: "Cut speed" appears exactly once in `#step1` (visible elements only).
- **4.2 / 4.5 Right column slots.** At 1280 × 600, Cut speed and More cut options already sit above Next, so 4.2 is partly done. The left column is still half empty.
  - Fix: move `#dryRun` + `.cutmore-row` (`html/cut.html:48-69`) into the left column, under Straight cut.
  - Test: at 1280 × 600 / 1366 × 640 / 1536 × 730, Next is fully visible, nothing overlaps it, and `#advCut summary` sits above Next.
- **4.9 Torch card.** At 1280 × 600 the second "i" icon covers the "Torch" lamp chip. The chips are in `<summary>` at `html/cut.html:167`.
  - Fix: one readout row under the title, lamps E-stop · Head · Torch at 13 px or more, and a single info icon.
  - Test: `.torch-chips .lamp` boxes don't intersect any `.info-i`; each lamp is at least 24 px high.
- **4.11 / 4.25 One status.** The header torch pill is set in `js/ui/refresh.js:50-53` ("TORCH OFF", upper case) and again at `refresh.js:283`. Practice and Ready are separate pills (`index.html:139-141`).
  - Fix: one pill, "● Practice · Ready · Torch off", built in `refresh.js`. Keep the ids (hidden) for the tests.
  - Test: on Setup and Cut at all 3 sizes, at most 1 visible `.pill` holds the state text, and upper-case "TORCH" isn't shown.
- **4.13 Demo hint on Stopped.** "Demo: tap here and the edges are set up for you." shows under the bed on Cut › Stopped. The text comes from `js/cut/preview.js:49`; `js/ui/refresh.js:142-152` only moves it into `#fitChip` and never hides it off Setup.
  - Fix: show it only when step = Setup.
  - Test: demo, stop a job: `#fit` and `#fitChip` don't contain "Demo:" on step 3.
- **4.26 Bundle the font.** There's no Barlow in the CSS (`--font: system-ui…`, `css/tokens.css:77`), but the canvas labels ask for "Barlow, system-ui" (`js/cut/preview.js:206` and others). Bundling it should also fix the 1440 × 800 machine-setup overlap above; re-run 96 and 113 right after.

### Plan progress (r15)
- **Round 1:** done ✓
- **Round 2:** done ✓ (2.1–2.19 verified; only your live-site motor-mount run is left).
- **Round 3:** partly done. Done: 3.1, 3.3, 3.7, 3.8, 3.9. Working on: 3.2, 3.4–3.6, 3.10–3.12.
- **Round 4:** 4.14 done, 4.2 partly done; the rest is Next up.
- **Round 5:** not started (3D check still flags 25 of 93 models, as expected).
- **Round 6:** not started.
- **Round 7:** 7.1–7.4 done and gated; 7.5–7.9 not started.
- **Rounds 8 and 9:** not started.

### Unit + e2e results
- **Unit:** 24,868 / 24,870 (only the known C9-S2R).
- **e2e passing:** 112_r15_safety 36/36 · 120_every_tool 594/594 · 121_features 57/57 · 122_loose_holes 25/25 · 123_features_phone 23/23.
- **e2e failing:** 113_r15_fits 308/310 and 96_fits_screen 268/270, only the 1440 × 800 machine-setup font overlap above (already there at `f47ca41`).
- **porta_check:** every screen and tool at 1280 × 600, 1366 × 640 and 1536 × 730 is clean, with no page errors.

### For Josh to decide / ideas for Josh (not to be built until he approves)
- **Suite 55, section 11:** it expects Space not to latch an E-stop on the menu and Make screens, and STOP to be hidden on Make. The app does both, and has since before r15. Space being STOP everywhere is the safer choice. Should the test be updated in Round 7 to match "Space is always STOP"? The house rule is never to weaken a test, so it's Josh's call.

## History
- **21 Nov 11:00 @ a289e67:** Round 1 re-verified; 2.17 confirmed for presets; Round 3 remainder prepped (commit `89c6650` of this file); 41 item 11 reported as a regression from `55c3d71` (disputed by the 11:09 run, see above).
- **21 Nov 09:30 @ bb5aadb:** Round 1 done; Round 2 mostly done. Found the 1280 × 600 Arrange overflow (3.9) and Download G-code off screen on Stopped (4.14), both now fixed. 25 / 93 3D models flagged (Round 5).
