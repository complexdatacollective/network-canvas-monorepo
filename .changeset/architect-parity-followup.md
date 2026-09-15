---
'@codaco/architect': patch
---

The stage editor's sections are as wide as they used to be. Gutters were being
spent out of the column's own maximum width rather than outside it, so every
section on a stage editor was drawn 48 pixels narrower than intended.

A pedigree remembers the terminology you saved. Choosing "gendered", saving,
then switching the framing to a participant choice and back put "gamete" in
the box again — the terminology the stage was opened with rather than the one
you had chosen and stored. It now restores what you last saved, whether or not
you changed it before the save.

The map preview draws a real map again. Setting a geospatial stage's starting
view said the map could not be drawn here and left you typing coordinates by
hand; it now opens the map your chosen API key and basemap produce, which is
the map the participant will see, so the view is framed against it. A protocol
whose stored key has no value in it says that instead, and points you at a
different key or the coordinate boxes.

A rule reads back with the same attribute pill as everywhere else — filled and
coloured for the kind of answer it holds, rather than a plain outlined chip. An
attribute the codebook no longer has still appears, marked in the destructive
colour and described as missing, so you can see what the rule is pointing at
and repair it.
