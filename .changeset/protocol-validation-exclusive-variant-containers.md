---
'@codaco/protocol-validation': minor
---

`isExclusiveVariantContainer` answers whether a place in a stage document holds
one of several mutually exclusive shapes — a sociogram's background, which is an
image or a number of concentric circles and never both; a family pedigree's
framing; the destination a skip-logic rule jumps to. An editor that writes part
of such a container while somebody else switches which shape it is would leave a
protocol carrying half of each, so an editor can now ask, and write the whole
container instead.

The answer is read off the stage schemas themselves rather than from a list kept
beside them, so a stage type that gains a variant is covered without anything
else being remembered. A path may run through a list, naming its rows with the
exported `VARIANT_ROW_SEGMENT`: a sociogram prompt's highlight is a variant too,
and a merge that puts a rewritten row back property by property can leave half
of each shape there just as readily.

One path is deliberately unanswered, because the stage types disagree about it:
a categorical bin's prompt row is itself a choice of shape, and every other
stage type's prompt is an ordinary row. A caller holding a stage's fields cannot
tell which it has, so neither answer is given.
