---
'@codaco/development-protocol': major
'@codaco/sample-protocol': major
---

The development protocol and the sample protocol are now schema 9 protocols.
Their text is declared as US English (`en-US`), and their codebook types and
variables have labels. The development protocol is also translated into
Spanish (`es`) and opens with a language chooser stage. Reading them needs a
version of `@codaco/protocol-validation` that knows schema 9, because earlier
versions can't read a schema 9 protocol.
