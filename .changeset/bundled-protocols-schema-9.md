---
'@codaco/development-protocol': major
'@codaco/sample-protocol': major
---

The development protocol and the sample protocol are now schema 9 protocols.
Nothing else in them changes. Reading them needs a version of
`@codaco/protocol-validation` that knows schema 9, because earlier versions
can't read a schema 9 protocol.
