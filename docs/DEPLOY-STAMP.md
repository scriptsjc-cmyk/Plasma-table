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
