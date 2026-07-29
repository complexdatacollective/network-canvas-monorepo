# Attribute-writer exclusivity (validated vs unvalidated writers)

Date: 2026-07-27
Status: Approved design, not yet implemented

## Problem

Validation rules are a form-field mechanism: the interview applies them through
`useProtocolForm`, which renders `Field` components. Several interfaces write
attribute values without any `Field` at all — OrdinalBin and CategoricalBin
write their prompt variable via a bare `updateNode` dispatch, the Sociogram
highlight toggle flips a boolean on tap, TieStrengthCensus writes its edge
variable from prompt options, and the census/pedigree nomination prompts write
directly. A validation rule configured on such a variable is never enforced by
that writer.

That is harmless until the same variable is _also_ rendered in a form, at which
point the form validates values an unvalidated writer set. Measured on a
protocol where two variables sit in both a name generator's form and a
following bin stage: 57 of 80 generated nodes fail validation, versus 0 of 80
with the form alone — 45 failing `minSelected: 2` and 24 failing
`differentFrom`.

A second, related defect: CategoricalBin's `otherVariable` _is_ rendered in a
`Field`, but that field hard-codes `required` and never receives the codebook
variable's validation — a form-rendered yet unvalidated writer.

## Decisions

| Decision        | Choice                                                                                                          | Why                                                                                                                                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rule            | A variable may not be referenced by both a **validatedAttribute** writer and an **unvalidatedAttribute** writer | The mechanism, not the UI context, is what makes dual use incoherent                                                                                                                                                                                             |
| Classification  | Declarative `usage` tags on `entityAttributeReference` descriptors at writer sites, static in the schema source | Variable moves reclassify automatically (the collector walks the protocol against the schema); only a new stage schema ever writes a tag, which forces the classification decision at exactly the right moment. A hand-maintained path list would silently drift |
| Tag scope       | Every attribute-writing site in schema 8, this project                                                          | The taxonomy names the hazard generally; bins are just the measured instance. Read-only references stay untagged and outside the rule                                                                                                                            |
| Enforcement     | Architect editor gates + a non-destructive protocol-wide alert. **No schema rejection, no export block**        | A hard rejection cannot be paired with a repairing migration — stripping either side destroys research design (the form field loses data collection; the stage loses an interview step). Pre-existing conflicts must be researcher-resolved                      |
| `otherVariable` | Redesigned into a proper validated writer (see below), classified `validatedAttribute`                          | Fixes the form-rendered-yet-unvalidated defect at its root instead of fencing it off                                                                                                                                                                             |
| Sequencing      | Branch from `main` after PR #1107 (validation contradictions) merges                                            | Reuses its editor machinery: `makeFieldEditorValidate`, the save-gate `_error` patterns, the behaviour-test harness                                                                                                                                              |

### The `otherVariable` redesign

- The interview's other-input `Field` (CategoricalBin) drops its hard-coded
  `required` and builds validation from the codebook variable's `validation`
  block through the same field-metadata path forms use. **No runtime
  fallback**: a variable with no rules is genuinely optional. This is a
  behaviour change for already-v8 protocols whose `otherVariable` has no
  `required` rule.
- Architect seeds `validation: { required: true }` on **newly created**
  other-variables (the eager no-dialog creation path).
- The v7→v8 migration sets `validation.required = true` on every variable
  referenced by a CategoricalBin `otherVariable` unless it is already `true` —
  covering both an absent rule and an explicit `required: false`, which was
  inert under the v7 runtime's hard-coded requirement. This preserves the
  effective behaviour of migrated protocols.

## The taxonomy

`usage?: 'validatedAttribute' | 'unvalidatedAttribute'` on
`entityAttributeReference` descriptors. Tags are **static schema metadata on
the reference site** — never stored in protocols, never migrated, never
updated when a variable changes roles. `collectEntityAttributeReferences`
hits inherit the tag from the schema site that matched, so a v7 protocol
migrated to v8 classifies identically to a native v8 one.

**validatedAttribute** — writers that apply codebook validation:

| Site                                       | Path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FormFieldSchema.variable`                 | `stages[].form.fields[].variable` (EgoForm, AlterForm, AlterEdgeForm, NameGenerator) and `stages[].nodeConfig.form[].variable` (FamilyPedigree)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ComposerFormFieldSchema.variable`         | `stages[].nodeForm.fields[].variable`, `stages[].edges[].form.fields[].variable` (NetworkComposer)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `NameGeneratorQuickAdd.quickAdd`           | `stages[].quickAdd` — validated **after this project's redesign**: today `QuickNodeForm` passes hard-coded `required` + `minLength: 1` and ignores codebook rules; the rewire threads the codebook variable's validation through the same field-metadata path, exactly like the `otherVariable` redesign. The migration sets `required: true` on quickAdd targets unless already `true`, and Architect seeds `required: true` on newly created quickAdd variables. (NetworkComposer's `quickAdd` was rewired the same way during implementation — its `AddNodeInput` now applies codebook validation rather than dispatching a bare `addNode` — so it is tagged `validatedAttribute` too.) |
| `categoricalBinPromptSchema.otherVariable` | `stages[].prompts[].otherVariable` — validated after the redesign above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**unvalidatedAttribute** — writers that bypass validation (the definitive
sweep, every site traced to its interview dispatch): OrdinalBin and
CategoricalBin `prompts[].variable`; NameGenerator-family
`prompts[].additionalAttributes[].variable` (reducer-applied boolean flags);
Sociogram `prompts[].highlight.variable` (tap toggle) and
`prompts[].layout.layoutVariable` (drag positions); TieStrengthCensus
`prompts[].edgeVariable` (closed option domain, but no rules honoured);
Geospatial `prompts[].variable`; FamilyPedigree
`nominationPrompts[].variable` (toggle) and all eight
`nodeConfig`/`edgeConfig` variables (wizard/transform writes); NetworkComposer
`quickAdd` and `layoutVariable`.

**Read-only (untagged for usage, outside the rule)**: Narrative preset
`layoutVariable`/`groupVariable`/`highlight[]`, NarrativePedigree
`diseases[].variable` (its write is FamilyPedigree's nomination toggle), the
six validation reference rules, shape-mapping variables, filter-rule
attributes, and the untagged sort keys. DyadCensus and OneToManyDyadCensus
create edges only and write no attributes.

**Untagged by decision, despite writing**: NetworkComposer
`convexHullVariable`. This slot does persist attribute values — the Groups
tool and lasso bulk-add write group membership directly
(`toggleGroupMembership`/`addGroupMembership` → `updateNode`, no codebook
rules applied) — but it is deliberately left untagged so grouping/display use
never restricts a variable's use elsewhere, extending to it the authoring
freedom Narrative's `groupVariable`/`highlight` presets get (commit
`9e5365c63`; `32dad0950` removed the matching Architect picker exclusion and
save-time gate). Accepted trade-off: a variable used both as a validated
composer form field and as `convexHullVariable` can acquire membership values
the form's rules would reject (e.g. a `maxSelected: 1` categorical gaining a
second value), and `findVariableRoleConflicts` will not report the pairing.

Two collector facts the implementation must handle: the FamilyPedigree and
NarrativePedigree stages declare no top-level `subject`, so their hits carry
`subject: undefined` — the conflict finder derives the entity/type from the
stage's own `nodeConfig`/`edgeConfig` instead of skipping them; and the
narrowed duplicate tag declarations in `common/prompts.ts` (highlight,
CategoricalBin variable/otherVariable) must carry identical `usage` values to
their base declarations or the collector's union-merge de-dupe produces
spurious double hits.

**The rule**: no `(subject entity, subject type, variable id)` may have hits
in both classes. Same-class sharing remains legal — two bins may share a
variable (neither validates), and two form fields may share one (both apply
the same rules).

NameGeneratorRoster is outside the rule (no form; its card/sort options are
untagged display references).

## Design

### protocol-validation

- `entity-attribute-reference.ts`: descriptor type gains the optional `usage`
  field; `EntityAttributeReferenceHit` gains `usage?`, copied through in the
  collector's string case. Additive; existing consumers unaffected.
- Writer sites tagged per the taxonomy table.
- New export `findVariableRoleConflicts(protocol)`: pure; runs the collector,
  groups usage-tagged hits by `(subject entity, subject type, variable id)`,
  returns each both-class group as a structured conflict — variable id and
  name (resolved from the codebook), subject, and per-hit
  `{ path, usage, stageIndex }` so Architect can render stage names and jump
  links. **Not wired into the Zod schema.**
- Migration (v7→v8, edited in place per precedent): the `otherVariable`
  `required` backfill, with a notes line. Deliberately no migration for role
  conflicts themselves.

### interview (CategoricalBin + NameGenerator QuickAdd)

Two rewires of the same class, replacing hard-coded validation with the
codebook variable's rules via the forms field-metadata path
(`selectFieldMetadataFromVariables` → validation props): the CategoricalBin
other-input `Field`, and `QuickNodeForm`'s quick-add field (dropping its
hard-coded `required` + `minLength: 1`). No runtime fallbacks in either case.
Both are interface changes: implementation runs the
`verifying-an-interface-change` matrix (e2e configuration matrix, ARIA
snapshots, Chromatic) for CategoricalBin and NameGenerator, and updates their
stories. The migration's `required` backfill covers both target sets
(otherVariable targets and quickAdd targets) with the same
unless-already-`true` semantics.

### Architect

- A memoised selector derives a role map from the working protocol document
  via the collector (`variableId → { validated: hits, unvalidated: hits }`).
- **Picker filtering** consumes it class-wise, both directions by
  construction: `withFieldsHandlers` (covers the Form, NetworkComposer, and
  FamilyPedigree field pickers) excludes variables with any unvalidated hit;
  `withVariableOptions` (both bins) and the other unvalidated-writer pickers
  (Sociogram highlight, TieStrengthCensus edge variable, census/pedigree
  nomination editors — enumerated in the plan) exclude variables with any
  validated hit. The currently-selected variable always stays offered.
- **Save-time gates** cover the editing stage's own unsaved draft:
  `withPromptChangeHandler` (bins) and `makeFieldEditorValidate` (all form
  surfaces) reject cross-class picks with the established `_error`/field-error
  shapes, with equivalents at the other writer editors' save hooks.
  Cross-class collisions are always cross-stage (no stage type carries both a
  validated and an unvalidated writer for one picker), so the saved document
  plus these gates is a complete classification source.
- **Protocol-wide alert** for pre-existing conflicts: `selectors/issues.ts`
  gains `getVariableRoleConflicts` (wrapping the shared finder); a
  non-destructive `Alert` on the timeline page (beside
  `TestingMapboxTokenAlert`) lists each conflict — variable name, its
  validated usage with stage names, its unvalidated usage with stage names —
  with resolution guidance; `ProjectNav`'s `tabWarnings` badges the Stages
  tab. Nothing blocks opening, editing, or exporting.

## Testing

- Finder unit tests: both-class conflict detected; same-class sharing
  accepted; untagged reads ignored; hit roles/paths/stage indices correct.
- Migration backfill test with negative control: variables not referenced by
  an `otherVariable` are untouched; an absent rule and an explicit
  `required: false` both become `true`; other validation rules on the target
  survive unchanged.
- Interview: CategoricalBin other-input applies each configured rule;
  rule-less variable is optional; interface-change matrix per the skill.
- Architect: role-map selector and both picker exclusions unit-tested;
  behaviour tests (the #1107 harness) for one gate per direction; one e2e
  spec — a form-used variable absent from a bin picker, and a seeded conflict
  fixture rendering the alert with both stage names.
- Bundled protocols must ship conflict-free (assertion). The credentialed
  corpus run is a **report, not a gate** — pre-existing conflicts in the wild
  are exactly what the alert exists to surface; the report tells us how many
  researchers will see it.

## Consequences

- Dual-use protocols remain openable, editable, and exportable everywhere;
  Architect surfaces the conflict non-destructively until the researcher
  resolves it. Interviewer and Fresco behaviour is unchanged by the rule
  (no schema change).
- The `otherVariable` redesign changes interview behaviour: configured rules
  are now enforced at the other-input, and a rule-less `otherVariable` in an
  already-v8 protocol becomes optional where it was previously force-required.
  Migrated protocols keep their effective behaviour via the backfill.
- `@codaco/protocol-validation` minor (descriptor field, finder, migration),
  `@codaco/interview` minor (other-input behaviour), `@codaco/architect`
  patch (pickers, gates, alert) — three changesets, separate lanes.

## Relationship to PR #1107

Builds directly on its machinery (`makeFieldEditorValidate`, the save-gate
error shapes, the behaviour-test harness, the shared-analyser architecture)
and follows the same layering philosophy — with the deliberate difference
that this rule stops at the editor + alert layer because no automatic repair
exists that does not destroy research design.
