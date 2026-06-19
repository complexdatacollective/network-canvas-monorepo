---
'@codaco/network-query': patch
---

Fix query-predicate schema-conformance bugs found in a release audit:

- Treat absent/undefined attributes the same as `null` for `EXISTS` / `NOT_EXISTS`.
- Guard numeric comparison operators against null and non-numeric values: datetime values are compared chronologically, and an unanswered value is no longer coerced to `0` (so `LESS_THAN` stops wrongly matching unanswered nodes).
- Evaluate `CONTAINS` / `DOES_NOT_CONTAIN` as literal substring tests rather than regular expressions, so filter values containing regex metacharacters match literally and never throw; an absent/null value never matches `CONTAINS` (and always matches `DOES_NOT_CONTAIN`).
