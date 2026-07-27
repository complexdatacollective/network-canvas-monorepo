# Synthetic data validation conformance

Date: 2026-07-27
Status: Approved design, not yet implemented

## Problem

`generateNetwork` produces synthetic interview data for Interviewer's bulk
session generator, Architect's preview host, and Fresco. The data it produces
routinely violates the validation rules a researcher configured on the
variables it fills.

Take an ego form with two text variables, `A` and `B`. Both are `required`,
both have `minLength: 24` and `maxLength: 24`, and `B` additionally declares
`sameAs: A`. Every synthetic session generated for that protocol produces two
unrelated first names of the wrong length. Opening such a session in Interviewer
lands on a form that cannot be submitted, and Architect's preview shows the
same. The data is unusable for exactly the purpose it exists to serve: seeing
what the interview does with realistic input.

### Mechanism

`ValueGenerator.generateForVariable()`
(`packages/protocol-utilities/src/ValueGenerator.ts`) switches on
`variable.type` and reads nothing else. `toVariableEntry()`
(`packages/protocol-utilities/src/generateNetwork/attributes.ts`) already copies
`validation` onto the entry it passes in — the rules are plumbed the whole way
and then dropped on the floor.

Three structural obstacles sit behind that, in increasing order of cost:

1. **Single-variable rules** (`required`, `minLength`/`maxLength`,
   `minValue`/`maxValue`, `minSelected`/`maxSelected`) only need the generator to
   read the descriptor it is already handed.
2. **Cross-variable rules** (`sameAs`, `differentFrom`, and the four
   `…ThanVariable` comparators) are impossible in the current shape.
   `generateAttributes` loops over variables independently, so variable `B` has
   no way to see the value chosen for `A`.
3. **`unique`** is cross-_entity_. Satisfying it requires a registry of already-
   issued values per (entity type, variable), threaded through the whole run.

### A second constraint source

`useProtocolForm` (`packages/interview/src/forms/useProtocolForm.tsx`) also
synthesises hard `min`/`max` validators from component **parameters**, not just
from `validation`:

- `DatePicker` forwards `parameters.min` and `parameters.max` onto the field.
- `RelativeDatePicker` pre-computes absolute `min`/`max` from
  `parameters.anchor`/`before`/`after`, defaulting to `today`, 180 and 0.

Today every `datetime` is `faker.date.past().toISOString()`, so a
RelativeDatePicker with default parameters is violated by almost every generated
value. These bounds are in scope: they are enforced identically to validation
rules at runtime, so a fix that ignores them still leaves forms unsubmittable.

## Scope

**In scope.** All thirteen rules in `ValidationsSchema`
(`packages/protocol-validation/src/schemas/8/variables/validation.ts`), plus the
`min`/`max` bounds derived from `DatePicker` and `RelativeDatePicker`
parameters. Applies to ego, node and edge attributes, wherever
`generateNetwork` writes them.

**Out of scope — separate project.** Preventing contradictory validation from
being authored at all: schema-level refinements in `@codaco/protocol-validation`
(with migrations), and matching guards in the Architect editor. That work is
tracked separately; see "Follow-up project" below. This spec assumes
contradictions remain expressible and must be detected at generation time.

**Out of scope.** The `Anonymisation` stage's `validation.minLength`/`maxLength`,
which constrain a passphrase the participant types rather than any generated
attribute.

## Decisions

| Decision                  | Choice                                                        | Why                                                                                                                                |
| ------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Which constraints         | All rules, plus component parameter bounds                    | A partial fix still leaves preview and synthetic sessions stuck on a failing form                                                  |
| Unsatisfiable protocols   | Throw                                                         | Silently emitting broken data is what this spec exists to stop; the protocol is genuinely uncompletable by a human participant too |
| When to detect            | Up-front feasibility pass                                     | A protocol must either always throw or never throw — not fail on bulk-generate session 47 and pass on 46                           |
| Where the logic lives     | `@codaco/protocol-utilities`, values derived from rules       | No change to the participant-facing validation path; no UI dependency in the generator                                             |
| How conformance is proven | Seam test in `packages/interview` against the real validators | Both packages are already dependencies there, so it needs no new dependency edges                                                  |

### Approaches considered and rejected

**Extract shared constraint semantics.** Move the pure predicates into
`protocol-validation`, have `fresco-ui`'s zod validators delegate to them, and
have the generator read the same descriptors. Rejected: it edits the live
interview validation path — a heavily-tested surface where a subtle behaviour
change is a participant-facing bug — for a mostly theoretical benefit. Knowing
how to _check_ `sameAs` does not tell you how to _produce_ a value satisfying
it; the derivation still has to be written separately.

**Generate as today, then repair.** Keep type-driven generation and add a
validate-and-mutate loop using the real validators. Rejected: it makes
`fresco-ui` a _runtime_ dependency of `protocol-utilities`, dragging a React UI
package into Interviewer's bulk-generate path and Architect's preview. Random
mutation also cannot satisfy `sameAs` or `greaterThanVariable` — those must be
derived — so the derivation gets written anyway, behind a retry loop that can
spin.

## What bounds the problem

The variable schema already restricts which rules are legal per type
(`packages/protocol-validation/src/schemas/8/variables/variable.ts`):

| Type                 | Legal rules                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `text`               | `required`, `minLength`, `maxLength`, `sameAs`, `differentFrom`, `unique`                     |
| `number`             | `required`, `minValue`, `maxValue`, `sameAs`, `differentFrom`, `unique`, all four comparators |
| `scalar`             | `required`, `minValue`, `maxValue`, all four comparators                                      |
| `boolean`            | `required`, `sameAs`, `differentFrom`, `unique`                                               |
| `ordinal`            | `required`, `sameAs`, `differentFrom`, `unique`                                               |
| `categorical`        | `required`, `minSelected`, `maxSelected`, `sameAs`, `differentFrom`, `unique`                 |
| `datetime`           | `required`, `sameAs`, `differentFrom`, `unique`, all four comparators                         |
| `layout`, `location` | none                                                                                          |

Notably `scalar` carries no `unique`/`sameAs`/`differentFrom`, and `ordinal`
carries no `minSelected`/`maxSelected` (it is single-select). `EgoVariablesSchema`
additionally rejects `unique` outright via `rejectEgoUnique`, because the
runtime `unique` validator invariants on the ego entity.

Two further facts:

- **Validation has one home.** `FormFieldSchema`
  (`packages/protocol-validation/src/schemas/8/common/forms.ts`) has no
  `validation` key; `createFieldMetadata` spreads the codebook entry onto the
  field. A variable's rules are therefore constant across every stage that
  renders it — there is no per-stage variance to model.
- **References are variable ids.** `sameAs` and friends hold the key into the
  owning entity's `variables` record, resolved by `getVariableDefinition`.

## Design

### 1. Constraint model

A single internal descriptor per variable, derived from its codebook entry:

```ts
type VariableConstraints = {
  required: boolean;
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  minSelected?: number;
  maxSelected?: number;
  unique: boolean;
  sameAs?: string;
  differentFrom?: string;
  greaterThanVariable?: string;
  lessThanVariable?: string;
  greaterThanOrEqualToVariable?: string;
  lessThanOrEqualToVariable?: string;
  dateWindow?: {
    min?: string;
    max?: string;
    resolution: 'full' | 'month' | 'year';
  };
};
```

`dateWindow` is the load-bearing piece: `DatePicker`'s `parameters.min`/`max`/
`type` and `RelativeDatePicker`'s `anchor`/`before`/`after` both normalise into
it. That makes "validation rules plus component parameters" one mechanism
rather than two parallel ones. A variable with no date component and no bounds
gets no `dateWindow` and falls back to an unconstrained draw.

The descriptor lives in
`packages/protocol-utilities/src/generateNetwork/constraints/`, built once per
entity type at the start of a run.

### 2. Up-front feasibility pass

`analyseFeasibility(codebook, stages, config)` runs before anything is
generated. It returns every conflict it can find; `generateNetwork` throws a
single `SyntheticDataConstraintError` when the list is non-empty. The error
carries a structured `conflicts` array (entity type, variable id, variable name,
rules involved, reason) so a consumer can render it, and a message that reads
usefully in a console.

Checks:

- **Contradictory bounds** — `minLength > maxLength`, `minValue > maxValue`,
  `minSelected > maxSelected`, `minSelected > options.length`, an empty
  `dateWindow`.
- **Contradictory pairs** — `sameAs` and `differentFrom` naming the same target;
  `A greaterThanVariable B` alongside `A lessThanVariable B`; a `sameAs` or
  comparator whose target's bounds are disjoint from the source's (for example
  `A minValue: 10` with `A lessThanVariable B` where `B maxValue: 5`).
- **Cycles** — in the cross-variable reference graph. A `sameAs` cycle is
  satisfiable, since every member can share one value. A cycle containing any
  strict comparator is not. A mixed cycle (`A sameAs B` plus `B greaterThan A`)
  is not.
- **`unique` against a finite value space** — the value-space size for the
  variable compared against the worst-case count of entities of that type a run
  can produce.

Value-space sizes are computed over the values the generator can actually
reach, not the values the rules theoretically permit — otherwise feasibility
could pass a protocol the generator then exhausts:

| Type          | Size                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boolean`     | 2                                                                                                                                                                   |
| `ordinal`     | `options.length`                                                                                                                                                    |
| `categorical` | count of option subsets sized within `[minSelected ?? 1, maxSelected ?? options.length]`, computed lazily and abandoned once it exceeds the worst-case entity count |
| `number`      | `maxValue - minValue + 1` when both bounds are set; otherwise unbounded                                                                                             |
| `datetime`    | step count of the `dateWindow` at its resolution; unbounded without a window                                                                                        |
| `text`        | count of distinct strings the generator can emit within `[minLength ?? 1, maxLength]`; unbounded when `maxLength` is unset                                          |

"Unbounded" is a claim about the generator, so the generator must honour it:
where a type has a narrower _default_ draw range than its rules allow — the
`[18, 80]` default for `number`, the default cap of two selections for
`categorical`, the default recent-past window for `datetime` — a `unique`
variable widens that default to at least the worst-case entity count. Without
that, a `unique` number with no `minValue`/`maxValue` would exhaust its 63
default values at 64 nodes while feasibility called it unbounded.

Worst-case entity counts:

- **Node type** — sum over every node-creating stage whose subject is that type
  of `behaviours.maxNodes ?? config.nodeCount.max`, plus
  `config.familyPedigreeNodeCount.max` for each `FamilyPedigree` stage whose
  `nodeConfig.type` matches.
- **Edge type** — `C(n, 2)` over the worst-case count of the node type the
  edge's creating stages operate on.
- **Ego** — 1. `unique` is already unexpressible on ego variables.

Using the worst case rather than the run's actual draw is what makes a protocol
either always throw or never throw, independent of seed and session number.

### 3. Entity-level generation in dependency order

`generateAttributes` is replaced by:

```ts
generateEntityAttributes(
  constraints: EntityConstraints,
  ctx: GenerationContext,
  index: number,
  existingAttributes?: Record<string, VariableValue>,
): Record<string, VariableValue>
```

1. **Order.** Topologically sort the entity type's variables so a reference
   target is generated before its dependent. Variables joined by `sameAs`
   collapse into a single group.
2. **Generate.** Walk in that order, passing already-generated siblings.
   `sameAs` copies the target's value. `differentFrom` redraws until
   `isMatchingValue` is false, under the same bounded-attempt rule as `unique`
   below — feasibility has already established the value space holds at least
   two distinct values. Comparators derive a value on the correct side of
   their target using the same ordering semantics `compareVariables` uses, then
   clamp into the variable's own bounds — feasibility has already proven a
   satisfying value exists.
3. **`sameAs` groups.** A group generates one value satisfying the _union_ of
   its members' constraints, then assigns it to every member. Every member
   declaring `unique` registers it.
4. **`unique`.** A registry on `GenerationContext`, keyed
   `${entityType}:${variableId}`, is consulted before a value is accepted.
   Redraws are bounded; because feasibility already excluded exhaustion,
   reaching the bound is an internal invariant failure and throws as such.

`existingAttributes` is load-bearing. `handleAlterForm` and
`handleAlterEdgeForm` (`packages/protocol-utilities/src/generateNetwork/stageHandlers.ts`)
rewrite only the form's variables on nodes that already hold values, so a
comparison target may sit outside the set being regenerated. Feeding the
entity's current attributes in keeps those consistent.

### 4. Constrained value primitives

`ValueGenerator`'s generators take bounds instead of hardcoding them:

- `text` — a first name when unconstrained; padded or truncated into
  `[minLength, maxLength]`. Under `unique`, distinctness comes from a base-36
  encoding of a per-(entity type, variable) counter written _inside_ the length
  budget rather than appended as a suffix, so a `minLength: 24, maxLength: 24`
  variable stays exactly 24 characters.
- `number` — integer within `[minValue ?? 18, maxValue ?? 80]`, the default
  range widening under `unique` as described above.
- `scalar` — float within `[minValue ?? 0, maxValue ?? 1]`.
- `categorical` — pick a count within
  `[minSelected ?? 1, min(maxSelected ?? 2, options.length)]`, the default cap
  of two rising to `maxSelected ?? options.length` under `unique`.
- `ordinal`, `boolean` — as today, plus `unique` and cross-variable handling.
- `datetime` — **behaviour change.** Emit at the component's resolution
  (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`) inside the `dateWindow`.
- `layout`, `location` — unchanged; no rules are legal on them.

The `datetime` change is a bug fix in its own right. Today the generator emits
`new Date().toISOString()` — `2020-06-15T10:23:45.123Z` — which no date
component ever writes: `DatePicker` writes `YYYY`, `YYYY-MM` or `YYYY-MM-DD`
according to `parameters.type`, and `RelativeDatePicker` writes `YYYY-MM-DD`.
Those values also slip past the `min`/`max` validators by accident, because
`matchesDatePattern` does not recognise the shape and the numeric fallback
yields `NaN`.

### 5. Behaviours that stay as they are

- **`required: false` variables are still always filled.** The generator's job
  is to produce a complete interview; leaving optional fields blank for realism
  is a separate question and is not changed here.
- **In-progress stages still clear values.** `markStageInProgress` deliberately
  leaves a stage incomplete, which intentionally violates `required`. That
  behaviour is unchanged, and the conformance test asserts only on stages that
  ran to completion.
- **Manual nodes still use neutral values.** `ValueGenerator.neutralForVariable`
  keeps deliberately-constructed scenarios uncorrupted, and is not
  constraint-checked.

## Testing

**Unit tests, `packages/protocol-utilities`.** One test per (type, rule) pair
asserting the generated value satisfies the rule, and one per contradiction
class asserting `analyseFeasibility` reports it with a message naming the
variable.

**Conformance seam, `packages/interview`.** The real proof. A test in the
`units` vitest project builds protocols with `SyntheticInterview` covering every
legal (type, rule) pair, runs `generateNetwork`, and pushes every generated
value through the actual validator functions from
`packages/fresco-ui/src/form/validation/functions.ts` with a real
`ValidationContext` (codebook, generated network, stage subject). `packages/interview`
already devDepends on `@codaco/protocol-utilities` and `@codaco/protocols` and
peerDepends on `@codaco/fresco-ui`, so this adds no dependency edges. The guard
must be verified red by mutation — break a generator primitive and confirm the
test fails.

**Bundled protocols.** A test asserting every protocol in `@codaco/protocols`
passes `analyseFeasibility`, so the throw cannot regress the development and
sample protocols.

## Consequences

- **Seeded output changes.** Constraint-aware generation draws differently, so
  Architect preview snapshots and any committed fixtures derived from
  `generateNetwork` shift and need regenerating. Use the
  `regenerating-e2e-visual-snapshots` skill for the PNG baselines.
- **Existing protocols with contradictory validation now throw** where they
  previously produced quietly-broken data. That is the intended trade, but it is
  a behaviour change for protocols already in the wild, and it is the reason the
  follow-up project matters.
- **New public surface.** `SyntheticDataConstraintError` is exported from
  `@codaco/protocol-utilities` so Interviewer's generate dialog and Architect's
  preview host can present conflicts rather than a raw stack. Wiring those UIs is
  not part of this change.

## Follow-up project

Making contradictory validation unexpressible, so the throw above becomes a
defensive invariant rather than a live failure mode:

- Schema refinements in `@codaco/protocol-validation` rejecting the static
  contradiction classes listed under "Up-front feasibility pass", with
  migrations stripping or correcting them in existing protocols.
- Matching guards in the Architect variable editor so the combinations cannot be
  authored.

`rejectEgoUnique` in `packages/protocol-validation/src/schemas/8/variables/variable.ts`
is the precedent: it refuses `unique` on ego variables because the runtime
validator invariants on ego, and a migration strips it from existing protocols.
That project needs its own spec.
