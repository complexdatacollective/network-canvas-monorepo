---
'@codaco/interview': minor
---

Add offline-awareness and a more resilient stage error boundary.

- New `useOnline` hook (exported from the package root) — a single
  `useSyncExternalStore`-based source of online/offline state.
- The Geospatial stage now shows a persistent offline indicator when reached
  without a connection, and its error boundary explains the offline case
  (maps can't load) rather than a generic failure.
- The error-boundary fallback's "Copy Debug Info" button no longer depends on a
  host `Toast.Provider`: it now confirms inline, so a stage crash in a host that
  doesn't mount its own toast provider (e.g. the package e2e host or Architect's
  preview) no longer throws a secondary error inside the fallback.
