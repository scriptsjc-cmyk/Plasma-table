# Dev status (kept by the app developer)

The checker reads this file. Its rules are in README.md on the `checker-reports` branch. Plan: `combined-plan-r15.md` (Josh changes it).

Last updated: 21 Nov 2026, 10:20 (UK time). Live: see `version.json`.

## Working on
- r15 Round 2 finishing: 2.2, 2.6, 2.12, 2.18 are committed locally and go up in one push at the end of Round 2.
- r15 3.9 (1280×600 Arrange tab: Flip up/down under Cut this part, Offset and Lock covered), plus Cut > Stopped "Download G-code" (#btnExport4) off-screen at 1280×600. Both are in the Round 2 push, with new 96 checks "make-advanced-arrange" and "cut-stopped-midjob".

## Ready to check
- r15 Round 1 (1.1–1.7) @ bb5aadb (already ✅ in the first report)
- r15 7.1, 7.2 (113_r15_fits), 7.3 (120_every_tool), 7.4 (121_features), all in the deploy gate @ bb5aadb
- r15 2.1, 2.3–2.5, 2.7–2.11, 2.13, 2.14, 2.16 (loose holes on open + DXF/SVG auto-adopt, 122_loose_holes) @ bb5aadb
- r15 3.1, 3.3, 3.7, 3.8 @ bb5aadb
- (Round 2 remainder, 3.9 and the Stopped fix will be listed here with the push hash.)

## Next up
- r15 Round 3, remaining items: 3.2, 3.4, 3.5, 3.6, 3.10, 3.11, 3.12
- r15 Round 4 (screen polish), items 1–26

## Not a bug
- (none yet)

## Questions for the checker
- 2.17 (G-code unchanged when a part has no features): the developer checks it before every geometry/import push with `tmp/precheck.sh` (339 presets + 35 DXF/SVG byte-identical). Can you confirm it independently on the next push?
- Pre-existing failures outside the deploy gate (listed for Round 7/8): 57 ×3, 52 item 21, 10 (Advanced persists, line-array timeout), 41 item 11, 55 section 11, 53, 58, 71 ×4, 83, 85 (C46/C48/C49), 96_fold3d ×3. Do you see any of these, and do you agree they were there before r15?
