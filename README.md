# Porta Plazma CNC

Browser operator screen for a CNC plasma table (FluidNC / grblHAL): draw or import a part, lay it on the sheet, set the start point, cut.
A static site (no build step) that works offline once loaded. Live: https://scriptsjc-cmyk.github.io/Plasma-table/

| | |
|---|---|
| `index.html`, `css/`, `sw.js`, `manifest.json` | the page, its styles (`css/`: tokens, base, layout, components, one file per screen), offline service worker |
| `js/` | the app, grouped by area: `core/ machine/ make/ cut/ ui/ account/` (+ `app.js` entry) |
| `config/` | machine, cut chart, controller settings (served to the app) |
| `docs/` | **`ARCHITECTURE.md`** (start here), `DEPLOY-STAMP.md`, `FLUIDNC.md`, `ACCOUNTS-SETUP.md` |
| `tests/` | unit + end-to-end tests, one command: `cd tests && npm install && npm test` (see `tests/README.md`) |
| `scripts/` | `stamp-version.sh` (deploy stamp + offline file list), `harden-csp.sh`, `serve-local.sh`, `gen-claim-codes.mjs` |
| `supabase/` | database schema, policies and fixes for the accounts backend (run by the owner, never by the app) |
| `pi/` | optional Raspberry Pi bridge; `samples/` example drawings |

Run it locally: `./scripts/serve-local.sh` then open http://localhost:8080/?test=1 (practice table, test handle on).
Deploys happen from `main` through GitHub Pages (`.github/workflows/pages.yml`); the live `version.json` always equals the deployed commit.

Rules of the house: work on `main`, plain `git pull` / `git push` (no `--rebase`), run the tests before pushing, never put a secret in
the client (only the publishable key is allowed there).
