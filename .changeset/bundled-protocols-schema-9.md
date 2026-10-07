---
'@codaco/development-protocol': major
'@codaco/sample-protocol': major
---

The development protocol and the sample protocol are now schema 9 protocols.
Neither has an `experiments` setting any more, because schema 9 has none: the
development protocol's encrypted attribute is still encrypted. Nothing else in
them changes. Reading them needs a version of
`@codaco/protocol-validation` that knows schema 9, because earlier versions
can't read a schema 9 protocol.
