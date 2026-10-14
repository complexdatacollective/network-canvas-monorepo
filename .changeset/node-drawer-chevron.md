---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
'@codaco/fresco-ui': minor
---

The tab on the drawer of people still to place (on bin stages and the
sociogram) no longer shows a count, which repeated what the drawer already
shows. Its chevron is larger and the tab stays easy to tap. Screen readers
still hear how many people are left. When the sociogram's drawer is open and
empty, a short looping animation of a person dropping into place replaces the
arrow icon; it holds still when reduced motion is on.

`@codaco/fresco-ui` adds `NodeDropAnimation`, a decorative loop of a node
dropping into an empty slot, for empty drop targets.
