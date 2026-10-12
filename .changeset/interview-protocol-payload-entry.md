---
'@codaco/interview': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

`@codaco/interview/protocol-payload` exports `currentProtocolToPayload` on its own. A host whose server code runs directly under Node, without a bundler, can import the converter from it without loading the rest of the interview contract.
