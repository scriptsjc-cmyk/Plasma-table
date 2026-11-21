# checker-reports branch (written only by the Claude checker)

This branch is the checker's mailbox. It never holds app code and is never merged into `main`.

- `CHECKER-REPORT.md`: the latest check, newest at the top. The first line is `LAST_CHECKED_COMMIT: <hash>`.
- `porta_check.py`: the checker's own test kit (practice table only).

## Who does what (so we never undermine each other)
| | App developer | Checker (Claude) |
|---|---|---|
| Writes | the app on `main`, plus **`docs/DEV-STATUS.md`** on `main` | **only** this branch |
| Reads | `CHECKER-REPORT.md` here, before each round | `docs/DEV-STATUS.md` and new commits on `main` |
| Owns | all code, all tests in `tests/`, the CI gate, every commit to `main` | checking, finding problems, preparing the next round |
| Never | edits this branch | pushes to `main`, edits app or test files, or fixes code itself |

**One writer per file.** If the checker has a fix or a test to suggest, it puts it in its report as a snippet; the developer decides whether to copy it in.

## `docs/DEV-STATUS.md` (kept by the developer)
- **Working on:** plan items in progress (e.g. `r15 3.4–3.6`). The checker leaves these alone.
- **Ready to check:** `r15 3.4 @ abc1234`. The checker tests these first and answers ✅ verified or ❌ with screen size and steps.
- **Next up:** the items the developer will start next. The checker prepares them (see below).
- **Not a bug:** checker findings the developer disagrees with, with one line why. The checker stops reporting them. If it still thinks they're wrong, it moves them to "For Josh to decide".
- **Questions for the checker:** the checker answers them in the report.

## How the checker speeds things up
1. **Prep for the next round.** For each "Next up" item, the report gives:
   - the root cause, with file and line where it can find them;
   - a suggested fix approach;
   - a ready-made test check (steps, sizes, expected result) the developer can paste into a suite.
   
   The developer still decides how to build it.
2. **Heavy checking.** The checker runs the cross-size screens, every tool and all fold presets, so the developer can run only the related tests plus the CI gate per commit, and leave the wide sweep to the checker.
3. **Fast replies.** It runs every hour (Europe/London). If `main` hasn't changed and nothing is waiting, it stops in seconds.

## Approvals
- Josh approves all new work. The plan is `combined-plan-r15.md`, and only Josh changes it.
- The developer may fix anything the checker marks ❌ or lists under "New problems" without asking.
- "Ideas for Josh" and "For Josh to decide" wait for his OK. The checker never asks the developer to build anything outside the plan.
- Safety rules beat everything: STOP never hidden, moved or shrunk; `blockers()` and safety gates unchanged; practice table only.
