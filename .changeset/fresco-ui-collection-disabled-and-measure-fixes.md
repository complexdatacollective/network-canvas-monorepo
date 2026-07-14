---
'@codaco/fresco-ui': patch
---

Fix two Collection bugs surfaced by the interview e2e suite. `useSelectionState`
now clears `disabledKeys` when the prop changes to an empty or undefined set, so
cards re-enable once a consumer stops gating them (previously the stale disabled
set persisted forever). `useMeasureItems` now re-measures after a completed
measurement is invalidated by a collection/layout identity change that lands in
the same commit as the recovery pass — the reset path bumps the measurement
version so the effect re-runs, preventing the virtualized list from wedging at
zero rows (`totalHeight: 0`) after a burst of store updates.
