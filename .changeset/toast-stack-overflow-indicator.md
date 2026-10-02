---
'@codaco/fresco-ui': patch
---

An expanded stack of notifications no longer runs off the top of the screen.
When several tall notifications are open at once, such as Fresco's persistent
export warnings, hovering the stack (or pressing F6) used to push the oldest
ones out of sight, where they could be neither read nor dismissed.

The expanded stack now shows only the notifications that fit on screen, and a
"2 more notifications" label above it counts the rest. Dismissing a
notification brings the next hidden one into view. Hidden notifications are
skipped by Tab and by screen readers, which can still read the count. The label
is translated into every supported language.
