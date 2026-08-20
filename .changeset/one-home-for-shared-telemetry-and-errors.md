---
'@codaco/shared-consts': minor
'@codaco/protocol-validation': patch
'@codaco/interview': patch
'@codaco/interviewer': patch
'fresco': patch
---

Every product now describes an error the same way.

Every product carried its own copy of the code that turns an unexpected failure
into a readable error, and each of those copies could paste a whole stack trace
into the message shown to the user. All the copies have been replaced by one
shared implementation that does not, so an error raised while validating a
protocol, loading a roster, syncing an interview or importing a protocol now
reads as a plain sentence rather than a wall of technical detail.
