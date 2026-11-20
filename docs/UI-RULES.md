# UI rules (read this first)

One page for anyone (person or AI helper) changing how Porta Plazma looks. Safety rules in `ARCHITECTURE.md` §4 come first; nothing here overrides them.

## Never
- **STOP never moves, fades, shrinks or animates.** It sits in the header at one fixed size per layout and is the largest control on every screen that shows it. It is the top layer: the header (`--z-header`) and STOP (`--z-stop`) are above every dialog, numpad, popover, toast and sheet. Only the pass-through hover tip and the pinned header-hidden layers are higher.
- **Never hide or drop a control to make a screen fit.** Move it (menu, tab, popover) instead.
- **Nothing animates during a job** (running, paused or E-stop) or with `prefers-reduced-motion`.
- Don't change `blockers()`, safety gates, STOP wiring / the space bar, the torch test, G-code, `cam.js`, job upload, element ids or what a control does as part of a look change.

## Tokens (`css/tokens.css`)
Every value below comes from a token; unit `15_tokens` fails on raw values.

| What | Tokens |
|---|---|
| Text sizes | `--fs-xs 12`, `--fs-s 13`, `--fs-m 15`, `--fs-l 18`, `--fs-xl 24`; named: `--fs-readout*`, `--fs-pct`, `--fs-icon-xl`; STOP has its own `--fs-stop*` |
| Colours | theme tokens (`--text`, `--muted`, `--accent`, `--go`, `--warn*`, `--alarm*`, `--ok*`, …) that switch with `data-theme`; fixed palette `--c-*`; shadows/scrims/glows `--shade-*`, `--black-*`, `--scrim-*`, `--stop-glow-*` |
| Layers | `--z-*`, lowest to highest; page-level z-index (10 and up) must be a token. Local stacking inside one panel may use 0–9 |
| Spacing | 4 / 8 / 12 / 16 / 24 (`--space` 8, `--space-2` 16, `--space-3` 24, `--pad`, `--gap`) |
| Radius, motion | `--r` 8 px; `--motion` 0.15 s, `--ease` |

`!important`: the count may only go down (unit 15 holds the maximum). Prefer a more specific selector in the file that owns the screen.

## Buttons
Five types, the same everywhere (see `base.css`):
- **primary** – solid, one main action per screen (`.primary` / `.go` green, `.accent` blue).
- **secondary** – the default outlined `<button>`.
- **quiet** – text only (`.quiet` / `.minor`).
- **danger** – `.danger` (Delete and friends).
- **icon** – `.iconbtn`; **always has a `title`** (e2e 111 checks every visible icon-only button). An "i" (`.info-i`) opens its own hover tip.
On/off settings are switches (`.switch`), not buttons. The same action looks the same everywhere.

## Text
Sentence case. A field label never wraps onto two lines; text is never cut with "…" without a `title`.

## Breakpoints
- Laptop shell: `(min-width: 1280px) and (hover: hover) and (pointer: fine)`; short laptop: add `(max-height: 720px)`.
- Header menu (☰): from 561 px up Account / Help / Settings / Setup live in the menu.
- Phone: up to 560 px; phone on its side: `body.short-land`.
Fit is checked by e2e `96_fits_screen` at 1280×600, 1366×640, 1536×730, 1440×800 and 1920×970.

## Transitions (`js/ui/transition.js`)
The change itself is always instant (clicks are never lost); the new content then gets a short entrance (opacity/transform only, ≤ 0.15 s): steps slide (`tx-fwd` / `tx-back`), tabs fade, popovers pop, paged lists slide, the step underline slides, Simple ⇄ Advanced slides the side panel. `still()` turns it all off during a job, on E-stop and with reduced motion. Don't use `startViewTransition`: it blocks clicks (STOP) while it runs.

## States
Lists and panels use the same pieces: `.empty-state` for "nothing here yet", `.ph-row` grey placeholders while loading, the red / amber `.banner` for errors and warnings.

## Checking your change
- `docs/gallery.html` (open it from the site, e.g. `/docs/gallery.html`) shows every button, chip, tab, banner, toast, pager, empty state and the type and colour tokens on one page.
- `cd tests && node ci-gate.mjs` is what the deploy runs: every unit suite plus the safety and fit suites. Pages only deploys when it passes.
