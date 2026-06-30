---
'@codaco/interview': minor
---

Add an opt-in `allowStageNavigation` prop to `Shell`. When enabled, clicking the
interview progress bar expands into a searchable stages menu (with a timeline and
per-stage cards) for jumping directly to any stage, mirroring the legacy app.
Jumps run the same `beforeNext` validation as the next/back buttons and ask for
confirmation before showing a stage that skip logic would otherwise hide. Off by
default; no change to existing behaviour.

Per-stage preview thumbnails in the menu are rendered by the package itself from
`@codaco/interface-images`, so hosts don't supply them.
