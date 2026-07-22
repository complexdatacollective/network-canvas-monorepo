---
'@codaco/interview': patch
---

Name generator panels now respect the screen's maximum number of people.
Previously the limit only stopped new people being added through the form or
quick add field, so a participant who had reached the maximum could keep
dragging people out of a side panel. Panel items can no longer be dragged once
the maximum is reached, and dragging people back into a panel to remove them
still works as before.
