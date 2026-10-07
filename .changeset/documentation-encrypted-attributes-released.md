---
'@codaco/documentation': minor
---

The documentation now describes encrypted attributes as a standard feature
of schema 9, not an experiment. The Anonymisation interface page no longer
says it must be turned on from Architect's Experimental Features page, which
schema 9 removes, and the Interfaces, Variables and Export Data Dictionary
pages no longer call it experimental. The Anonymisation page also now gives
the exported placeholder for an encrypted value as `ENCRYPTED`, the string
exports actually write.

The Anonymisation page now explains how answers are protected: one key for
each interview, derived from the participant's passphrase with PBKDF2-SHA256
(600,000 iterations and a random salt) and used with AES-256-GCM; each answer
bound to the person and question it belongs to, and padded; and a check value
that confirms a passphrase without storing it. It explains that a participant
confirms the passphrase when choosing it, that it must be at least 8
characters long unless the stage sets its own minimum, which replaces the
default even when shorter, that a maximum shorter than 8 lowers the default
minimum to match, and that a forgotten passphrase cannot be recovered by
anyone. A new section explains what a participant sees when an interview's
protection details are damaged or come from a newer version, and the export
section now says that only answers saved encrypted are replaced with
`ENCRYPTED`.

The schema information page explains what upgrading a schema 8 protocol does
to its encrypted attributes. If the experiment was on, they stay marked and
new answers are encrypted, but answers the experimental version protected
can't be read after the upgrade: those interviews still open, and the old
answers show as "Answer unavailable" and export as `ENCRYPTED`. If the
experiment was off, the attributes are unmarked, so they keep being collected
without encryption.
