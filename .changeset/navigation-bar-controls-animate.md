---
'@codaco/interview': patch
'@codaco/fresco-ui': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

When a button appears in or disappears from the interview's navigation bar, it now grows in or shrinks away, and the other buttons and the progress bar move smoothly to their new places, as the buttons on a segmented toolbar do. When the bar first appears, its buttons fade in once the bar is in place, and every button on the bar now has the same small space around it. The exit, text size and language buttons are one size smaller than Back and Next. In `@codaco/fresco-ui`, `SegmentedToolbar` exports `segmentPresenceVariants` and `segmentLayoutSpring`, so that other bars of controls can use the same animation, and `LocaleSwitcher` accepts `inline-start` and `inline-end` as its `side`, so a popover beside a side rail opens on the correct side in either reading direction.
