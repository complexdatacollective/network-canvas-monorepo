# Fluid typography scaling — products constant, presentation surfaces fluid

**Date:** 2026-07-24

## Problem

The shared Fresco theme drives its whole type + spacing system from one
sentinel, `--theme-root-size`, which the type scale (`--text-*`) and
`--spacing-base` all multiply against. It was recently changed to a fixed
`0.9rem` so that, on a display at standard macOS scaling, type and spacing
were no longer oversized (the value had effectively been tuned on a "more
space" display).

Making it fixed solved the standard-scaling case but removed all viewport
response: because the per-size `--text-*` clamps exhaust their internal `vw`
ramps by ~860px, every desktop viewport (1512 / 1728 / 2056 CSS px, i.e. the
laptop's default / more-space / most-space scaling modes) renders identically.
Switching display scaling produces no change.

An initial fix made `--theme-root-size` itself fluid everywhere. Analysis of
the impact showed that was wrong for **dense product UI**: Architect, the
Interviewer dashboards, and Fresco chrome inherit the default theme, so a
viewport ramp made their chrome and spacing ~20% larger on wide displays —
fitting _fewer_ rows/panels on screen, the opposite of what a data-dense tool
wants from a large monitor.

## Decision

Split behaviour by surface type:

- **Dense product UI keeps constant density.** The default theme ships a single
  fixed `--theme-root-size: 0.9rem`. Architect, Interviewer dashboards, and
  Fresco chrome all inherit it and never scale with the viewport, so a bigger
  monitor shows more content, not bigger content.
- **Presentation surfaces scale.** The public marketing sites and the
  full-screen participant interview grow their root size with the viewport, so
  they use the extra pixels of a wide / scaled-up display.
- **One source of truth for the ramp.** The tailwind package exports the fluid
  curve as a named token, and each opting-in surface references it — no
  copy-pasted `clamp()` that can drift.

### Values

Defined once in `tooling/tailwind/fresco/themes/default.css` (`@layer theme`,
`:root`):

```css
--theme-root-size: 0.9rem;                                       /* products: constant density */
--theme-root-size-fluid: clamp(0.9rem, 0.45rem + 0.5vw, 1.1rem); /* opt-in ramp for sites */
```

`--theme-root-size-fluid` holds `0.9rem` up to ~1440px, then ramps to `1.1rem`
by ~2080px (+22% max), so the marketing sites stay compact at standard scaling
and grow on wide / scaled-up displays.

The participant interview keeps its own curve — same `0.9rem` base, but the
ramp **starts early** so it has already reached ~`1rem` (the theme's previous
fixed base, and its visual reference at typical interview screen sizes) by
~1280px, continuing to a `1.25rem` cap on large displays:

```css
--theme-root-size: clamp(0.9rem, 0.75rem + 0.3125vw, 1.25rem)
```

| Viewport              | Interview root  |
| --------------------- | --------------- |
| ≤768                  | 0.90rem (floor) |
| 1280 (typical laptop) | 1.00rem         |
| 1512                  | 1.05rem         |
| 1728                  | 1.09rem         |
| 1920                  | 1.13rem         |
| ≥2560                 | 1.25rem (cap)   |

## Changes

1. **`tooling/tailwind/fresco/themes/default.css`** — revert
   `--theme-root-size` to `0.9rem`; add the `--theme-root-size-fluid` token
   beside it.
2. **`tooling/tailwind/fresco/themes/interview.css`** — set the interview
   theme's base `--theme-root-size` to `0.9rem` (was `1rem`) so the whole
   system shares one base value; the Shell ramp supplies the growth.
3. **`packages/interview/src/Shell.tsx`** — the Shell's scoped viewport ramp
   becomes `clamp(0.9rem, 0.75rem + 0.3125vw, 1.25rem)` (still an arbitrary
   `[--theme-root-size:…]` class on the Shell `<main>`, so scoping is
   unchanged).
4. **`apps/networkcanvas.com/app/globals.css`** — opt in:
   `:root { --theme-root-size: var(--theme-root-size-fluid); }` in `@layer base`.
5. **`apps/documentation/styles/globals.css`** — no change. Documentation is
   reading-heavy, so it keeps the constant `0.9rem` product base (stable
   reading measure across window sizes); only networkcanvas.com opts in.

Architect's `12px` print/summary surface and the Interviewer dashboards are
untouched by any of this and stay constant.

## Verification

- In `interview-storybook`: the default `:root` resolves to a constant
  `0.9rem` (14.4px) at every viewport; the interview Shell resolves to ~`1rem`
  (16px) at 1280px and ~`1.25rem` (20px) at ≥2560px.
- For networkcanvas.com: the site `:root` resolves to the fluid token —
  `0.9rem` at ≤1440px, growing above it (verified in a dev server or by
  inspection of the compiled globals).
- **Interview E2E visual baselines** will shift (the continuous ramp differs
  from the shipped stepped ramp in the mid-range). Regenerate the committed
  interview PNGs via the `regenerating-e2e-visual-snapshots` workflow **once
  the numbers are locked**, not during tuning.

## Out of scope

- Architect editor UI, Interviewer dashboards, Fresco chrome — intentionally
  stay constant-density on the fixed `0.9rem` base.
- The printable codebook / protocol summary — stays pinned to `12px` for print
  fidelity.
- Documentation site — reading-heavy, stays on the constant `0.9rem` base.
