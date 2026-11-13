# Connecting this app to FluidNC on an ESP32

Josh is driving the table with a **DUBEUYEW ESP32-DevKitC V1 (30-pin)** and a screw-terminal breakout, running **FluidNC** over USB or Bluetooth serial, with **DM542TE** stepper drivers.

## What works

- FluidNC speaks the same GRBL 1.1 status reports (`<Idle|MPos:…>`), `ok` / `error`, and realtime bytes (`?`, `!`, `~`, `0x18`, feed overrides) as a USB grblHAL controller. The app’s existing parser and job sender work over that protocol.
- In **Connect**, press **Connect (USB or Bluetooth)** and pick the board’s port. If you paired the table in Windows Bluetooth settings first, it shows as **Standard Serial over Bluetooth link**. The app uses the existing Web Serial connection; there is no separate FluidNC transport.
- FluidNC stores machine settings in **`config.yaml`**, not the usual GRBL `$0…$132` list. When the app sees FluidNC, the raw `$` editor is hidden and Settings offers this repo’s `config/fluidnc-plasma.yaml` template instead.
- The console (the “Controller” card for the admin, and the Pro firmware tools, which use the same filter) is **filtered on purpose**. It accepts only: `$$`, `$I`, `$G`, `$X`, `$H`, `$C`, `$n=value` (a documented GRBL number inside its safe range), `?`, `!`, `~`, short `G0`/`G1` jogs (up to 50 mm), `G90`/`G91`/`G92`/`G21`, `M5`, and `M3` on its own after a confirmation. Anything else is refused with a reason.
- FluidNC’s own `$` commands are **not** accepted by that filter, so they will not work from the app: `$/…` (read or set a config value by path), `$Config/…`, `$CD`, `$SD/…`, `$LocalFS/…`, `$Bye`, `$Report/…`, `$Firmware/…` and so on. To change a FluidNC setting, edit `config.yaml` and copy it to the board, then restart it.

## First setup (short)

1. Flash FluidNC onto the DevKitC, then put `config/fluidnc-plasma.yaml` on the board as `config.yaml`. Edit the GPIO numbers to match your breakout.
2. DM542TE: set the DIP switches for the current your motors need. `steps_per_mm` in the YAML is a starting point — measure a commanded 100 mm move and use Settings → calibration (Pro) to correct it, then write the new value back into the YAML.
3. Wire step/dir/enable, the torch relay (M3/M5), the floating-head probe, and (if you have them) limit / e-stop inputs.
4. On a computer in Chrome or Edge, press **Connect (USB or Bluetooth)** and pick the port. Close the FluidNC installer or any other program using the port first.

THC (torch height voltage) is not a built-in FluidNC feature on a stock DevKitC. Settings → Torch will say so unless you have a THC add-on the app can read. Pierce height, cut height and pierce delay are still applied in the G-code the app sends.
