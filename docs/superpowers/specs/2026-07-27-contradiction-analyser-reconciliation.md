# Reconciling the two contradiction analysers

Date: 2026-07-27
Status: Planned — blocked on PR #1107

## Trigger and ordering

Run this in `claude/synthetic-data-validation-2b18a2` (PR #1108) **after both**:

1. **PR #1107** (`feat: make contradictory validation rules unexpressible`) has merged to `main`, and
   `main` has been merged into this branch.
2. **PR #1109** (finite-domain constraint solving) has merged **into** this branch.

Order matters. #1109 rewrites `constraints/feasibility.ts` and
`constraints/generateEntityAttributes.ts`, which is most of the surface this task edits. Reconciling
first guarantees a conflict against work that is already in flight.

If #1107 is abandoned or substantially rescoped, this whole task is void — re-read its final shape
before starting.

## Why

PR #1107 and PR #1108 independently implement the same satisfiability semantics — comparator
canonicalisation into deduped `{lower, upper, strict}` edges, union-find over `sameAs`, strict-edge
cycle detection, per-type interval models with intersection for equality groups — in two packages,
with **no cross-check between them**.

#1107's design doc acknowledges the reimplementation and gives the reason: `@codaco/protocol-validation`
cannot depend on `@codaco/protocol-utilities`. That constraint is real and stays. But the dependency
runs the _other_ way already — `protocol-utilities` depends on `protocol-validation`, and
`findValidationContradictions` is exported from its package entry — so the duplication is removable in
one direction.

The failure this prevents: someone fixes a cycle-detection edge case in one package, the other
quietly disagrees, and the symptom is a protocol Architect blesses that preview refuses — or the
reverse, which is worse. These are graph algorithms, not a constant; drift will not be obvious on
inspection.

## Verify these premises before acting

They were established on 2026-07-27 against `origin/claude/protocol-validation-contradictions-fdfd2f`
and may have moved:

- The two branches had **zero file overlap** (42 files vs 55). `protocol-utilities` and `interview`
  were untouched by #1107; `protocol-validation` was untouched by #1108.
- `VARIABLE_REFERENCE_VALIDATIONS` was unchanged by #1107 and is now consumed as the canonical rule
  list by both — three call sites in this branch, plus #1107's `validateEntityAttributeReferences.ts`.
  Keep it that way.
- `findValidationContradictions(variables)` takes **one entity's variables record** and returns
  `{ class, variableIds, rules, message, path }[]`.

## Work item 1 — delegate the shared classes

Have `analyseFeasibility` call `findValidationContradictions` for the classes #1107 owns, instead of
computing them again.

**Delegate** (#1107's catalogue, classes 1–4 and 7–10): `minLength > maxLength`; `minValue > maxValue`;
`minSelected > maxSelected`; `minSelected > options.length`; `sameAs` and `differentFrom` naming the
same target; any comparator cycle containing a strict edge; a strict comparator or `differentFrom`
between members of one `sameAs` group; single-edge bound disjointness; and an equality group whose
members' bounds have an empty intersection.

**Check before delegating class 10**: this branch's `d31b010bb` added option-domain intersection for
equality groups, and #1107's commits `c1c2dcf84` / `afb8cbb39` mention option-set disjointness and
shared-option cardinality. Establish whether their class 10 covers option sets or only numeric and
length ranges. If it covers them, delegate; if not, keep ours and say so.

**Keep in `protocol-utilities`** — their analyser cannot decide these, by design or by input:

| kept                                                                                 | why                                                                                                    |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `unique` value space vs worst-case entity count                                      | depends on how many entities a stage generates — a runtime property #1107's design explicitly declines |
| transitive bound propagation across comparator chains                                | #1107 is _deliberately_ single-edge: "not a transitive interval solver"                                |
| RelativeDatePicker windows resolved against `today`                                  | #1107 treats them as contributing no static bounds                                                     |
| date windows with an absent bound filled from `today`, and the 1920 DatePicker floor | needs the injected `today`; a generation-time input                                                    |
| bin-only scoping (`binOnlyVariables.ts`)                                             | decides which variables are validated at all, which is a stage-graph question                          |

**Adapters, and the two ways this goes wrong:**

- _Input._ Their analyser takes a raw `variables` record; ours reasons over `EntityConstraints`, whose
  descriptors have DatePicker and RelativeDatePicker **parameters already folded in** alongside
  validation rules. Feeding them the raw record loses that folding; feeding them a synthesised record
  risks misrepresenting it. Decide deliberately and test the date cases specifically.
- _Output._ Their `message` is schema-flavoured and path-anchored; ours is a researcher-facing sentence
  rendered in Architect's `PreviewHost` and Interviewer's toast. **Any adopted message must name
  variables by name.** An earlier bug on this branch rendered the codebook _key_, which is a UUID in
  Architect-authored protocols — the fix is why `ConstraintConflict` carries `entityTypeName`. Do not
  regress it. If their messages cannot carry names, map their structured output onto our existing
  wording rather than adopting their strings.

## Work item 2 — the one-way conformance guard

Add this **whether or not delegation ends up complete**, because partial delegation leaves exactly the
drift this task exists to remove.

Invariant: _anything `findValidationContradictions` rejects, `analyseFeasibility` also refuses._

Not the converse — ours is intentionally stricter on the five kept classes above. Assert one direction
only; a bidirectional test will fail correctly and be "fixed" by weakening ours.

Home: `packages/protocol-utilities`, which already depends on `protocol-validation`. Drive it from a
corpus of entity variable records covering both branches' fixtures, and verify the guard is real by
breaking one analyser and confirming it goes red.

## Work item 3 — differences that close cheaply

1. **`unique` hint vs hard refusal.** #1107 makes small-value-space `unique` a _non-blocking_ Architect
   hint (boolean/ordinal only). This branch hard-refuses when the space is smaller than the worst-case
   entity count — including in Architect **preview**, which calls `generateNetwork`. So a researcher
   can dismiss the hint and hit a hard stop moments later. Update the hint's copy to say preview will
   refuse if the entity count exceeds the available values. Copy change in Architect; no logic.
2. **Mark the now-defensive code.** #1107 makes several of our checks unreachable from valid protocols:
   R1 floors (`maxLength ≥ 1`, `maxSelected ≥ 1`), R2 same-typed reference targets (which makes our
   mixed-type equality-group branch unreachable), DatePicker exact-resolution bounds (which makes
   `b9b43a917`'s runtime resolution guard belt-and-braces), and integer `minValue`/`maxValue` (which
   makes `valueSpaceSize`'s integer-free grid fallback unreachable). Add a one-line comment at each
   naming the schema rule that now prevents it.
   **Do not delete any of it.** `generateNetwork` is called with hand-built codebooks by
   `SyntheticInterview`, by tests, and by external hosts such as Fresco, none of which are guaranteed
   to have passed the schema.
3. **Pin the RelativeDatePicker split.** #1107 contributes no static bounds for it; we resolve it
   against `today`. Add a test on each side asserting its half, so neither drifts into the other's
   territory.

## Non-goals

- Making `protocol-validation` transitive. That was #1107's deliberate choice and reopening it is a
  design conversation, not cleanup.
- Moving our analyser wholesale into `protocol-validation`. It needs worst-case entity counts and an
  injected `today` — both generation-time inputs that package has no business taking.
- Any change to #1109's solver.
- The Architect editor accepting transitively-conflicting bounds that preview then refuses. It is a
  real UX seam, but closing it means porting transitive propagation into the schema — see the first
  non-goal. Document it; do not fix it here.

## Verification

`pnpm --filter @codaco/protocol-utilities test`, `@codaco/interview`, `@codaco/architect`,
`@codaco/interviewer`, plus root `pnpm typecheck` and `pnpm knip`. Re-run the seeded sweeps in
`generateNetwork.constraints.test.ts` and confirm a fixed seed still produces identical output —
delegation must not move a single generated value.

Also re-run the bundled-protocol feasibility test and Architect's preview e2e: those are the two
places a changed conflict message or a changed refusal set becomes visible to a researcher.

## Risks

- **Message regression** is the likeliest user-visible harm, and the least likely to be caught by a
  passing suite. Assert message text explicitly.
- **The input adapter silently dropping folded date parameters**, which would make date conflicts stop
  being detected while every test still passes. Cover the date classes directly.
- **Changed conflict _sets_.** Delegation may report a different number of conflicts for a protocol
  that previously produced one combined message, or vice versa. Several tests assert exact conflict
  counts and variable name lists; expect to update them, and justify each change rather than
  loosening the assertion.
