---
'@codaco/network-query': patch
---

Fix query-predicate schema-conformance bugs found in a release audit:

- Treat absent/undefined attributes the same as `null` for `EXISTS` / `NOT_EXISTS`.
- Guard numeric comparison operators against null and non-numeric values: datetime values are compared chronologically, and an unanswered value is no longer coerced to `0` (so `LESS_THAN` stops wrongly matching unanswered nodes).
- Treat an invalid `CONTAINS` / `DOES_NOT_CONTAIN` regular expression as a non-match instead of throwing (the operators remain regular-expression matches, matching the architect rule editor's regex value input).
