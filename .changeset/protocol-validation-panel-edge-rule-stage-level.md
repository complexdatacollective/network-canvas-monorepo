---
'@codaco/protocol-validation': patch
---

"External-data panel filters cannot use edge rules" is now stated by the stage schema instead of the whole-protocol one, so a host validating a single stage — a stage editor checking the stage it is saving — refuses the panel at that moment rather than letting it through until the whole protocol is validated. `stageSchema` reports it at the stage-relative path `panels.<i>.filter.rules.<j>.type`. The message and the protocol-level path `stages.<n>.panels.<i>.filter.rules.<j>.type` are unchanged, as is which panels the rule refuses: only one reading an imported file, never one reading the interview network itself.
