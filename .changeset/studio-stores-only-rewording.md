---
'@codaco/studio-api': patch
'@codaco/studio-sync': patch
'@codaco/studio-web': patch
---

A protocol in Studio now holds only the wording its author changed. A new
protocol holds none of Network Canvas's own wording, a stage is saved without
the wording that reads exactly as Network Canvas words it, and shared wording
put back to Network Canvas's is removed from the protocol's settings. The
stage editors still show Network Canvas's wording for everything a protocol
does not word itself, and the interview shows it to participants.
