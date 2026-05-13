---
"@codaco/interview": prerelease
---

Several CategoricalBin layout/render fixes and motion-gating cleanup:

- **CategoricalBin no longer renders bins until layout has settled.** `useCircleLayout` now exposes `isReady`; `CategoricalBin.tsx` gates its `<AnimatePresence>` subtree on it. The hook also waits for a 120ms ResizeObserver-quiet window (and rejects measurements smaller than 64px) before committing dimensions, so the bins land in their final grid on first paint instead of briefly stacking vertically while parent flex/sibling motion settles. The `containerRef` moved from the inner `motion.div` to the outer `.catbin-outer` (the actual `flex-1` element whose dimensions drive the layout decision).
- **CategoricalBin wrapper class fixed for WebKit flex-determined sizing.** `<div className="flex size-full flex-col items-center gap-2">` → `<div className="flex w-full min-h-0 flex-1 flex-col items-center gap-2">`. The previous `size-full` (= `height: 100%`) didn't resolve definitely on WebKit when the parent's height was flex-determined.
- **Removed per-component `isE2E` motion skips** in `Shell.tsx` and `QuickNodeForm.tsx`. Animation disabling is the responsibility of the host's `MotionConfig` (the e2e host now uses `reducedMotion="always" skipAnimations`); individual motion components shouldn't replicate that. The `isE2E` flag remains for non-motion concerns (mock data, test instrumentation, mapbox stubbing, video stability).
- **`Navigation.tsx` `animate-pulse-glow` CSS class is now gated on `useReducedMotion()`** so the pulse stops cleanly under reduced-motion preference.
- **New dev helper:** `e2e/host/scripts/seed-silos.ts` + `public/seed-silos.html` for browsing the e2e host with a populated SILOS interview without spinning up Playwright.
