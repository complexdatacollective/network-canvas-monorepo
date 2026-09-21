---
'@codaco/architect': patch
'@codaco/fresco-ui': patch
---

Error messages inside a list item in Architect, such as the one under a
yes/no attribute's answer labels, can be read again. They were red on the
slate blue row and almost invisible. They now appear as white text in a red
box, the same treatment Fresco UI already uses for errors on coloured
backgrounds. Other destructive text on these rows, such as the required-field
marker, is drawn in a light tint that stays legible against the row.
