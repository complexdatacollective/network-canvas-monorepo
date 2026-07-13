---
'@codaco/protocol-validation': minor
'@codaco/network-query': minor
'@codaco/protocol-utilities': minor
'@codaco/interview': minor
'@codaco/fresco-ui': patch
'@codaco/sample-protocol': patch
---

Add forward skip destinations to schema 8, shared skip evaluation, synthetic
network generation, and the interview runtime. Hidden stages can now continue
at a later stage or route to the interview finish screen, with live route
recalculation, safe Back navigation, and confirmed one-screen overrides for
unavailable stages.

Also keep shared Select fields correctly labelled and contained when option
labels are long. The bundled sample protocol now ends the interview when a
participant declines consent.
