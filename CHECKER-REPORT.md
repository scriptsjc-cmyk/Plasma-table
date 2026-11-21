LAST_CHECKED_COMMIT: 191fd54
# Porta Plazma: checker report

Kept up to date automatically by Claude, the independent checker. The newest check is at the top, and older ones are summarised under History.
**How it checks:** a fresh copy of the live code, on the practice table only (USB Connect is never pressed). The kit is `porta_check.py` on this branch, and items are matched against `combined-plan-r15.md`.

## ✋ Decisions from Josh (21 Nov, 22:52)
- **8.2: approved.** Do the option you and the checker both suggested: keep the JS moves, but drive them from **one table of where each control goes** (no `safeInsert`). Nothing should change on screen.
- **Suite 55 section 11 (Space as STOP on Menu and Make): skip.** Buyers will have a physical E-stop and the on-screen STOP. Leave the app's Space behaviour as it is, don't change the test, and don't build anything for it. It stays a known finding; the checker won't raise it again.

## Check of 21 Nov 2026, 22:40 UTC run (commit `191fd54`, 133 commits since `71e68d5`)

### Safety
- **OK.** I started a cut and then tried to leave the cutting screen by Menu and by the Part tab at 1280 × 600. No job ran without STOP on screen. `112_r15_safety` passes 36/36, `20_demo_job_safety` 36/36 and `22_stop_overlay` 33/33.
- **STOP stream (your question):** confirmed with my own test, described under Answers.
- The torch stays off in Practice, and the start confirm is unchanged.

### Replies to Ready to check
- ✅ **Rounds 1 and 2, plus 7.1–7.4** @ bb5aadb. Still pass (121 57/57, 122, 123 23/23).
- ✅ **Round 3 (3.2, 3.4–3.6, 3.10–3.12).** 124 passes 67/67. My own sweep of every Make tool at 1536 × 730 is clean: each opens, its dialog fits, Escape closes it, and there are no page errors. That includes 3-point arc, Tangent arc and Spline from the new Arc ▾ menu.
- ✅ **Round 4, apart from 4.10 and 4.17 below.** 125 passes 220/220. In my screenshots at all three sizes:
  - 4.1–4.5: header above the panels, Practice run is a switch, Cut speed shows once, and the left column is balanced.
  - 4.6–4.9: Setup text wraps, Layout and Check cut look like buttons, ↓ G-code has a label, and the Torch card has one i and one readout row.
  - 4.11–4.14 and 4.25: one Practice · Ready pill, tabular readouts, and the Stopped actions are tidy.
  - 4.15, 4.16, 4.18–4.22: versions in 2 columns, no duplicate Size box, the Arc ▾ rail button, plain tool names.
  - 4.23 and 4.24: 3 × 3 jog pad and "Bed and home" inside its card.
  - 4.26 Barlow: 113 passes 310/310 and 96_fits_screen 270/270. The 1440 × 800 "Lowest point / Floating head" overlap is gone.
  - 4.x-extra and the two phone items are fixed too.
  - Small note on 4.13: the demo hint is gone from Cutting and Stopped, but it still shows on Step 1 Part, because `js/ui/refresh.js:143` counts S.cur "1" as Setup. The plan says "Setup only". Your call.
- ❌ **4.10 touch-off pill** (1280 × 600, 1366 × 640, 1536 × 730; Cut › Setup after Start here). The pill now clears the X beam, but it lies right across the gantry's vertical Y rail (the dark leg under the torch) at all three sizes.
  - Cause: only the X beam is registered as a box (`js/cut/setup.js:219-220`), so the free-spot search at `js/cut/startmark.js:41` doesn't know about the leg. "Sheet corner (0, 0)" sits on the same leg.
  - Fix idea: add the leg's screen box too, or start the pill to the right of the leg.
- ❌ **4.17 X / Y chips** (Make, Advanced, Size tab, default Plate with holes). At 1280 × 600 the "X 0" chip sits on top of the bottom-left hole. At 1536 × 730 it touches that hole and the corner.
  - Cause: Fit puts the part's bottom at the canvas bottom, so the chips take the "just inside" branch (`js/make/sketch-view.js:312-314`), and that is where the corner holes are.
  - Fix idea: leave room under the part when fitting (~36 px of padding), or put the chips in the gutter left of or above the part.
  - Test: at the three sizes, the chip boxes intersect neither the outline nor any hole's box.
- ✅ **Round 5 (5.1–5.8), 5.9, 5.10.** Units 34–39 and 46 pass, and 126 passes 30/30.
  - 5.1: the U-channel by hand (100 × 50 × 50, 2 mm, R = T, K 0.44) gives BD 3.4761 per bend, so a 193.048 mm strip, which matches unit 41.
  - 3D sweep: 93 fold presets, and at zero thickness none are flagged on area, holes or overlapping cuts.
- ✅ **Round 6 (6.1–6.5).** 127 passes 28/28. Checked on a 200 × 150 plate with 4 × Ø10 holes: all 4 holes are tagged `(PORTA-SLOW 60)` and the outline isn't; each hole pierces 0.43 mm from its centre and two arcs join the circle tangentially; every hole is cut before the outline.
- ✅ **Round 7 (7.5–7.9).** Units 40–50 pass. The 7.8 re-run is done and its results are reported.
- ✅ **Cut changes 7.5-saddle, s2roffset, 7.5-redelbow, 7.5-saddlehole.** Checked independently, see Answers.
- ✅ **Round 8 part 1 (8.3, 8.4, 8.5, 8.6, 8.1 split).** Units 51–55 and 58 pass. index.html is 418 lines, fold3d.js is a 6-line barrel, and screen-cut.css is split into 4 files. Screenshots at the three sizes look the same as before, and the sw.js fix lets 59 pass 81/81.

**Rounds 3, 5, 6 and 7 are verified done.** Round 4 is done except 4.10 and 4.17.

### Answers to developer questions
1. **STOP-STREAM (f9d612d).** I hooked every byte written to the demo controller with `performance.now()`, plus a capture listener on `window` (added before the app loads) for the STOP press. 4 jobs mid-cut with the torch lit: button, Space, button, Space.
   - The first byte after the press was always "!", 0.2–2.7 ms after it.
   - Zero job lines after the press; torch off, job "stopped".
   - The last job line went out 22–118 ms *before* the press. Your change is sound.
2. **Cut changes, checked on their own geometry:**
   - **redelbow** at 5 sizes (200/120 n4, 150/100 n5, 300/150 60° n3, 100/60 45° n2, 250/200 n6): neighbouring gores meet within 0.08 mm (sample spacing), joint lengths match exactly, the ends are exactly π·d and π·d2, and the turn between the end openings is exactly the bend.
   - **saddlehole** (100/110, 80/140, 50/200, 100/100, 150/160): every hole edge point, wrapped on the header, lies on the branch cylinder (error 1e-14 mm). `inside()` agrees with a brute-force test at 4,000 random points per size. 100 on 110 is 125.5 × 100.
   - **Saddle template:** right way up (branch shortest on the crown, longest at the sides).
3. **2.17:** all 339 presets through `designToGcode()` at `c31bd09` and `191fd54`: 332 byte-identical, exactly 7 differ (s2roffset, fishmouth, saddlehole, redelbow, takeoff, britches, teetemp), which are the intended cut changes. The 35 DXF/SVG weren't re-run this time.
4. **Pre-existing failures:** re-ran 47 and 96_fold3d; they match your list (47 ×2, 96_fold3d ×1, the iPhone 14 picture). 40 can't run here (axe-core isn't installed). Two gate suites are flaky now; see New problems.
5. **41 item 11 / the Space path:** accepted as Not a bug. Won't be reported again.

### New problems found (developer may fix without asking)
1. **e2e 92_r9_chrome is flaky at HEAD, and it's in the deploy gate.** It failed "item 2: Machine setup has no Cut / Check the cut row" in 3 of 7 runs at 191fd54, with tab still "cut" 300 ms after `menuSetup.click()`. It passed 4/4 on `c31bd09` and 4/4 on `8b0c852`, so this looks new in Round 8.
   - Not reproducible in a smaller script: the tab normally flips to "setup" in 40–90 ms.
   - Suspect: `js/ui/flow.js:186-189` (`showScreen("cut")`, then a dynamic `import("./nav.js").then(showTab("setup"))`). If `showScreen` is refused or something later calls `showTab("cut")` (`nav.js:89`), the setup tab is lost.
   - Worth logging `showScreen`'s return value and `showTab` calls in the failing run.
2. **e2e 122_loose_holes is flaky (test timing).** "(a) ran to the end: plasmaTest undefined" in about 1 of 3 runs. Cause: `tests/e2e/122_loose_holes.mjs:76` reloads, then waits a fixed 800 ms before `makeScreen()`. Waiting for `window.plasmaTest` instead fixes it without weakening anything.
3. **Machine setup › Bed and home** (1280 × 600, 1366 × 640): the canvas labels "Controller 0,0 (power-up — home not set)" and "Torch X … Y … Z …" are drawn over the gantry and can't be read. Same kind of fix as 4.10.
4. **120_every_tool** failed "1366x640 flangestd: its apply button can be clicked" once under load, then passed 602/602 alone. Flaky under load; just so you know.

### Got worse since last check
- 92_r9_chrome flakiness (above). Nothing else. Unit tests are 25,363 / 25,365; the only failure is the known C9-S2R.

### Prep for Next up
- Next up (Round 8 part 2) is under Working on, so there's no separate prep. Pointers for 4.10, 4.17 and the two flaky suites are above. 8.2 is now approved (top of this report).
- 63 / 66: last run's notes still apply (63 is 200 of 373 px = 54 % against 55 %; 66 is the r13 laptop toolbar in a column).

### Plan progress (r15)
- **Round 1:** done ✓
- **Round 2:** done ✓ (Josh's own live motor-mount run is the only thing left).
- **Round 3:** done ✓
- **Round 4:** done except 4.10 and 4.17.
- **Round 5:** done ✓
- **Round 6:** done ✓
- **Round 7:** done ✓ (63 / 66 carried to Round 8).
- **Round 8:** partly done. 8.3–8.6 done, 8.1 part done (the split; @layer and container queries not started). 8.2 approved.
- **Rounds 9 and 10:** not started (need Josh's approval).

### Unit + e2e results
- **Unit:** 25,363 / 25,365 in 61 suites; only the known C9-S2R ×2 fails.
- **e2e passing:** 20 36/36 · 22 33/33 · 59 81/81 · 70 79/79 · 74 81/81 · 96_fits_screen 270/270 · 110 36/36 · 111 19/19 · 112 36/36 · 113 310/310 · 120 602/602 (re-run) · 121 57/57 · 123 23/23 · 124 67/67 · 125 220/220 · 126 30/30 · 127 28/28
- **e2e failing:** 92_r9_chrome flaky (3 of 7) · 122_loose_holes flaky (~1 in 3) · 47_ux2 ×2 and 96_fold3d ×1 (known) · 40 can't run here (axe-core missing).
- **porta_check:** every screen and tool at 1280 × 600, 1366 × 640 and 1536 × 730 is clean, with no page errors. 93 fold presets, 0 flagged.

### For Josh to decide / ideas for Josh (not to be built until he approves)
- **Idea, test only:** unit 40 compares flat and 3D areas only at 0 mm sheet. At a real 3 mm, a sharp-cornered 3D shows the outside surface, so the areas can't match by design (U-channel 1.11, J-channel 1.27). A cheap extra check: at the job's 3 mm, the 3D's outside size equals the typed outside sizes for every fold preset.

## History
- **21 Nov 11:09 @ 71e68d5:** Round 2 verified done (2.2, 2.6, 2.12, 2.15, 2.17–2.19), 3.9 and 4.14 fixed. Found the phone help line said twice and the sideways pill over the Features sheet (both fixed since). The 1440 × 800 font overlap led to 4.26.
- **21 Nov 11:00 @ a289e67:** Round 1 re-verified; 2.17 confirmed for presets; Round 3 remainder prepped. 41 item 11 reported as a regression from `55c3d71`, later explained as the test launcher change (Not a bug).
- **21 Nov 09:30 @ bb5aadb:** Round 1 done; Round 2 mostly done. Found the 1280 × 600 Arrange overflow (3.9) and Download G-code off screen on Stopped (4.14), both now fixed. 25 / 93 3D models flagged (Round 5).
