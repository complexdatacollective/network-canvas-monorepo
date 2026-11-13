---
'@codaco/protocol-validation': minor
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': patch
---

Protocols can carry a node label worker again: a short script that decides the label shown on each node during an interview, using the node's attributes and the rest of the network. In Architect, add or edit it from the Codebook page, where a preview shows the labels it gives to sample nodes and a script that cannot be loaded is not saved. Interviewer and Architect's preview run the script; a node whose label is encrypted, and any node the script fails for, keeps its standard label. The script runs in an isolated JavaScript engine with no access to the internet, storage or the page, and is stopped if it runs too long. Fresco accepts protocols that have a script but does not run it yet. In `@codaco/protocol-validation`, schema 9 gains an optional `nodeLabelWorker` string, which is part of the protocol hash when present. `@codaco/interview` adds the `@codaco/interview/node-label-worker` entry point (`createNodeLabelEvaluator`) for running a script outside an interview.
