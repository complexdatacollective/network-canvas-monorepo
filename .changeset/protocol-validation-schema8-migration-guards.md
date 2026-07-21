---
'@codaco/protocol-validation': patch
---

Migrating a protocol from schema 7 to schema 8 now repairs several legacy shapes that schema 8 would otherwise reject, so older protocols import cleanly instead of failing validation:

- External-data side panels no longer keep edge rules, which can never match on an external data source; these rules are stripped during migration.
- Filters with more than one rule but no join are backfilled to `OR`, matching the query runtime's default.
- Form fields bound to a non-renderable variable (a layout or location variable) are dropped, and any form left with no fields is removed.

Shape-to-variable mappings on node types are now recorded as variable references, so where-used reporting and dangling-reference validation account for them.
