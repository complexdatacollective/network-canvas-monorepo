---
'@codaco/interview': prerelease
---

Fill in deferred analytics events:

- Sociogram: `simulation_started` and `simulation_finished` now fire from `useForceSimulation`'s worker lifecycle (first tick → started; `end` → finished, with `duration_ms`, `node_count`, `edge_count`).
- NameGeneratorRoster: `roster_filter_changed` (debounced; `has_filter` boolean) wired through Collection's `onFilterChange`.
- Geospatial: `geospatial_search_performed` fires from inside `useGeospatialSearch`'s debounced query callback.
- Narrative: `narrative_preset_updated` now also fires for `changed: 'group'` and `changed: 'edge_type'` (previously only `'highlight'`).
- FamilyPedigree: `pedigree_wizard_abandoned` fires when the wizard dialog closes without producing a `batch` result.
- Form family: `form_dismissed_without_save` fires on the discard-changes confirm path in both SlidesForm (AlterForm/AlterEdgeForm/SlidesForm) and EgoForm. `form_validation_failed` now includes `field_errors: Array<{ field_index, component, message }>` (engine validation messages — may include codebook variable references on the `differentFrom`/`sameAs` rules; that leak is acceptable per spec).
- Stage validation: `stage_validation_failed` fires from `useStageValidation` when a constraint blocks navigation, with structural `validation_kind` per constraint and `direction`.
