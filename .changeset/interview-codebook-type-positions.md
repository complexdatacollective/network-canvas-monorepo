---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Interview analytics no longer send codebook type keys, which a protocol author
chooses and can make readable. `node_added`, `edge_created`, `node_binned` and
`node_rebinned` now report the type's position in the codebook
(`node_type_index`, `edge_type_index`) in place of `node_type` and `edge_type`.
