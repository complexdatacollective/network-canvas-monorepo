---
'@codaco/sample-protocol': patch
'@codaco/development-protocol': patch
---

Bring the bundled protocols into conformance with the current schema 8 so they open in Architect without a "Protocol Validation Failed" dialog. These protocols are tagged schema version 8, so the open path skips migration and stale legacy keys are never stripped.

- Sample Protocol: removed `size` from Information **text** items (schema 8 only allows `size` on asset items).
- Development Protocol: removed `size` from text items, dropped the no-longer-supported `form.title` on the ego/alter/alter-edge forms, removed the unused `loop` flag on the `withSound` asset, dropped the `highlight` block from the Sociogram prompt that also created edges (the two are mutually exclusive), and renamed the venue node type's `name_variable` to `venue_name_variable` so variable record keys are unique across entity types.
