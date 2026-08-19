---
'@codaco/architect': patch
---

Tell apart two resources whose filenames differ only in how their accents are
encoded.

The Resource Library numbers duplicate filenames so no two cards read the same
(`people.csv`, `people (2).csv`). It compared names byte for byte, so a name
written with a precomposed `é` and the same name written as `e` plus a combining
accent counted as two different names — and both cards kept the identical
heading, badges and action labels, which is the one thing the numbering exists to
prevent. macOS hands filenames back with the accents decomposed where most other
sources compose them, so importing the same file from a Mac and from elsewhere
was enough to hit it.

Names are now compared in a canonical form, so those resources are numbered like
any other duplicate. Two names that differ only in capitalisation are still
treated as different, because a researcher can tell those cards apart. Nothing is
renamed on disk: the stored name and the name shown are still exactly what was
imported.
