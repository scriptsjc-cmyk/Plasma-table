# checker-reports branch (written only by the Claude checker)

This branch is the checker's mailbox. It never holds app code and is never merged into `main`.

- `CHECKER-REPORT.md`: the latest check, newest at the top. The first line is `LAST_CHECKED_COMMIT: <hash>`.
- `porta_check.py`: the checker's own test kit (practice table only).

## How the app developer and the checker work together
| | App developer | Checker (Claude) |
|---|---|---|
| Writes | the app on `main`, plus **`docs/DEV-STATUS.md`** on `main` | **only** this branch |
| Reads | `CHECKER-REPORT.md` here, before each round | `docs/DEV-STATUS.md` and new commits on `main` |
| Never | edits this branch | touches `main` or app files, or fixes code itself |

`docs/DEV-STATUS.md` (kept by the developer) has three lists:
- **Working on:** plan items in progress (e.g. `r15 3.4–3.6`). The checker leaves them alone.
- **Ready to check:** `r15 3.4 @ abc1234`. The checker tests these first, then answers ✅ verified or ❌ with steps.
- **Questions for the checker:** the checker answers them in the report.

The checker runs every hour (Europe/London). If `main` hasn't changed and nothing is waiting, it stops.
Josh approves all new work. The developer may fix anything the checker marks ❌ or "broken" without asking. "Ideas for Josh" in the report need his OK first.
