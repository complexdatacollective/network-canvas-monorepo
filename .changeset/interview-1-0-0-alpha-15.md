---
'@codaco/interview': prerelease
---

`Shell` now scopes the interview theme purely declaratively via `<ThemedRegion theme="interview">` (from `@codaco/fresco-ui/ThemedRegion`). Removed the host-side `useLayoutEffect` requirement that previously toggled `data-theme-interview` on `<html>`.

Hosts mount `Shell` anywhere in the tree and the theme — plus a portal container that re-roots Base-UI portals (dialogs, popovers, dropdowns, tooltips, toasts, selects, comboboxes) inside the themed subtree — travels with it. The `<main data-theme-interview>` marker on the rendered DOM is unchanged, so existing test/e2e selectors continue to match.

For interview-themed UI rendered **outside** `Shell` (e.g. a post-interview "thank you" page), use `<ThemedRegion theme="interview">` directly. See README → _Theming & DOM scope_.

`CategoricalBin` now exposes a `data-cb-layout-pending` attribute on its outer container while its ResizeObserver-driven layout debounce is in flight. The attribute is cleared once `cols`/`rows` are committed. Runtime behaviour is unchanged for end users; the signal exists so e2e tests can deterministically wait for the catbin layout to settle before capturing screenshots.
