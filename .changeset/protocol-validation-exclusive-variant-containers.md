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
else being remembered.
