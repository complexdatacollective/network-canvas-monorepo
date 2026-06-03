---
'@codaco/interview': patch
---

Fix the `FamilyPedigree` layout breaking at larger viewport widths. `useNodeMeasurement` portaled its hidden measurement node into `document.body`, which sits outside the interview `Shell`'s `[data-theme-interview]` region. Network Canvas node sizes derive from `--theme-root-size` (via Tailwind's `--spacing-base`), and the `Shell` ramps that variable with viewport width (1rem → 1.125rem → 1.25rem). The portaled measurement therefore always resolved the base 1rem and under-measured the nodes that actually render larger inside the `Shell`, so `PedigreeLayout` sized its position cells too small and the nodes overflowed/overlapped at `laptop`/`desktop-lg` breakpoints.

The measurement element is now rendered inline rather than portaled to `document.body`, so it inherits the same scaled `--theme-root-size` context as the rendered nodes. It stays off-screen via `position: fixed` + `visibility: hidden`, so it still doesn't affect the caller's layout.

Treat every gestational carrier in the `FamilyPedigree` wizards as a non-genetic surrogate. A gestational carrier never contributes the egg, so the redundant "Was this person a gestational surrogate?" question has been removed from both the quick-start and add-parents-later flows, and the carrier is now always recorded with the `surrogate` relationship type. This also fixes a bug where a carrier who used a donated egg was classified as `biological` and incorrectly counted as a genetic relative of the participant.
