---
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

The automatic layout on the Sociogram, Narrative and Network Composer now finishes as soon as it starts, and the positions are saved straight away, so moving on to the next screen never loses them. While the first layout is worked out the screen shows a loading indicator, and then everyone fades in already in place. After that, when someone or a connection is added, people move smoothly to their new places, and the layout no longer shifts while the screen changes to the next one. Dragging someone no longer makes the people around them jump, and adding a connection or letting go of someone you dragged untangles crossing lines again. The layout uses more of the screen and crowds people less, especially in larger networks. Connected people sit closer together than people who aren't connected, everyone keeps at least half a person's width of space around them, separate groups of connected people stay apart instead of clumping together, and people with no connections sit around the outside. A new layout tries several arrangements, keeps the one with the fewest crossing lines, and then untangles it further. When someone is added or a connection changes, everyone else stays roughly where they were.
