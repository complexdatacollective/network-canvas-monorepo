---
'@codaco/interview': patch
'@codaco/fresco-ui': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
fresco: patch
---

Family Pedigree questions whose variable names match one of the interface's own
controls (such as `role`, `biologicalSex` or `gestationalCarrier`) no longer
replace that control or get read as family structure. Protocol answers are now
kept separate from the interface's controls and saved to the person as
expected, and validation rules on the person's name that compare it with
another question use the participant's current answer.

`@codaco/fresco-ui`: `formValueAliases` also accepts a path from the form root,
so a field inside a namespace can compare against a value outside it.
