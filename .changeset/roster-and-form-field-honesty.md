---
'@codaco/interview': patch
---

An interview no longer says a list is empty before it has read it.

**A roster stops reporting itself empty before it has been read.** A Name
Generator built on a roster, and an external panel in an ordinary Name
Generator, both showed their empty message on the first frame, because "not
started" and "finished, and there was nothing" looked identical from the
outside. That is a statement about the researcher's data, and it was made
before any of it had been looked at. Both now wait, showing that they are
loading until the list has actually arrived.
