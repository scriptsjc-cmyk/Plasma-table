# Releases and the stable channel (r15 9.1)

| Address | What it is | Who it is for |
|---|---|---|
| `https://scriptsjc-cmyk.github.io/Plasma-table/` | every change on `main`, as soon as the deploy gate passes | Josh and testing |
| `https://scriptsjc-cmyk.github.io/Plasma-table/stable/` | the newest release Josh **promoted after a real cut** | buyers |
| `https://scriptsjc-cmyk.github.io/Plasma-table/v/<commit>/` | the newest 3 promoted releases (the first is the same as stable) | rollback |

`channels.json` at the site root lists what stable is and which releases are kept. Until the first promotion there is no
`stable/` (the deploy is exactly as before).

## Promote a release (after a real cut)
1. Cut a real part on a real table with the release on the main site (About shows its id, e.g. `2026.11.22-0c9af48`).
2. GitHub → Actions → **Promote to stable** → Run workflow. `ref`: leave `main`, or put the commit you cut with.
   Tick **"I cut a real part with this release…"**. The run refuses without the tick, and refuses a commit that is not on `main`.
3. It tags the commit `stable-<date>-<commit>` and redeploys. A few minutes later `/stable/version.json` shows that commit.

## Roll back
Run **Promote to stable** again with the older commit (one of the `v/<commit>/` ones in `channels.json`). It becomes stable
again. Buyers can also be pointed straight at `/v/<commit>/` while you sort it out.

## Things to know
- Each copy has its own service-worker cache, so the main site, stable and kept releases never clear each other's offline copy.
- All copies are on the same site, so they share the browser's saved settings, parts and sign-in. A kept older release reads
  settings saved by a newer one; it ignores what it does not know.
- **Sign-in links:** add `https://scriptsjc-cmyk.github.io/Plasma-table/stable/` (and `/v/*` if wanted) to the Supabase
  Auth redirect URLs, or e-mail sign-in links from stable will land on the main site. Josh changes that in Supabase himself.
- Only Josh promotes. Agents never run the promote workflow.
