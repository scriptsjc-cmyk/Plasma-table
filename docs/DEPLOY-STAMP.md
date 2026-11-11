# Version stamp at deploy

`scripts/stamp-version.sh` writes `version.json`, `js/version.js` and the service-worker cache name from the commit being deployed.
Add one step to the deploy workflow, after checkout and before publishing (no `.sql`, no secrets):

```yaml
      - name: Stamp version from this commit
        run: ./scripts/stamp-version.sh
```

The footer and About read `version.json` when the page starts, so they show the deployed commit even if only that file changed.
The "New version available" banner shows only when `version.json` changes after a page has loaded.
Nothing needs stamping by hand any more.

## Offline cache and the public page's policy

`./scripts/stamp-version.sh` also rewrites the **precache list** in `sw.js` (between the `precache:start/end` markers) from the files that
exist: `index.html`, every `css/**/*.css`, every `js/**/*.js` (any folder depth), icons, manifest and config. So every deployed release caches
exactly its own app shell and a new, moved or renamed file can never be forgotten (`tests/e2e/59` fails if a module is missing from the list). Old `plasma-cad-*` caches are
deleted when the new worker activates.

`.github/workflows/pages.yml` also runs `./scripts/harden-csp.sh`, which removes `ws:` from the page's `connect-src` **in the deployed
copy only**. The repo copy keeps `ws:` so a copy served over plain http on your LAN (or by the Pi) can reach FluidNC at `ws://<ip>:81`.
The public site is https, and browsers never let an https page open `ws://`, so there it was only extra room for a hostile script.
Neither copy allows `wss:` any more: nothing in the app uses it for an outside host.
