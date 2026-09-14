---
'@codaco/protocol-validation': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Say what is wrong with a damaged protocol file, and stop treating those files as app faults

A protocol archive whose compressed data will not inflate is now described as
damaged, rather than falling through to "could not open this protocol". The
message a researcher sees when a protocol refers to a file it does not contain
now names the resource as they named it, instead of the internal filename.

Opening a protocol that turns out to be damaged, incomplete, too large, or too
old to upgrade is an answer about that file, so Architect and Fresco no longer
record it as an application error. They record which kind of problem it was,
which also keeps researcher-authored resource names out of analytics entirely.

Fresco now reads archives through the shared reader, so the size limit that
protects against a maliciously compressed protocol applies to its imports too,
and its media is resolved against the manifest that shipped inside the archive.
Interviewer reads a pending protocol's name under the same limit.

`@codaco/protocol-validation` gains `createNetcanvasReader`, for hosts that
need to read `protocol.json` and the media separately under one shared limit,
and exports `getProtocolFileErrorKind` for classifying a failure without
formatting a message for it. `MalformedNetcanvasReason` gains `unreadable-entry`.
