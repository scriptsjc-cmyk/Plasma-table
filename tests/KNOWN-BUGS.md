# Known app bugs

None open. A check that exposes a real app bug we are not allowed to fix in the same change uses `t.known(name, cond, "BUG-ID")`:
while the bug exists it is reported as `KNOWN` (not a failure) and when the app is fixed it prints "now PASSES - remove the known() marker".
Add the bug here (id, repro, scope) while it is open and delete the entry when it is fixed.

## History (all fixed, with regression checks)

- **BUG-1 connect button hidden on a fresh load** - `setConnected` toggled `hidden` with `undefined` (flipped instead of cleared). Fixed with `!!(...)`; checked in suite 50.
- **BUG-2 latched E-stop did not block the Admin > Advanced console** - the console now goes through `M.command({cmd:"console"})` so the latch applies; checked in suite 62.
- **BUG-3 type-in size box taller than a phone on its side** - fixed in CSS; checked in suite 40.
