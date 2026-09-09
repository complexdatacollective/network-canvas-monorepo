# Rework `@codaco/protocol-builder` around locked sections and plain forms

**Date:** 2026-09-09
**Last updated:** 2026-09-09
**Status:** Draft for discussion
**Scope:** the `@codaco/protocol-builder` package: its host contract, form
primitives, and the nineteen named stage editors; the Studio proof host
**Supersedes:** the implementation sequence in
[2026-08-27-protocol-builder-extraction.md](./2026-08-27-protocol-builder-extraction.md)
from the family editors onward, and that document's command-buffering and
compound-edit model for stage editors. Its section identities, host-supplied
locks and presence, live cross-section updates, and staged resources stand.
**Tracking:** to be decided (see "Decisions for Josh")

## Summary

The extraction delivered a working collaboration model, and most of what it
delivered is not needed. Under per-section locking (#1275) one editor owns a
section at a time, so an editor does not have to describe its edits as a
buffered command sequence, fence undo history, stamp writes with epochs, or
re-check at every write site whether the world moved. It has to hold the
lock, keep its state in its form, and hand the whole section back on submit.
"A section save writes exactly the locked unit" is already the rule on
#1275.

The package on `main` is about 60,000 source lines before the five family
branches land another 25,000; one section file is 1,883 lines, `session.ts`
is 2,860, and 38 hooks are exported. Nearly all of that is machinery for
problems the locking model removes. This plan replaces the session with a
host contract of three operations — lock, subscribe, submit — deletes the
package's own form framework in favour of Fresco's `<Form>`, cuts extracted
generality the editors never reach, and rebuilds the nineteen editors as
declarative section lists. The target is an editor of one file under 200
lines that never inspects a lock or a codebook.

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

1. **Per-site staleness checks.** Every row dialog, picker, and save gate asks
   its own version of the same questions: is this attribute still in the
   codebook and still this type; is the lease still held; did the host's
   answer land on the row I asked from; did a collaborator repoint the subject
   while my dialog was open. The review rounds on the family PRs found, over
   and over, the next site that lacked one of these checks (nine rounds on one
   section, five consecutive single-finding rounds on another), and each fix
   added a hook. None of these questions exist once the editor owns its
   section and codebook edits commit on their own.
2. **A second form framework.** Dialog-hosted array rows, edited-row scopes,
   dormant values, binding memory across an "invent an attribute" window,
   own-write markers: all of it lives in `form/` and `sections/` on top of
   Fresco's `<Form>` rather than in it.
3. **Extracted generality.** The rule editor, rule descriptions, variable
   validation, and resource lifecycle came out of Architect at full breadth.
   The nineteen editors reach a fraction of that surface.

## Principles for the rework

- **An editor owns its section.** While it holds the lock, its form state is
  the section's state. Nobody else can change the section, so nothing in the
  editor re-reads anything at write time. Submit writes the whole section.
- **Other sections are read through subscriptions, in the component that
  reads them.** An entity select field subscribes to the node entity
  sections; a skip-logic destination field subscribes to the stage index. The
  stage editor form holds no subscriptions for its children. This replaces
  Architect's Redux selector pattern one for one.
- **Edits outside the stage commit immediately.** A codebook dialog opened
  from a stage editor takes its own lock (or, for a new section, uses the
  host's atomic create), saves, and creates a revision. The stage editor's
  subscribed components re-render with the result. Cancelling the stage edit
  does not undo it.
- **A stage editor is data.** A named editor declares which sections it
  composes and in what order. Under 200 lines per editor.
- **One form.** Fresco's `<Form>` is the form. Rows and dialogs are sub-forms
  whose values are fields. The package adds no store, scope, or memory of its
  own beside it.
- **Only what the editors reach.** Rule, validation, and resource code keeps
  the paths the nineteen editors exercise. Architect keeps its own copies of
  the rest until it adopts the package.
- **A finding changes the host contract or the form, never the section that
  surfaced it.** Applied from the first review round, not the ninth.

## Target architecture

### Host contract: lock, subscribe, submit

The session, controller, compound-edit request, auxiliary codebook sessions,
and epoch-stamped command outcomes are replaced by one small port with three
operations. Studio's server and Architect's Redux host both implement it;
the in-memory proof host implements it for tests and Storybook.

- **Lock.** `acquire(sectionId)` returns the section document and holds the
  lock until `release`. If the lock is held by someone else, the editor opens
  read-only with the holder's presence, per #1275. Lock loss in normal
  operation does not happen; if it does, the host refuses the next submit and
  the editor reports it and discards the draft. There is no re-acquire,
  takeover, or recovery machinery in the package. Data loss on a lost lock is
  accepted.
- **Subscribe.** `subscribe(sectionId | selector)` delivers a section's
  current document and every later revision. Only components that read
  another section subscribe, and each subscribes to exactly what it reads.
  The subscription carries the revision's author so a field can say who
  changed the thing it references.
- **Submit.** `submit(sectionId, document)` writes the whole section as one
  revision. The host checks two things: the caller holds the lock, and the
  document has the section's shape. Semantic invalidity across sections (the
  stage now references a deleted variable) is never a reason to refuse: #1275
  says drafts tolerate transient invalidity, and validity is enforced at
  publication. A separate `create(kind, document)` atomically creates a new
  section and registers its pointer in the protocol; it needs no client lock.
- **Compound refactors** — delete a variable and strip it from every prompt
  — remain server-mediated operations that acquire every affected lock or fail
  naming the holders (#1275). They belong to the codebook dialogs and the
  host. No stage editor issues one.

What the editor does with this: acquire the stage lock on open; hold the
stage document in its `<Form>`; let its fields validate their own values
against whatever they subscribe to; on save, run the section's schema
validation for the researcher's benefit and submit the form's values whole;
release on close.

### Resources

Imported files stay staged with the host for the life of the stage edit and
are promoted with the stage's submit, discarded with its cancel. Secrets stay
opaque staged handles. The gateway keeps list, stage, promote, discard,
inspect, and preview; it gains nothing the nineteen editors do not call.

### Form: Fresco's, with two additions

Fresco's `<Form>` gains what the editors genuinely need and nothing more:

- **Sub-forms.** A row or dialog is a nested form bound to a path. Its values
  are ordinary fields; saving it commits the sub-form's values into the
  parent's; cancel restores the parent's. No separate store.
- **Row identity.** Rows carry the schema's own ids where the schema has them
  (prompts, panels, form fields) and a form-issued id where it does not.
  Insert, remove, and move act on that identity.

`DialogArrayField`, `editedRow.ts`, edited-row scopes, dormant values,
own-write markers, and binding memory are deleted. "Invent an attribute from
a row" is a codebook dialog that creates the attribute immediately and hands
its id back to the row's field.

### Editors: section lists

```ts
export const informationStageEditor = defineStageEditor('Information', [
  stageHeading(),
  contentBlocks(),
  skipLogic(),
  interviewerGuidance(),
]);
```

Sections are functions from semantic props to a form fragment. Fields that
read other sections subscribe inside themselves. The nineteen editors are
nineteen such files. The registry and dispatcher keep their current shape:
`defineStageEditorRegistry`, compile-time exhaustiveness over `StageType`, a
runtime test that `missingStageEditors` is empty.

### What is cut

- The session, controller, compound-edit module, auxiliary sessions, and
  every hook whose job was to detect that the world moved at a write site.
- Rule editing keeps the filter and skip-logic query builder the editors use;
  the rule-description module keeps the pure summary helper Architect's
  printable summary imports and drops the rest.
- Variable validation keeps the schema-driven checks; contradiction analysis
  beyond what a single dialog can produce goes back to Architect.
- The testing harness keeps `renderStageEditor`, the fixture host, and the
  collaborator-edit helper; per-family helper forests are replaced by those.

### Salvage from the current branches

The five family branches (#1773, #1777 through #1784, and the unopened F4b)
are not rebased. Two things are taken from them by hand:

- Their tests, where a test asserts a researcher-visible behaviour (a save
  refused, a problem shown at a field, a round-trip that keeps a key). Tests
  that drive a package-internal seam are dropped with the seam.
- Their locale ids and copy (en, es), which took real effort to get right.

Everything else is rewritten against the new contract.

## Sequence

Three PRs, each off `main`, opened one at a time, each small enough to be
read whole.

1. **Host contract: lock, subscribe, submit.** The port, the in-memory host,
   the create and compound-refactor operations, and tests that fail when a
   submit without the lock is accepted, a subscription misses a revision, or
   a create leaves a dangling pointer. `main`'s four merged editors (the form
   family) are re-pointed at it in the same PR so there is never a second
   implementation of the contract.
2. **Form: sub-forms and row identity.** The two Fresco additions, deletion of
   the package's form framework, and the four merged editors rewritten as
   section lists to prove the pattern.
3. **The other fifteen editors** in one PR, because the point is that they
   are all the same shape and that is only reviewable whole. Includes the
   proof-host stories (#1493) and the release gates (#1494).

Architect adoption (#1491, #1492) is decided after PR 3, when the package's
size makes the cost of adopting it visible. Its host is trivial under this
contract: locks always granted, subscriptions are selectors, submit is a
reducer.

## Review rules for this work

The loop that produced the current size adopted its useful rules too late.
They apply from the first PR here:

- Every finding is verified refute-first against the real host before any
  code changes.
- A finding changes code only for a failure a researcher can reach, a false
  claim the PR makes, or a silent boundary; the rest is resolved with the
  evidence.
- A fix lands in the host contract or the form, never in a section. A section
  that needs its own check is a design finding against the contract.
- A mechanism found twice gets one enumeration test over its interleavings
  before a third patch.

## Decisions taken (2026-09-09, Josh)

- Stage editors keep their state in the form and submit the whole section;
  no command buffering, no epochs, no undo fencing.
- Codebook and other out-of-stage edits commit immediately under their own
  lock; cancelling the stage edit does not undo them. Unreferenced entities
  and variables are valid and stay.
- Creating a new section is an atomic host operation needing no client lock;
  editing an existing section needs its lock.
- Lock loss is not handled beyond the host refusing the submit; the draft is
  discarded. No re-acquire or takeover machinery in the package.
- Subscriptions live in the components that read other sections, never in
  the stage editor form.
- Compound refactors are server-mediated and belong to codebook dialogs, not
  stage editors.

## Decisions for Josh

- Close the eight open family PRs now, or leave them open as the reference
  while PR 1 is written.
- Start the rework from `main` as it is (four editors, the shared sections,
  S7's rounds) or from the package as it was before the family work landed.
- Whether Architect adoption comes back into this plan's scope once the
  package is small, or stays a separate decision.
- Whether Studio's adapter work should track PR 1 directly, since the host
  contract is what it implements.

## Assumptions

- Studio's collaboration model (#1275) and sync ADR (#1247) are unchanged;
  this plan narrows how the package uses them, not what they say.
- Fresco's `<Form>` can take the two additions without breaking Fresco's own
  consumers; this is checked in PR 2 with Fresco's tests and Storybook.
- The `all-interfaces` e2e fixture remains the source of representative
  stages for round-trip tests; its family-pedigree defect (no nomination
  prompt behind a mapped disease) is fixed in PR 3 where CI regenerates the
  baselines it moves.
