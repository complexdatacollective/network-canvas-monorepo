---
'@codaco/protocol-utilities': major
---

`SyntheticInterview.setExperiments()` now takes schema 9's experiments, which
no longer include `encryptedVariables`: an attribute added with
`encrypted: true` is always encrypted by the interview. The interview payloads
it generates include `experiments` only once they have been set, instead of
`null`.
