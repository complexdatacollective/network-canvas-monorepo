---
'@codaco/protocol-validation': minor
---

Attribute-writing schema references are now classified by whether the interview applies the variable's validation rules when writing (`validatedAttribute`) or writes directly without them (`unvalidatedAttribute`). This includes Network Composer group and lasso membership changes through `convexHullVariable`, which write values without field validation. A new `findVariableRoleConflicts` export (with `collectVariableRoleHits`) reports any variable written by both classes for the same subject, so editors can surface the conflict. The v7→v8 migration now marks every variable referenced as a CategoricalBin `otherVariable` or NameGenerator `quickAdd` target as `required`, preserving the effective behaviour of migrated protocols now that those inputs honour configured validation instead of a hard-coded requirement.
