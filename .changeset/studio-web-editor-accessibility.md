---
'@codaco/studio-web': patch
'@codaco/studio-api': patch
---

The protocol editor now works better with a keyboard and a screen reader. Moving a screen in the outline with the arrow keys or the move buttons is announced with its new position, and focus stays on the screen you moved, including at the top and bottom of the list. Focus also stays on Add while a new screen is being added, and returns to it after you refresh the outline. Each validation problem is now a button that takes you to the screen and field it is about, and the number of problems is announced when it changes. If you lose the right to edit a screen, or open one that someone else is editing, the editor now says so aloud.
