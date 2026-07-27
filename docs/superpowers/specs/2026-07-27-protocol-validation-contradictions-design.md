# Making contradictory validation rules unexpressible

Date: 2026-07-27
Status: Approved design, not yet implemented

## Problem

A researcher can author validation rules in Architect that no participant can
ever satisfy: `minValue: 10` with `maxValue: 2`, `sameAs` and `differentFrom`
naming the same target, a strict comparator cycle, a DatePicker whose `min`
falls after its `max`. Nothing objects — not the Architect editor, not
`@codaco/protocol-validation`. The failure surfaces later as a form a
participant cannot submit.

The synthetic-data conformance project
(`docs/superpowers/specs/2026-07-27-synthetic-data-validation-conformance-design.md`)
detects these contradictions at generation time and throws a
`SyntheticDataConstraintError`. This project stops them being authored at all,
so that throw becomes a defensive invariant rather than something researchers
hit.

## Relationship to the companion project

Independent, based on `main`. The companion work (branch
`claude/synthetic-data-validation-2b18a2`, unmerged) shares only semantics with
this project, not code: its satisfiability rules — comparator canonicalisation,
`sameAs` union-find groups, strict-edge cycle detection — are reimplemented
here inside `@codaco/protocol-validation`, which cannot depend on
`@codaco/protocol-utilities`. Its feasibility analyser is kept unchanged as the
generation-time backstop; it also covers the runtime-only `unique` case this
project cannot decide statically.

## Decisions

| Decision                             | Choice                                                                              | Why                                                                                                                                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure                            | One shared analyser module in protocol-validation, consumed by schema and Architect | The graph semantics are subtle; implementing them twice invites silent drift — exactly the duplicated-map problem this project exists to close                                                                                  |
| Protocols already at schemaVersion 8 | Accept the gap (`rejectEgoUnique` precedent)                                        | The migration chain short-circuits at same-version, so already-v8 files carrying contradictions hard-fail validation. The real-protocol corpus is the empirical check; any failure gets the standing case-by-case investigation |
| Migration repair policy              | Minimal strip, keep local bounds                                                    | Deterministic and never invents intent — a swapped bound or clamped count would enshrine a typo as a live rule participants must satisfy                                                                                        |
| Architect editor UX                  | Hybrid: filter reference pickers, inline-validate numeric rules                     | Filtering is self-explanatory for target pickers; numbers must be typeable transiently, so they get an inline error and a blocked row save                                                                                      |
| `unique` on small value spaces       | Non-blocking Architect hint, boolean/ordinal only                                   | Satisfiability depends on entity counts, a runtime property; the schema cannot decide it and thresholds for other types are arbitrary                                                                                           |
| DatePicker parameters                | Full tightening: ISO validity, exact resolution, `min ≤ max`                        | The fields are unconstrained strings today; revisiting the schema twice for adjacent hazards is worse than one coherent refinement                                                                                              |
| `minNodes` without `maxNodes`        | Out of scope                                                                        | "At least N alters, no cap" is a legitimate study design, and the both-present pair check plus its migration already exist                                                                                                      |

## The contradiction catalogue

References (`sameAs`, `differentFrom`, and the four comparators) always name a
variable id within the owning entity's `variables` record, so every
cross-variable check is local to one entity.

### Rejected — single-variable

1. `minLength > maxLength` (text)
2. `minValue > maxValue` (number)
3. `minSelected > maxSelected` (categorical)
4. `minSelected > options.length` (categorical)
5. DatePicker `parameters.min`/`max`: not a real calendar date, not written
   exactly at the picker's resolution (`yyyy`, `yyyy-MM`, `yyyy-MM-dd` per
   `parameters.type`, which defaults to `full`), or `min > max`
6. **R1 — absolute floors**: `minLength ≥ 0`, `maxLength ≥ 1`,
   `minSelected ≥ 0`, `maxSelected ≥ 1`. `maxLength: 0` plus `required` is a
   contradiction of exactly the class this project removes. `minValue`/
   `maxValue` are untouched — negative numbers are a legitimate domain

### Rejected — cross-variable

7. `sameAs` and `differentFrom` naming the same target
8. Any comparator cycle containing at least one strict edge, after
   canonicalising all four comparators into deduped `{lower, upper, strict}`
   edges. `A > B` plus `B < A` collapse to one edge — one constraint stated
   from both sides, not a cycle. `A > B` plus `A < B` is a strict two-cycle
   and rejected
9. Within a `sameAs` group (union-find over `sameAs`; chains and cycles of
   `sameAs` collapse into one group holding one value): any strict comparator
   between members, or any `differentFrom` between members. Self-references
   are the group-of-one case and fall out for free
10. Single-edge bound disjointness: for each comparator edge, using each
    side's own bounds (number `[minValue, maxValue]`; text length range;
    categorical selection range; datetime from DatePicker's absolute window;
    for a `sameAs` group, the intersection of member bounds), reject when the
    upper side's maximum cannot exceed (strict) or reach (non-strict) the
    lower side's minimum. Also a `sameAs` group whose members' bounds have an
    empty intersection. Deliberately not a transitive interval solver — one
    edge at a time; the cycle rule covers the structural cases.
    RelativeDatePicker windows are anchored to the interview date and
    contribute no static bounds
11. **R2 — reference target type must equal the source variable's type**, for
    all six reference rules. Architect's picker already offers only same-typed
    variables; this makes the schema agree with the only authorable shape.
    The existing existence and `requireType` checks in the reference pass are
    unchanged

### Explicitly accepted — guarded by tests so they stay expressible

- The same constraint stated from both sides (`end greaterThan start` with
  `start lessThan end`)
- Mutual `differentFrom` — symmetric, one constraint
- Mutual non-strict comparators (`a ≥ b` and `b ≥ a`) — forces equality
- A strict comparator alongside a redundant `differentFrom`
- `sameAs` chains and cycles — every member shares one value
- A bare `minNodes` floor with no `maxNodes`
- `unique` anywhere the per-type mask allows it

## Design

### The analyser

`packages/protocol-validation/src/schemas/8/variables/validation-contradictions.ts`
exports `findValidationContradictions(variables)`: input one entity's variables
record, output a list of structured contradictions
`{ class, variableIds, rules, message, path }`. `path` is record-relative
(`[variableId, 'validation', ruleKey]`), anchored at the dependent rule;
`message` is a human sentence naming variable names, matching the house style
of existing refinement messages. The module is pure and covers classes 1–4 and
7–10. It is exported from the package entry point for Architect.

Internals: comparator canonicalisation into deduped `{lower, upper, strict}`
edges; union-find over `sameAs`; depth-first cycle detection reporting only
cycles containing a strict edge; per-type interval models with intersection
for `sameAs` groups.

### Schema wiring

- `VariablesSchema`, `EdgeVariablesSchema` and `EgoVariablesSchema` each gain a
  thin `.superRefine` adapter — the `rejectEgoUnique` slot — that calls the
  analyser and emits one issue per contradiction. Classes 1–4 live only here,
  not duplicated on individual variable schemas: one home, and the record
  level is the only path real protocols take.
- R1 floors go directly on the fields in
  `packages/protocol-validation/src/schemas/8/variables/validation.ts` as
  `.min(0)`/`.min(1)`.
- R2 extends `validateEntityAttributeReferences`
  (`packages/protocol-validation/src/utils/`), which already checks target
  existence and `requireType`, with source-type equality for the six
  validation reference rules.
- Class 5 is a self-contained `.superRefine` on the DatePicker parameters
  object in
  `packages/protocol-validation/src/schemas/8/variables/variable.ts`,
  mirroring the existing RelativeDatePicker refinement in the same file.

### Migration

New steps edited into the existing v7→v8 migration
(`packages/protocol-validation/src/schemas/8/migration.ts`), per house
precedent. They run after the current repair steps (scalar-bounds strip,
min-implies-required backfill) so they analyse the post-repair state, and they
reuse the analyser to find what to strip. Each new strip behaviour is
described in the migration's user-facing `notes` (a static description of
what the migration does, surfaced by `getMigrationInfo`).

| Contradiction                                | Migration action                                              |
| -------------------------------------------- | ------------------------------------------------------------- |
| Inverted local pair (classes 1–3)            | Strip both members of the pair                                |
| `minSelected > options.length`               | Strip `minSelected` — the options are data, the rule is wrong |
| Below an R1 floor                            | Strip the offending rule                                      |
| `sameAs` + `differentFrom`, same target      | Strip both rules                                              |
| Strict-edge comparator cycle                 | Strip the comparator rules forming the cycle; keep bounds     |
| Strict comparator within a `sameAs` group    | Strip the comparator, keep `sameAs`                           |
| `differentFrom` within a `sameAs` group      | Strip the `differentFrom`, keep `sameAs`                      |
| `sameAs` group with disjoint member bounds   | Strip all `sameAs` rules in that group, keep bounds           |
| Comparator edge with disjoint bounds         | Strip that comparator, keep bounds                            |
| Cross-type reference (R2)                    | Strip the reference rule                                      |
| DatePicker value finer than the resolution   | Truncate to the resolution — intent-preserving                |
| DatePicker value coarser than the resolution | Strip the value — the missing precision cannot be invented    |
| DatePicker value unparseable                 | Strip the value                                               |
| DatePicker `min > max` after truncation      | Strip both                                                    |

Bundled protocols in `@codaco/protocols` are already v8; if any carries a
contradiction, its source is fixed in-repo as part of this change.

### Architect editor

Architect imports `findValidationContradictions` plus a thin prospective
helper — "would this draft rule (or rule map) contradict?" — that runs the
analyser over the whole prospective variables record: the existing variables
with the edited variable's draft substituted. Whole-record evaluation catches
contradictions whose offending rule lives on a different variable, such as
editing `B.maxValue` into disjointness with an existing `A lessThanVariable B`.

Four touch points, all in or around
`apps/architect/src/components/Validations/`:

1. **Row-level gating** (`Validation.tsx`). The draft save gate
   (`isDraftComplete`) also rejects a contradictory draft, and renders an
   inline message in the row explaining why — unlike today's silent disable.
   Primary UX for the numeric classes.
2. **Picker filtering** (`Validation.tsx`, `ValidationSection.tsx`).
   Reference-target candidates that would create a contradiction are excluded.
   A reference rule with zero legal targets left is disabled in the rule-type
   dropdown, like an already-used key. Candidates are already same-type and
   never self; R2 backstops that.
3. **Dialog-level form validate.** Contradictions can be introduced outside
   the Validations section — deleting an option in the field-editor dialog can
   push `minSelected` past `options.length`. The dialog
   (`DialogArrayField`/`DialogEditor`) gains a `validate` pass-through
   (precedent: `validateEntityType` at `EntityTypeDialog`) running the
   analyser, blocking Save with a located message. Every form that can alter a
   variable's options or validation gets the same check; the implementation
   plan enumerates the mount points.
4. **`unique` hint.** A non-blocking informational note on the rule row when
   `unique` sits on a boolean or ordinal variable, naming the variable's
   possible-value count. No effect on save.

The DatePicker parameters editor already validates ISO format and `min < max`;
the plan verifies it fully mirrors the new schema check (resolution match) so
the backstop never fires from that editor. `MinMaxAlterLimits` needs nothing.
The "Misconfigured Protocol" modal remains the last-resort backstop only and
should be unreachable from the editor.

## Testing

- **Analyser unit tests** in `packages/protocol-validation`: one accept and
  one reject case per catalogue class, including every "explicitly accepted"
  shape above.
- **Conformance tests** following the existing
  `src/schemas/8/__tests__/variables-conformance.test.ts` style: record-level
  schema parses per class, plus DatePicker, R1 and R2 cases.
- **Migration tests** per strip row: hand-written v7 input, migrate, parse the
  result with `ProtocolSchemaV8`, assert the strip and a negative control that
  untargeted rules survive.
- **Corpus**: the credentialed ~90-protocol `validate-test-protocols` suite
  and the local all-interfaces fixture run before merge. A real-protocol
  failure triggers the standing case-by-case investigation, not a dropped
  refinement.
- **Architect**: unit tests for the prospective helper and picker filtering;
  an e2e pass (`running-architect-e2e-tests` skill) exercising the editor —
  blocked row save on an inverted pair, excluded picker targets, the `unique`
  hint.
- `pnpm knip` runs since protocol-validation grows an export.

## Consequences

- **Already-v8 protocols carrying a contradiction fail validation with no
  repair path** — the accepted gap. They were producing unsubmittable forms
  anyway; the corpus run bounds the real-world blast radius before merge.
- **Interviewer and Fresco inherit the tightening** on their next
  protocol-validation upgrade; the changeset calls out the behaviour change.
- **Migrated v7 protocols can lose rules.** Every strip weakens validation
  rather than breaking data, is deterministic, and is listed in the
  migration's user-facing notes.
- **The companion feasibility analyser is unchanged.** Its contradiction
  checks become defensive invariants; its `unique`-exhaustion check remains
  the only guard for that runtime-dependent case.

## Release

Two changesets in separate lanes: `@codaco/protocol-validation` **minor**
(schema tightening + migration), `@codaco/architect` **patch** (editor
guards).
