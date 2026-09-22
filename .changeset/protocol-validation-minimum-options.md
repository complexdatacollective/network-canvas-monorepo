---
'@codaco/protocol-validation': minor
---

`MINIMUM_VARIABLE_OPTIONS` is now exported: the fewest options a categorical or
ordinal variable may hold, which the variable schema itself enforces. Editors
that refuse a list with too few values can read it instead of repeating it.
