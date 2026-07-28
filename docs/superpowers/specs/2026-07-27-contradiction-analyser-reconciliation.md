# Reconciling the two contradiction analysers

Date: 2026-07-27 (revised 2026-07-28 against #1107's post-review shape)
Status: Planned — blocked on PR #1107

## Trigger and ordering

**Precondition 2 is already met.** PR #1109 (finite-domain constraint solving) was merged into
`claude/synthetic-data-validation-2b18a2` at `254123bfc`, and its conflicts were resolved there — see
that commit for what the merge collided on, including a real solver defect it surfaced.

**The plan changed on 2026-07-28: #1107 no longer merges to `main` first.** The current sequence is:
the attribute-writer exclusivity work merges into #1107's branch; #1107 then re-targets and merges
into this branch (`claude/synthetic-data-validation-2b18a2`); and this task runs here as the next
work item, before #1108 targets `main`. If that plan reverts to #1107-into-main, the original
contingency stands: run this on #1108 if it is still open, else branch fresh from `main`.

If #1107 is abandoned or substantially rescoped again, re-read its final shape before starting. Its
spec (`docs/superpowers/specs/2026-07-27-protocol-validation-contradictions-design.md`) was
truth-fixed on 2026-07-28 and is the authoritative catalogue; this document's snapshots of #1107 are
summaries, and where they disagree with that spec, that spec wins.

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

- The zero-file-overlap premise (42 files vs 55, `protocol-utilities`/`interview` untouched by
  #1107) is **no longer true**: #1107's review waves reached into `packages/interview`
  (`src/forms/useProtocolForm.tsx`, a date-window test file, two changesets) and `packages/fresco-ui`
  (`DatePicker.tsx`, its tests, a changeset). Diff both sides before the merge and expect small
  conflicts there.
- `VARIABLE_REFERENCE_VALIDATIONS` was unchanged by #1107 and is now consumed as the canonical rule
  list by both — three call sites in this branch, plus #1107's `validateEntityAttributeReferences.ts`.
  Keep it that way (re-verify at merge time).
- `findValidationContradictions(variables, options?)` takes **one entity's variables record** and
  returns `{ class, message, variableIds, strips }[]` — the `{ rules, path }` shape this document
  previously cited was stale. `strips` names the rule instances the migration would remove;
  `variableIds` is the participant set the strips anchor on.
- The options argument matters to the delegation adapter: `stageEffectiveComponents?: boolean`
  (default false) controls whether options-derived **boolean** domains are judged. Record-level
  callers pass false, because a codebook Boolean may be overridden to Toggle by every composer
  occurrence; callers whose variables records carry **resolved** renderings pass true.
  `analyseFeasibility` reasons over `EntityConstraints` with the rendering already folded in, so the
  adapter should pass `true` — and a test must pin that choice against the Toggle-override shape in
  both directions.

**The delegation surface grew after this spec was written.** Several more per-variable checks landed in
`feasibility.ts` during PR #1108's review cycles, and each is a delegation candidate to re-assess
against #1107's final catalogue rather than assumed to be ours:

- `required` with `maxSelected: 0`, and with `maxLength: 0` (`419310753`, `f173ec851`) — the ceiling
  admits only the empty value that `required` rejects.
- `maxLength < 0` and `maxSelected < 0` (`cd4345137`) — unconditional on `required`, because a
  negative ceiling admits nothing at all. Negative _floors_ are deliberately left alone as vacuous.
- `minSelected` against **distinct** option values rather than entries (`1621143f0`). #1107 counts
  distinct values too, for the same reason, so this one is very likely delegable.
- A rule whose two ends are both fixed by one prompt (`e46787d60`) — protocol data, so decidable
  statically, but it needs prompt information #1107's analyser does not receive. Likely stays.
- Heterogeneous `sameAs` groups (`a62fa9154`) — #1107's R2 makes these unexpressible, so ours becomes
  defensive rather than load-bearing once it lands.

## Work item 1 — delegate the shared classes

Have `analyseFeasibility` call `findValidationContradictions` for the classes #1107 owns, instead of
computing them again.

**Delegate** — #1107's final catalogue is far larger than the classes-1–4/7–10 snapshot this section
was written against. Beyond the original list (`minLength > maxLength`; `minValue > maxValue`;
`minSelected > maxSelected`; `minSelected > options.length`; `sameAs` and `differentFrom` naming the
same target; strict-edge comparator cycles; strict/`differentFrom` conflicts inside one `sameAs`
group; single-edge bound disjointness; empty equality-group intersections) it now also decides: full
transitive bound propagation across comparator chains (sameAs-contracted, per-origin, with
propagated pins); equality-group option-set intersection and shared-option cardinality (the old
"check before delegating class 10" question is answered: yes, delegable); pinned-value conflicts
(number `min===max`, ordinal/categorical singleton distinct domains, `minSelected` at the
distinct-option count, sameAs-group-derived pins, comparator-propagated pins including coarse
stored-string pins); boolean parity over odd `differentFrom` cycles; discrete coarse-date domain
emptiness (1,000-period enumeration cap); disequality pruning over exactly-enumerable date domains;
and DatePicker/RelativeDatePicker window modelling including default windows, the native
`0001-01-01` floor, and synthesized out-of-window coarse far bounds (see the kept table — the date
split moved). Re-derive the delegation list from #1107's spec at merge time rather than from this
paragraph.

**Keep in `protocol-utilities`** — their analyser cannot decide these, by design or by input:

| kept                                               | why                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unique` value space vs worst-case entity count    | depends on how many entities a stage generates — a runtime property #1107's design explicitly declines                                                                                                                                                                                                                                                                                                                                 |
| a rule whose two ends are both fixed by one prompt | needs prompt information #1107's analyser does not receive                                                                                                                                                                                                                                                                                                                                                                             |
| bin-only scoping (`binOnlyVariables.ts`)           | decides which variables are validated at all, which is a stage-graph question                                                                                                                                                                                                                                                                                                                                                          |
| exact-`today` date reasoning                       | #1107 now models RelativeDatePicker windows (fixed-anchor, interview-date-origin, and the absent-parameters default window), default DatePicker windows, floors, and synthesized coarse bounds — but it has no wall clock, so today-dependence is modelled at a fixed 2120 horizon as a **superset** that only ever errs toward acceptance. This branch resolves against the real injected `today` and stays the stricter, exact layer |

Two rows from the original table are gone because their premises fell during #1107's review waves:
transitive propagation and RelativeDatePicker windows are now #1107 capabilities, not exclusions.
The correct date relationship is containment, not partition — see work item 3.

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

## Work item 2 — the conformance harness (drift guard + solver witness search)

Add this **whether or not delegation ends up complete**, because partial delegation leaves exactly the
drift this task exists to remove. It has grown a second, more important half since first drafted:
#1107's review ran to ~110 findings, and the dominant class was model-vs-runtime fidelity —
hand-constructed configurations where the analyser's model of control semantics disagreed with the
real runtime. #1109's solver is the machine that constructs those counterexamples automatically.

**Invariant A (drift guard)**: _anything `findValidationContradictions` rejects, `analyseFeasibility`
also refuses._ Not the converse — ours is intentionally stricter on the kept classes above. Assert
one direction only; a bidirectional test will fail correctly and be "fixed" by weakening ours.

**Invariant B (witness search)**: _for every record `findValidationContradictions` rejects, #1109's
finite-domain solver finds **no** satisfying assignment._ A witness found is a machine-proven false
positive in `protocol-validation` — its highest-consequence failure, because its rejections drive
the destructive v7→v8 migration strips. Treat any witness as a release-blocking bug there, never as
a reason to weaken the solver. (This consumes #1109's solver read-only; the no-changes-to-#1109
non-goal stands.)

Home: `packages/protocol-utilities`, which already depends on `protocol-validation`. Drive both
invariants from one corpus: both branches' fixtures, the shapes exercised by #1107's ~1,100-test
analyser suite, and seeded random records (deterministic seeds; no wall-clock, no unseeded
randomness). Verify the harness is real by mutation: break each analyser in turn and confirm the
relevant invariant goes red.

The class-2 counterpart already landed on #1107's side: a seeded v7 migration fuzz
(`migration-fuzz.test.ts` in `protocol-validation`) asserting fuzzed v7 protocols always migrate to
schema-valid v8. It is in-package and unaffected by delegation — noted here only so nobody re-plans
it.

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
3. **Pin the date-window containment.** The old split ("#1107 contributes no static bounds for
   RelativeDatePicker") is gone — #1107 now models RelativeDatePicker and default DatePicker windows
   at a fixed 2120 horizon, a deliberate superset of any real-`today` window. Add a test on each
   side asserting the containment direction: #1107's modelled window ⊇ this branch's real-`today`
   window, on any date through 2120. If that test ever fails, #1107 has become stricter than the
   runtime somewhere — a false-rejection bug there, not a tolerance to add here.

## Non-goals

- Moving our analyser wholesale into `protocol-validation`. It needs worst-case entity counts and an
  injected `today` — both generation-time inputs that package has no business taking.
- Any change to #1109's solver (work item 2's witness search consumes it read-only).

Two former non-goals are deleted because #1107 made them moot rather than out-of-scope: it _is_
transitive now (chain propagation shipped during its review waves), and the Architect editor _does_
reject transitively-conflicting bounds. Nothing here needs to reopen either.

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
