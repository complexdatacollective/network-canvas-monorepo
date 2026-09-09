# Rework `@codaco/protocol-builder` around a session that owns invalidation

**Date:** 2026-09-09
**Last updated:** 2026-09-09
**Status:** Draft for discussion
**Scope:** the `@codaco/protocol-builder` package: its session contract, form
primitives, and the nineteen named stage editors; the Studio proof host
**Supersedes:** the implementation sequence in
[2026-08-27-protocol-builder-extraction.md](./2026-08-27-protocol-builder-extraction.md)
from the family editors onward. That document's architecture (section-scoped
commands, host-supplied leases and presence, live cross-section updates,
explicit compound edits, staged resources) stands.
**Tracking:** to be decided (see "Decisions for Josh")

## Summary

The extraction delivered the collaboration model the plan asked for, and it
works: leases, epochs, compound edits, no-echo updates, lease-loss fencing,
staged resources, and an in-memory proof host are all on `main` with tests
that fail when they break. What grew around that model is too large. The
package's source is about 60,000 lines before the five family branches land
another 25,000, one section file is 1,883 lines, `session.ts` is 2,860, and
38 hooks are exported. Most of that volume is nineteen editors each
re-deriving, at their own write sites, the consequences of "the world may
have moved under me" — which is exactly the guarantee the session exists to
give them.

This plan moves that guarantee into the session once, deletes the parallel
form framework the editors accreted, cuts extracted generality the editors
never reach, and rebuilds the nineteen editors as declarative section lists.
The target is a package where a stage editor is one file under 200 lines and
nothing in `sections/` inspects the codebook or the lease.

## Where the size came from

Measured on `main` at 7fa07f57a, `packages/protocol-builder/src`, tests and
stories excluded:

| Directory       | Lines   | Files |
| --------------- | ------- | ----- |
| `sections/`     | 12,903  | 39    |
| `form/`         | 9,944   | 33    |
| `codebook/`     | 8,828   | 17    |
| `resources/`    | 8,253   | 24    |
| `rules/`        | 6,855   | 12    |
| `session.ts`    | 2,860   | 1     |
| everything else | ~10,200 | —     |

Three mechanisms account for it.

1. **Per-site invalidation.** Every row dialog, picker, and save gate asks its
   own version of the same questions: is this attribute still in the codebook,
   still this type, still free of an interface-owned slot; is the lease still
   held; did the host's answer land on the row I asked from; did a
   collaborator repoint the subject while my dialog was open. The review
   rounds on the family PRs found, over and over, the next site that lacked
   one of these checks (nine rounds on one section, five consecutive
   single-finding rounds on another). Each fix added a hook —
   `useWhereTheAnswerLands`, `useSubjectStillCollected`,
   `useAttributeThatFollowsTheRow`, `useLandedAnswer`, `useLiveRefusal`,
   `slotCrossClassIssue`, `unusableVariableIssue`, `presetReferenceIssues`,
   `useConfirmEntityTypeChange` with ref re-reads — and every editor family
   grew a local variant before the loop converged them.
2. **A second form framework.** Dialog-hosted array rows, edited-row scopes,
   dormant values, row identity across insert/remove/move, binding memory
   across an "invent an attribute" window, own-write markers: all of it lives
   in `form/` and `sections/` on top of Fresco's `<Form>` rather than in it.
3. **Extracted generality.** The rule editor, rule descriptions, variable
   validation, and resource lifecycle came out of Architect at full breadth.
   The nineteen editors reach a fraction of that surface.

## Principles for the rework

- **The session is the only thing that knows the world moved.** Editors read
  one resolved view and write commands stamped with the epoch they saw.
  Staleness is refused by the session, in one place, with one message. No
  component re-reads a lease, a codebook, or a subject at write time.
- **A stage editor is data.** A named editor declares which sections it
  composes and in what order. Sections take semantic props and render the
  session view. Under 200 lines per editor.
- **One form.** Fresco's `<Form>` is the form. Rows and dialogs are sub-forms
  whose values are fields. The package adds no store, scope, or memory of its
  own beside it.
- **Only what the editors reach.** Rule, validation, and resource code keeps
  the paths the nineteen editors exercise. Architect keeps its own copies of
  the rest until it adopts the package.
- **A finding changes the session, never the section that surfaced it.**
  Applied from the first review round, not the ninth.

## Target architecture

### Session: resolve, attribute, refuse

`session.ts` splits into three small modules with one responsibility each.

- **Resolve.** Given the stage section and the sections it depends on
  (codebook entity types, assets, settings, the stages a source or skip-logic
  destination may name), produce one `ResolvedStageView`: every reference the
  stage holds, resolved to what it points at now or marked as lost, retyped,
  slot-owned, or out of order. This replaces every per-section lookup.
- **Attribute.** When an authoritative update to a dependency arrives, diff
  the resolved view and emit `Problem`s attributed to that update ("the
  attribute `closeness` was deleted by Ana at 14:02"). Problems carry the
  field path they belong to, so the form shows them at the control without the
  section knowing why. Live and non-blocking, matching collaboration #1275:
  cross-section invalidity never blocks a write.
- **Refuse.** Every command and compound edit carries the epoch of the view it
  was authored against. The session refuses a command whose target changed
  since that epoch, a write after lease loss, and a compound edit whose
  sections cannot all be acquired, with one outcome type and one sentence per
  reason. This replaces every dialog guard, in-flight latch, ref re-read, and
  "still collected?" hook in the components. Finish reserves the session for
  its whole duration (kept from the current work).

The controller, the command and compound-edit types, lease and epoch
semantics, resource staging and promotion, and `InMemoryCompoundHost` are
kept as they are on `main`. They are the parts Studio's adapter also
implements.

### Form: Fresco's, with two additions

Fresco's `<Form>` gains what the editors genuinely need and nothing more:

- **Sub-forms.** A row or dialog is a nested form bound to a path. Its values
  are ordinary fields; saving it is committing the sub-form's values into the
  parent's. Cancel restores the parent's values. No separate store.
- **Row identity.** Rows carry the schema's own ids where the schema has them
  (prompts, panels, form fields) and a session-issued id where it does not.
  Insert, remove, and move are commands on that identity.

`DialogArrayField`, `editedRow.ts`, edited-row scopes, dormant values, own-write
markers, and binding memory are deleted. The "invent an attribute from a row"
flow becomes a compound edit the session answers; the row shows the session's
outcome.

### Editors: section lists

```ts
export const informationStageEditor = defineStageEditor('Information', [
  stageHeading(),
  contentBlocks(),
  skipLogic(),
  interviewerGuidance(),
]);
```

Sections are functions from semantic props to a form fragment that reads the
resolved view. The nineteen editors are nineteen such files. The registry and
dispatcher keep their current shape: `defineStageEditorRegistry`,
compile-time exhaustiveness over `StageType`, a runtime test that
`missingStageEditors` is empty.

### What is cut

- Rule editing keeps the filter and skip-logic query builder the editors use;
  the rule-description module keeps the pure summary helper Architect's
  printable summary imports and drops the rest.
- Variable validation keeps the schema-driven checks; contradiction analysis
  beyond what a single editor can produce goes back to Architect.
- Resource lifecycle keeps stage, promote, discard, and inspect; the
  gateway's capability surface is what Studio's HTTP/S3 path needs and no
  more.
- The testing harness keeps `renderStageEditor`, the fixture session, and
  the collaborator-edit helpers; per-family helper forests are replaced by
  those.

### Salvage from the current branches

The five family branches (#1773, #1777 through #1784, and the unopened F4b)
are not rebased. Two things are taken from them by hand:

- Their tests, where a test asserts a researcher-visible behaviour (a save
  refused, a problem shown, a round-trip that keeps a key). Tests that drive a
  package-internal seam are dropped with the seam.
- Their locale ids and copy (en, es), which took real effort to get right.

Everything else is rewritten against the new session.

## Sequence

Three PRs, each off `main`, opened one at a time, each small enough to be
read whole.

1. **Session: resolve, attribute, refuse.** The three modules, the epoch-
   stamped command outcome, the problem model, and the tests that fail when
   a stale write is applied, an attributed problem is missing, or a refusal is
   silent. `main`'s four merged editors (the form family) are re-pointed at it
   in the same PR so there is never a second implementation of invalidation.
2. **Form: sub-forms and row identity.** The two Fresco additions, deletion of
   the package's form framework, and the four merged editors rewritten as
   section lists to prove the pattern.
3. **The other fifteen editors** in one PR, because the point is that they
   are all the same shape and that is only reviewable whole. Includes the
   proof-host stories (#1493) and the release gates (#1494).

Architect adoption (#1491, #1492) is decided after PR 3, when the package's
size makes the cost of adopting it visible.

## Review rules for this work

The loop that produced the current size adopted its useful rules too late.
They apply from the first PR here:

- Every finding is verified refute-first against the real session before any
  code changes.
- A finding changes code only for a failure a researcher can reach, a false
  claim the PR makes, or a silent boundary; the rest is resolved with the
  evidence.
- A fix lands in the session or the form, never in a section. A section that
  needs its own check is a design finding against the session.
- A mechanism found twice gets one enumeration test over its interleavings
  before a third patch.

## Decisions for Josh

- Close the eight open family PRs now, or leave them open as the reference
  while PR 1 is written.
- Start the rework from `main` as it is (four editors, the shared sections,
  S7's rounds) or from the package as it was before the family work landed.
- Whether Architect adoption comes back into this plan's scope once the
  package is small, or stays a separate decision.
- Whether Studio's adapter work should track PR 1 directly, since the session
  contract is what it implements.

## Assumptions

- Studio's collaboration model (#1275) and sync ADR (#1247) are unchanged.
- Fresco's `<Form>` can take the two additions without breaking Fresco's own
  consumers; this is checked in PR 2 with Fresco's tests and Storybook.
- The `all-interfaces` e2e fixture remains the source of representative
  stages for round-trip tests; its family-pedigree defect (no nomination
  prompt behind a mapped disease) is fixed in PR 3 where CI regenerates the
  baselines it moves.
