# Project B kickoff prompt

Paste everything below the line into a fresh chat. It is self-contained.

---

I want to make contradictory variable validation rules **unexpressible** in Network Canvas protocols — caught by the schema and prevented by the Architect editor, rather than discovered later.

Please start with the `superpowers:brainstorming` skill. Do not write code before we have agreed a design and I have approved a written spec.

## Background

Synthetic interview-data generation (`generateNetwork` in `@codaco/protocol-utilities`) ignored every validation rule a researcher configured, so generated data routinely failed the very validation the interview enforces. A companion project fixed that. Its design and implementation plan are worth reading first:

- `docs/superpowers/specs/2026-07-27-synthetic-data-validation-conformance-design.md`
- `docs/superpowers/plans/2026-07-27-synthetic-data-validation-conformance.md`

That project deliberately scoped this work out. It detects contradictions at generation time and throws a `SyntheticDataConstraintError`. This project's job is to stop those contradictions being authored at all, so that throw becomes a defensive invariant rather than something researchers actually hit.

## What we learned that motivates this

Three findings from the companion project, all verified against the codebase:

1. **There is no check anywhere in `@codaco/protocol-validation` enforcing `minValue <= maxValue`, or `min <= max` on DatePicker parameters.** Inverted ranges are reachable in real, schema-valid protocols today.
2. **`behaviours: { minNodes: 20 }` with no `maxNodes` is schema-valid**, and the name-generator behaviours schema only cross-checks the two fields when both are present. This is not a validation-rule contradiction, but it is the same class of "the schema permits a shape nothing sensible wants".
3. There is already a precedent for exactly this kind of fix: `rejectEgoUnique` in `packages/protocol-validation/src/schemas/8/variables/variable.ts` refuses `unique` on ego variables (because the interview's `unique` validator invariants on the ego entity), with a migration stripping it from existing protocols. That is the shape to follow.

## Contradiction classes to consider preventing

The companion project's feasibility analyser detects all of these. Its implementation is in `packages/protocol-utilities/src/generateNetwork/constraints/feasibility.ts`, with the supporting analysis in `dependencyOrder.ts` and `valueSpace.ts` — read them, they encode the exact semantics.

**Statically detectable from one variable:**

- `minLength > maxLength`
- `minValue > maxValue`
- `minSelected > maxSelected`
- `minSelected` greater than the number of options
- An empty date window (DatePicker `min` after `max`)

**Statically detectable across variables in one entity:**

- `sameAs` and `differentFrom` naming the same target
- A comparator and its opposite naming the same target (`A greaterThan B` alongside `A lessThan B`)
- A comparator whose target's bounds are disjoint from the source's (`A minValue 10` with `A lessThan B` where `B maxValue 5`)
- A reference cycle containing a strict comparator
- A strict comparator between two variables joined by `sameAs`
- A `differentFrom` between two variables joined by `sameAs`

**NOT statically detectable — do not try to prevent in the schema:**

- `unique` against a finite value space. Whether `unique` on a three-option ordinal is satisfiable depends on how many nodes a stage generates, which is a runtime property. Architect could reasonably _warn_ when `unique` is applied to a variable with a small finite value space (ordinal, categorical, boolean, or a tightly bounded number), but it cannot decide it.

## A second, separate class: rules an interface cannot enforce

Validation rules are a **form-field** mechanism — the interview applies them through `useProtocolForm`, which renders `Field` components. An interface that assigns a variable by some other means never validates it.

`OrdinalBin` and `CategoricalBin` are exactly that. Verified in the runtime: `OrdinalBin` renders no `Field` at all, and `CategoricalBin`'s only `Field` is for the prompt's `otherVariable` free-text input — the bin's own variable is written by a bare `updateNode` dispatch (`[variable]: [bin.value]`). So a rule on a bin's prompt variable is never enforced by the bin.

That is harmless until the same variable is also rendered in a form somewhere, at which point the form validates a value the bin set without validation. Measured on a protocol where two variables sit in both a name generator's form and a following bin stage: **57 of 80 generated nodes fail validation** (0 of 80 with the form alone) — 45 failing `minSelected: 2`, 24 failing `differentFrom`.

**The rule to implement: a variable may not be used BOTH as a form field and as an `OrdinalBin` or `CategoricalBin` prompt variable.**

This was chosen over the narrower alternative (rejecting individual rules a bin cannot satisfy) because it is one sentence a researcher can act on, rather than asking them to reason about which validation rules a drag interaction can honour.

**It must be enforced in both directions in the Architect editor:**

- Choosing the prompt variable for an OrdinalBin or CategoricalBin must exclude any variable already used as a form field.
- Adding a variable to a form must exclude any variable already used as a bin prompt variable.

Enforcing only one direction leaves the other order of authoring open, which is how a researcher would actually hit it.

Things to work out during brainstorming:

- **What counts as "used in a form".** The form-field surfaces are `form.fields[].variable` on EgoForm / AlterForm / AlterEdgeForm / the name-generator variants, plus NetworkComposer's `nodeForm.fields[]` and `edges[].form.fields[]`, plus FamilyPedigree's forms. Confirm that list against the schema rather than trusting it.
- **`CategoricalBin.otherVariable` is a genuine edge case.** It IS rendered in a `Field` (an `InputField` for the free-text "other" option) — but that Field carries a hard-coded `required` and does NOT receive the codebook variable's validation props. So it is form-rendered yet unvalidated. Decide deliberately whether it counts as form usage, bin usage, or neither.
- **Existing protocols in the wild.** A migration cannot simply strip one side — removing the form field loses data collection, removing the bin stage loses an interview step. This probably needs to surface as an Architect validation error the researcher resolves, rather than an automatic migration.
- Whether the schema should reject it outright, or whether this is better as Architect logic-validation plus editor UI, given the migration problem above.

`rejectEgoUnique` remains the precedent for the mechanism, if a schema-level refinement turns out to be right.

Worth checking whether any other interface assigns a variable outside a form field and needs the same treatment.

## Important: things that look contradictory and are not

The companion project initially got this wrong and refused valid protocols. Do not repeat it. All of the following are **satisfiable and must remain expressible**:

- **The same constraint stated from both sides.** `end greaterThan start` together with `start lessThan end`. A researcher naturally sets the rule on both fields because both are shown to the participant. These are one constraint, not a cycle.
- **Mutual `differentFrom`.** `a differentFrom b` and `b differentFrom a` — `differentFrom` is symmetric; satisfied by any two distinct values.
- **Mutual non-strict comparators.** `a >= b` and `b >= a` — satisfied when they are equal.
- **A strict comparator alongside a redundant `differentFrom`.** `a > b` with `b differentFrom a` — `a > b` already implies inequality.

## Scope to decide during brainstorming

- Which classes belong in the Zod schema (a hard parse failure) versus Architect's logic validation (a surfaced warning) versus the editor UI (prevented at the point of authoring).
- What each schema refinement's migration does to protocols already in the wild — strip the offending rule, correct it, or refuse the protocol. Note that refusing outright would make existing `.netcanvas` files unopenable, which is probably unacceptable.
- Whether the Architect variable editor should prevent the combination at input time (e.g. disabling or clamping a max below the current min) or allow it and show an error.
- Whether `@codaco/protocol-utilities`'s feasibility analyser should then be simplified, or kept as a defensive backstop. My inclination is to keep it — it also covers the runtime-only `unique` case.

## Repo conventions

Read `CLAUDE.md` at the repo root first. The points most likely to bite:

- Protocol schemas are versioned and modularised under `packages/protocol-validation/src/schemas/8/`. Schema changes need a matching migration, and `docs/superpowers/specs/` holds the design docs.
- Changesets have strict lanes — one release lane per changeset, never a gated product and a library together. Invoke the `creating-a-changeset` skill when you get there.
- Architect changes should be verified with its Playwright e2e suite; invoke the `running-architect-e2e-tests` skill.
- No `any` types, no barrel files, no `as` assertions to silence type errors.

Start by exploring the current schema and Architect editor, then ask me questions one at a time.
