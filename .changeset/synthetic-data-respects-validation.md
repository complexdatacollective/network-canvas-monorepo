---
'@codaco/protocol-utilities': minor
'@codaco/fresco-ui': patch
'@codaco/interview': patch
---

Synthetic interview data now respects the validation rules configured on your variables.

Previously, generated networks ignored the rules a protocol author sets in Architect, so previewing a protocol or bulk-generating interviews could produce data a participant could never have entered — names shorter than a required minimum length, numbers outside their permitted range, dates outside a date picker's window, duplicate values on a variable marked unique, or a "start date" later than the "end date" it is required to precede. Generated values now satisfy required, minimum/maximum length, minimum/maximum value, minimum/maximum selected, unique, same as, different from, and the greater/less than (or equal to) cross-variable comparisons, as well as the bounds a date picker or relative date picker imposes.

Where rules refer to one another, generation follows that order, so a variable compared against another is filled in after the variable it depends on.

If a protocol's rules cannot all be satisfied at once — for example a minimum length greater than its maximum length, a permitted range with no values in it, or a variable required to be both unique and drawn from fewer options than there are entities to fill — generation is now refused with a `SyntheticDataConstraintError` that names the variable and describes the conflict, instead of silently producing data that could never be collected. `SyntheticDataConstraintError` and the `ConstraintConflict` type it carries are exported from `@codaco/protocol-utilities`.

When skip logic and filtering are respected, controls on stages proven unreachable no longer create synthetic-data rendering conflicts with reachable Network Composer stages.

Read-only stage references no longer make validation rules apply to values written only by binning stages. Writers on stages proven unreachable by skip logic are likewise ignored consistently by both the feasibility check and the synthetic draw.

When multiple reachable Network Composer stages render one date variable at the
same resolution, generation now uses the intersection of their accepted
windows. It refuses only controls at incompatible resolutions or controls whose
windows do not overlap.

`@codaco/fresco-ui` adds a `./form/validation/helpers` export subpath so consumers can build the same validator stack the interview uses. `@codaco/interview` now fails loudly, naming the variable, when a protocol carries a validation rule of the wrong type, rather than passing it to a validator that would report a generic error.
