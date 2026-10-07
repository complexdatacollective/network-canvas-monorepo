---
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

Encrypted attributes are no longer an experimental feature. The Anonymisation
interface, which asks a participant for a passphrase and encrypts the
attributes you choose so that researchers can't read them, is now always
available when you add a stage in Architect. Architect's Experimental Features
page, where encrypted attributes had to be switched on for each protocol, has
been removed.

In interviews, an attribute marked as encrypted is now always encrypted.
Upgrading a protocol to schema 9 keeps each attribute working as it did: if a
protocol marked attributes as encrypted but had the experimental feature
switched off, the upgrade unmarks them, so they go on being collected without
encryption. Fresco and Interviewer carry each protocol's setting into the
upgrade when they update the protocols they already hold.

For hosts of `@codaco/interview`: `ProtocolPayload` no longer has
`experiments`, and the engine no longer reads it.
