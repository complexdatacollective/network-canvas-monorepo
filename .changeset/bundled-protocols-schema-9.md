---
'@codaco/development-protocol': major
'@codaco/sample-protocol': major
---

The development protocol and the sample protocol are now schema 9 protocols.
Their text is declared as US English (`en-US`), and their codebook types and
variables have labels. The development protocol is also translated into
Spanish (`es`) and opens with a language chooser stage. Their `experiments`
setting is now empty, because schema 9 needs no experiment to encrypt an
attribute marked as encrypted: the development protocol's encrypted attribute is still encrypted. Its stage filters and skip
logic no longer have rules on that attribute, which schema 9 refuses: they
only ever compared its encrypted text, so its stages behave as they did. Reading them needs a
version of `@codaco/protocol-validation` that knows schema 9, because earlier
versions can't read a schema 9 protocol.
