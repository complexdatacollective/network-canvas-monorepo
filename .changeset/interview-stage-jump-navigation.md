---
'@codaco/interview': patch
---

Go to the chosen screen when picking one from the navigation bar. Screens that
have their own internal steps previously ignored the choice — picking a later
screen from an alter form moved to the next person's form and stayed put.
Picking a screen now saves the current form if it can, asks before discarding
changes that cannot be saved, and otherwise moves straight there without
requiring the form to be completed first.
