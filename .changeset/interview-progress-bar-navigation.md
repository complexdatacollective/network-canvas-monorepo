---
'@codaco/interview': minor
---

Add an opt-in `allowStageNavigation` prop to `Shell`. When enabled, clicking the
interview progress bar expands into a searchable stages menu (with a timeline and
per-stage cards) for jumping directly to any stage, mirroring the legacy app.
Jumps run the same `beforeNext` validation as the next/back buttons and ask for
confirmation before showing a stage that skip logic would otherwise hide. Off by
default; no change to existing behaviour.

Also adds an optional `renderStagePreview?: (stageType) => ReactNode` prop so
hosts can supply per-stage-type preview thumbnails for the menu (e.g. from
`@codaco/interface-images`); when omitted, a placeholder icon is shown. The
interview package ships no image assets itself.
