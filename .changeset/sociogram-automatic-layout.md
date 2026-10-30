---
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

The automatic layout on the Sociogram, Narrative and Network Composer now finishes as soon as it starts, and the positions are saved straight away, so moving on to the next screen never loses them. People then move into place along the paths the layout took, so you still see it settle, without waiting for it. The layout uses more of the screen and crowds people less, especially in larger networks. Connected people sit closer together than people who aren't connected, everyone keeps at least half a person's width of space around them, and separate groups of connected people stay apart instead of clumping together. A new layout tries several arrangements, keeps the one with the fewest crossing lines, and then untangles it further. When someone is added or a connection changes, everyone else stays roughly where they were.
