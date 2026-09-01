---
'@codaco/fresco-ui': minor
'@codaco/tailwind-config': minor
---

Add the everything bar component and the studio theme.

`@codaco/fresco-ui` gains `navigation/EverythingBar`, the shared
search-and-command surface specified for Network Canvas Studio: a ⌘K dialog
with an ARIA combobox over app-supplied providers, fixed Go to / Commands /
Documentation groups, rank-merged results with identity-stable highlighting,
frontier-bounded pagination, reference-only recents with permission
revalidation, and per-group error containment. It also gains `Kbd`, a semantic
keyboard-key component used for the bar's chord and shortcut hints, and
`ThemedRegion` now accepts `theme="studio"`.

`@codaco/tailwind-config` gains the scoped studio theme: a light mode on
subtly warmed paper and a midnight-blue dark mode, keyed off
`[data-theme-studio]` with dark driven by the existing `[data-theme='dark']`
attribute.
