---
'@codaco/interviewer': patch
---

Fixed the installed app on iPhone being left zoomed and shifted under the
status bar after the keyboard closed. iOS zooms in slightly when a text field
is focused and could fail to zoom back out when typing finished, leaving the
whole interview stuck partly off screen until the device was rotated. The app
now detects this leftover zoom after typing ends and restores the normal view
automatically, without affecting pinch-to-zoom.
