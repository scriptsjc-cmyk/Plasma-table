# Known app bugs

Open:

- **R15-HOLES - Make: the inspector's Holes tab is empty for a picked plate** (r15 7.2 finding; the fix is r15 Round 2, the Features / Holes list). Repro: Advanced or Pro, add a plate with holes, pick it, open the Holes tab: no holes are listed. Scope: e2e 113 (`make-advanced-plate: the Holes tab lists the plate's holes`, all five sizes) - marked `t.known` so 113 can be in the deploy gate for everything else. Remove the marker (back to `t.check`) when Round 2 lands; it is not in known-failures.txt.

A check that exposes a real app bug we are not allowed to fix in the same change uses `t.known(name, cond, "BUG-ID")`:
while the bug exists it is reported as `KNOWN` (not a failure) and when the app is fixed it prints "now PASSES - remove the known() marker".
Add the bug here (id, repro, scope) while it is open and delete the entry when it is fixed.

## History (all fixed, with regression checks)

- **BUG-1 connect button hidden on a fresh load** - `setConnected` toggled `hidden` with `undefined` (flipped instead of cleared). Fixed with `!!(...)`; checked in suite 50.
- **BUG-2 latched E-stop did not block the Admin > Advanced console** - the console now goes through `M.command({cmd:"console"})` so the latch applies; checked in suite 62.
- **BUG-3 type-in size box taller than a phone on its side** - fixed in CSS; checked in suite 40.
