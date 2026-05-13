---
"@codaco/interview": major
---

Initial alpha release of `@codaco/interview` — the Network Canvas interview engine extracted from Fresco's `lib/interviewer/` into a standalone, host-pluggable package.

The package exposes a single `Shell` component plus the supporting context for embedding the interview UI in any React host (Next.js, Vite, Electron, etc.). It owns its own theme, Redux store, AnimatePresence-based stage navigation, and synthetic network generator; the host plugs in `currentStep`, `onStepChange`, `onSync`, `onFinish`, and `onRequestAsset`.

Key design decisions baked in for 1.0.0:

- `currentStep` is held in host state and threaded in through React Context (`CurrentStepContext`), not in the Redux store. `useStageSelector` reads a lagging `displayedStep` so selectors keep returning the OLD stage's data while the exit animation plays — the swap to the new stage only happens once `onExitComplete` fires.
- All in-package selectors that depend on the current stage are parameterised — they take `currentStep` as their second argument and compose via reselect.
- Stage components consume those selectors through `useStageSelector` rather than `useSelector`, so a stale stage subtree never reads new-stage data during the two-phase navigation transition.
- Theme tokens, font-size scale, and the `interface` / `focusable` / `scroll-area-viewport` utilities live in `@codaco/tailwind-config` and are scoped to the `<main data-interview>` root the Shell renders, so the host's typography is unaffected.
- E2E coverage is the SILOS protocol replay (56 tests × 3 browsers = 168 visual snapshots) running in the Playwright Docker image for snapshot determinism.
