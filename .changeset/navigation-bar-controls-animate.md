---
'@codaco/interview': patch
'@codaco/fresco-ui': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

When a button appears in or disappears from the interview's navigation bar, it now grows in or shrinks away, and the other buttons and the progress bar move smoothly to their new places, as the buttons on a segmented toolbar do. In `@codaco/fresco-ui`, `SegmentedToolbar` exports `segmentPresenceVariants` and `segmentLayoutSpring`, so that other bars of controls can use the same animation.
