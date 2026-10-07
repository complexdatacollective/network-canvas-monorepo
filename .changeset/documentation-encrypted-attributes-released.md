---
'@codaco/documentation': minor
---

The documentation now describes encrypted attributes as a standard feature
of schema 9, not an experiment. The Anonymisation interface page no longer
says it must be turned on from Architect's Experimental Features page, which
schema 9 removes, and the Interfaces, Variables and Export Data Dictionary
pages no longer call it experimental. The schema information page explains
what upgrading a schema 8 protocol does to its encrypted attributes: they stay
encrypted if the experiment was on, and are unmarked, so they keep being
collected without encryption, if it was off. The Anonymisation page also now
gives the exported placeholder for an encrypted value as `ENCRYPTED`, the
string exports actually write.
