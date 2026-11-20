# Porta Plazma CNC

Browser operator screen for a CNC plasma table (FluidNC / grblHAL): draw or import a part, lay it on the sheet, set the start point, cut.
A static site (no build step) that works offline once loaded. Live: https://scriptsjc-cmyk.github.io/Plasma-table/

The laptop is the focus. Every machine picture is drawn as seen from the **front of the table** (gantry at the top of the screen, home at the back-left). The app talks to the board over **USB or Bluetooth serial** (Web Serial in Chrome or Edge). On FluidNC a cut is uploaded as `/job.nc` by XModem and started with `$LocalFS/Run`. There is no Wi-Fi / WebSocket path.

The full map, safety rules and deploy notes are in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. Start there when you need to know which file does what.

## Where things live

| Path | What it is |
|---|---|
| `index.html`, `html/` | The page shell and the Make / Cut / Your parts / Machine setup HTML partials |
| `css/` | Styles, linked in cascade order: tokens, base, layout, components, then one file per screen, then `yours.css` |
| `js/app.js`, `js/boot.js` | Entry point (wires and binds) and HTML-partial loader |
| `js/core/` | Shared helpers: geometry, expressions, DOM, the one state object `S`, hooks, prompts |
| `js/make/` | Make a part: the `Sketch` editor (`sketch*.js`), shapes, presets (`presets/`), DXF/SVG/text/trace, 3D/fold preview |
| `js/cut/` | CAM, job building, cut check, nesting, Bed & start, preview, checklist, Start / Pause / STOP |
| `js/machine/` | Talking to the controller: `usbserial.js` (USB/Bluetooth), `grbl.js`, `boardrun.js` + `xmodem.js`, safety, jog, settings, Test torch, Reverse X/Y/Z |
| `js/ui/` | Screens, menu, header, Simple/Advanced mode, `refresh()`, laptop chrome, inspector |
| `js/account/` | Sign-in, saved parts, machine claims, admin (Supabase publishable key only, or a local demo store) |
| `config/` | `machine.json`, `cut_chart.json`, and the FluidNC **template** `fluidnc-plasma.yaml` |
| `hardware/` | Josh's board `config.yaml` (check the board itself before changing pins — polarity can differ) |
| `docs/` | **ARCHITECTURE.md** (the map), `FLUIDNC.md`, `DEPLOY-STAMP.md`, `ACCOUNTS-SETUP.md` |
| `tests/` | Unit + end-to-end tests: `cd tests && npm install && npm test` (see `tests/README.md`) |
| `scripts/` | `stamp-version.sh` (deploy stamp + offline file list), `harden-csp.sh`, `serve-local.sh` |
| `samples/` | Example drawings |
| `supabase/` | Schema and policies the owner runs; never put a secret in the client |

## Run it locally

`./scripts/serve-local.sh` then open http://localhost:8080/?test=1 (practice table, test handle on).

Deploys happen from `main` through GitHub Pages (`.github/workflows/pages.yml`). The live `version.json` always equals the deployed commit. After adding a JS module, keep the committed `sw.js` precache list in line with `scripts/stamp-version.sh` (suite 59 checks this); deploy stamps it again anyway.

Rules of the house: work on `main`, plain `git pull` / `git push` (no `--rebase`), run the related tests before pushing, never put a secret in the client (only the publishable key is allowed there), never press Connect or send commands to a real machine.
