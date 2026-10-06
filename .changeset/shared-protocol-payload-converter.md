---
'@codaco/interview': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

`@codaco/interview/contract` now exports `currentProtocolToPayload`, which turns a validated protocol into the payload the interview runtime receives. The caller supplies the payload's `id` and `importedAt`, so a host can give the same protocol the same identity every time it loads it.

Architect's preview uses it, so preview assets now carry their display name and source filename the same way they do in Interviewer. An audio or video item with no description is announced by its display name instead of its filename.
