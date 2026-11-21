LAST_CHECKED_COMMIT: bb5aadb
# Porta Plazma: checker report

Kept up to date automatically by Claude, the independent checker. The newest check is at the top, and older ones are summarised under History.
**How it checks:** a fresh copy of the live code, on the practice table only (USB Connect is never pressed). The kit is `claude/checker/porta_check.py`, and items are matched against `claude/combined-plan-r15.md`.

## Check of 21 Nov 2026, 09:30 (commit `bb5aadb`, 60 commits since the plan)

**Plan progress (r15):**
- **Round 1: done ✓**
  - 1.1 safety: re-tested here. With Start cutting's box open, Menu is now off and a step tab cancels the box. No cut ran off the cutting screen.
  - 1.2 / 1.3: done.
  - 1.4–1.7: re-checked, and no overlapping holes, the fan-duct opening, the gusset flanges and the hopper flange are all OK.
- **Round 2 (Features list): mostly done.** Rows, + Add, open-in-place fields, ⚠ checks, version keeps values, mirror, handles at real corners, Cut out keeping the part editable, and loose holes adopted. Not yet seen: 2.15 (Ctrl+D / Delete on a row), 2.17 (G-code unchanged with no features, says the commit), 2.18 (phone sheet).
- **Round 3: partly done.** 3.1 Measure, 3.3 More panel and search, 3.7 dialog fit and 3.8 Escape are done. Still to do: 3.2 (drawing box over the canvas), 3.4, 3.5, 3.6, 3.9–3.12.
- **Round 4:** some header, Stopped and Account fixes are in. Most items are still open.
- **Rounds 5, 6, 8, 9:** not started.
- **Round 7:** 7.1, 7.2 (`113_r15_fits`), 7.3 (`120_every_tool`) and 7.4 (`121_features`) are in the deploy gate. 7.5–7.9 aren't started.

**Unit tests:** 24,842 / 24,844 pass. The only failure is the known C9-S2R.

**Still wrong (found by this check):**
1. **1280 × 600, Make → Advanced → Arrange tab:** "Flip up/down" is under the **Cut this part** button and off the bottom of the screen; "Offset" and "Lock" are covered. (Plan 3.9)
2. **1280 × 600, Cut → Stopped:** **Download G-code** (`#btnExport4`) is off the bottom of the screen.
3. **3D models:** 25 of 93 are still flagged.
   - The 8 wrong models (5.2): chimney round and square, roof jack, skylight curb, cricket, pan flashing, dustpan, pipe clamp.
   - About 12 parts with holes that are cut but not shown in 3D (5.3): Z / U bracket, cable tray, corner guard, firepit, BBQ, pipe clamp, tee template, saddle hole, chimneys.
   - Templates not yet marked (5.4): fishmouth, pipe-on-flat, Y-branch, britches, the rectangular and reducing elbows, offset square-to-round.

   This is all expected until Round 5.

**Nothing new broken.** No page errors on any screen or tool at 1280 × 600, 1366 × 640 or 1536 × 730.

## History
- (first check)
