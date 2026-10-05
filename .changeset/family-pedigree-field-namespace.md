---
'@codaco/interview': patch
'@codaco/fresco-ui': minor
'@codaco/protocol-utilities': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
fresco: patch
---

Family Pedigree questions whose variable names match one of the interface's own
controls (such as `role`, `name`, `biologicalSex` or `gestationalCarrier`) no
longer replace that control or get read as family structure. Protocol answers
are now kept separate from the interface's controls and saved to the person as
expected. A protocol question stored in a variable called `name` is now asked
when a different variable is the person's label, and validation rules on the
label that compare it with another question use the participant's current
answer.

`@codaco/fresco-ui`: `formValueAliases` also accepts a path from the form root,
so a field inside a namespace can compare against a value outside it.

`@codaco/protocol-utilities`: synthetic networks for Family Pedigree stages
fill in a protocol `name` question the same way the interview now asks it.
