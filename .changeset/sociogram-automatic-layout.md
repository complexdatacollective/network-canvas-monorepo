---
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

The automatic layout on the Sociogram, Narrative and Network Composer now finishes as soon as it starts, and the positions are saved straight away, so moving on to the next screen never loses them. People then move into place along the paths the layout took, so you still see it settle, without waiting for it. The layout uses more of the screen and crowds people less, especially in larger networks. People with no connections sit on an oval around the edge of the network instead of among the groups, and a new layout tries several arrangements and keeps the one with the fewest crossing lines. When someone is added or a connection changes, everyone else stays roughly where they were.
