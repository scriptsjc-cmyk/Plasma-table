# Connecting this app to FluidNC on an ESP32

Josh is driving the table with a **DUBEUYEW ESP32-DevKitC V1 (30-pin)** and a screw-terminal breakout, running **FluidNC** over Wi-Fi, with **DM542TE** stepper drivers.

## What works

- FluidNC speaks the same GRBL 1.1 status reports (`<Idle|MPos:…>`), `ok` / `error`, and realtime bytes (`?`, `!`, `~`, `0x18`, feed overrides) as a USB grblHAL controller. The app’s existing parser and job sender work over that protocol.
- In **Connect**, choose **FluidNC (Wi-Fi)** and enter the ESP32’s IP or hostname (for example `192.168.1.50` or `fluidnc.local`). The app opens a raw WebSocket at `ws://<host>:81` (FluidNC’s default: HTTP port + 1).
- USB serial still works if you plug the ESP32 into the computer and pick the port.
- FluidNC stores machine settings in **`config.yaml`**, not the usual GRBL `$0…$132` list. When the app sees FluidNC, the raw `$` editor is hidden and Settings offers this repo’s `config/fluidnc-plasma.yaml` template instead. You can still send `$$`, `$I` and `$/` style FluidNC commands from the filtered console if you need them.

## The HTTPS mixed-content problem (important)

The public app is on **GitHub Pages, which is HTTPS**. FluidNC’s WebSocket is **plain `ws://` on your LAN** (FluidNC does not ship a trusted HTTPS certificate). Browsers **block** a page on `https://` from opening `ws://`. That is a browser rule, not a bug in this app. There is no safe way to punch through it from the live Pages site.

Ways that **do** work:

1. **Open the app over HTTP on the same LAN** (recommended). Download a copy of the site (GitHub → Code → Download ZIP, or the files in this repo) and serve them with any static server, then open `http://127.0.0.1:8080/` (or the computer’s LAN address). From an `http://` page, `ws://fluidnc.local:81` is allowed. A helper script is `scripts/serve-local.sh`.
2. **Serve the app from the ESP32 itself.** FluidNC already has an HTTP server on port 80. Copy the site’s files onto its local filesystem / SD card and open `http://<fluidnc-ip>/`. Same-origin or `http://` + `ws://` will work. The ESP32 has limited storage, so you may need a trimmed copy (HTML, CSS, `js/`, `config/`).
3. **USB serial** does not have this restriction. Use **Connect** → the USB port on any origin, including GitHub Pages.

If you try FluidNC from the live HTTPS site, the app will refuse and show this explanation rather than fail silently.

## First setup (short)

1. Flash FluidNC onto the DevKitC, then put `config/fluidnc-plasma.yaml` on the board as `config.yaml`. Edit the GPIO numbers to match your breakout, and the Wi-Fi SSID/password.
2. DM542TE: set the DIP switches for the current your motors need. `steps_per_mm` in the YAML is a starting point — measure a commanded 100 mm move and use Settings → calibration (Pro) to correct it, then write the new value back into the YAML.
3. Wire step/dir/enable, the torch relay (M3/M5), the floating-head probe, and (if you have them) limit / e-stop inputs.
4. Serve this app over HTTP as above, choose **FluidNC (Wi-Fi)**, and press Connect.

THC (torch height voltage) is not a built-in FluidNC feature on a stock DevKitC. Settings → Torch will say so unless you have a THC add-on the app can read. Pierce height, cut height and pierce delay are still applied in the G-code the app sends.
