# App bugs found while rebuilding the e2e suites (item 32) — ALL FIXED

BUG-1, BUG-2 and BUG-3 below were fixed in group 4 and their checks are now normal checks (no `known()` markers are left).


These are real app bugs. The tests that expose them use `t.known(...)`: while the bug exists the check is reported as `KNOWN` (not a failure);
when the app is fixed it prints "now PASSES — remove the known() marker". Tests were not allowed to change app code in this change set.

## BUG-1-CONNECT-HIDDEN — "Connect with USB" is hidden on a fresh load (suite 50)
- `js/app.js:1907` (`setConnected`):
  `$(id).classList.toggle("hidden", on || (id === "btnConnect" && S.noUsb));`
  When disconnected (`on === false`) and `S.noUsb` was never set (a USB-capable browser), the force argument is `undefined`, and
  `classList.toggle("hidden", undefined)` FLIPS the class instead of clearing it. The first `setConnected(false)` at boot therefore hides `#btnConnect`.
  A later disconnect flips it back, so the button is wrong every other time.
- Repro: open the app, sign in (or `?test=1`), `Go to cutting`, load any `.nc`/part so the bed step shows: **Practice** and **FluidNC** are shown but
  **Connect with USB** is not (`#btnConnect.className === "xl go hidden"`; `"serial" in navigator` is true). Introduced in round 4 (2bb5d96).
- One-line fix: `... .toggle("hidden", !!(on || (id === "btnConnect" && S.noUsb)))`.

## BUG-2-ADMIN-CONSOLE-LATCH — the latched E-stop does not block the Admin > Advanced console (suite 62)
- The round-5 latch is enforced in `js/machine.js` for `M.command({cmd:"console"})` (line ~249) and for `LATCH_BLOCKED` commands, but the Admin/Pro
  "Advanced machine" console submits through `js/app.js` `sendAdvanced` (~2612-2622) which calls `M.grbl.send(f.send)` directly.
- Repro: demo admin, cutting screen with Practice connected, press STOP (E-stop latched), open Admin > Advanced, type `M3` and accept the "fire the torch"
  confirmation (or type `G0 X5`): the line is written to the controller. Expected: refused with "E-STOP is ON. Press and hold the red button to reset it first."
- Scope: admin/Pro only, and `M3` still needs the confirm dialog.

## BUG-3-KEYPAD-LAND — type-in size box is taller than a phone on its side (suite 40)
- Introduced by the operator row (`#dimOps`, item 23, commit 8025105). At 750x340 (iPhone 14 landscape, Make a part, open a size with `openNumPad`/tap a size)
  `#dimEdit` is `top 161.7 -> bottom 342.6` in a 340 px tall viewport, so the bottom 2-3 px of the box (the OK/Done row) is cut off. It fitted before group 3.
- Fix is CSS only (e.g. `body.short-land #dimEdit` smaller key height / padding, or put the operators on one row beside the keys).
