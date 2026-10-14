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
empty, a short looping animation of a pointer bringing a person down into a drop
zone replaces the arrow icon; it holds still when reduced motion is on. On
bin stages where people are placed by tapping, the drawer stays open and has
no tab, so the person being placed is always in view.

`@codaco/fresco-ui` adds `NodeDropAnimation`, a decorative loop of a pointer
bringing a node down into a drop zone, for empty drop targets.
