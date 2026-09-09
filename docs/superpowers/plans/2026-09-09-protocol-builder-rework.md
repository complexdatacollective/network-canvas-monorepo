# Rework `@codaco/protocol-builder` around locked sections and plain forms

**Date:** 2026-09-09
**Last updated:** 2026-09-09
**Status:** Draft for discussion
**Scope:** the `@codaco/protocol-builder` package: its host contract, state
and subscriptions, form primitives, and the nineteen named stage editors; the
Studio proof host; the Architect and Studio hosts as far as the contract
requires
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
host contract the package owns (an oRPC contract: lock, subscribe, submit,
create, and the server-mediated refactor), keeps sections read by other
components in a TanStack Query cache fed by one revision channel per open
protocol, keeps the section under edit in Fresco's `<Form>` and nowhere
else with Fresco's own `ArrayField` for rows and row dialogs, cuts extracted generality the editors never reach, and rebuilds the
nineteen editors as declarative section lists. The target is an editor of
one file under 200 lines that never inspects a lock or a codebook.

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
  sections and takes its options from that and nothing else; its selected
  value is form state. A skip-logic destination field subscribes to the stage
  index. The stage editor form holds no subscriptions for its children. This
  replaces Architect's Redux selector pattern one for one.
- **Edits outside the stage commit immediately.** A codebook dialog opened
  from a stage editor takes its own lock (or, for a new section, uses the
  host's atomic create), saves, and creates a revision. The stage editor's
  subscribed components re-render with the result. Cancelling the stage edit
  does not undo it.
- **A stage editor is data.** A named editor declares which sections it
  composes and in what order. Under 200 lines per editor.
- **One form.** Fresco's `<Form>` is the form and Fresco's `ArrayField` is
  the list. Its `editorComponent` already edits one item in a dialog with its
  own form and commits or discards on save or cancel; its managed ids already
  give rows identity across insert, remove, and move. The package adds no
  store, scope, or memory of its own beside them.
- **Only what the editors reach.** Rule, validation, and resource code keeps
  the paths the nineteen editors exercise. Architect keeps its own copies of
  the rest until it adopts the package.
- **Hosts may change to fit the package.** Architect's editing slices are
  replaced by the package's state; Studio takes the dependencies the contract
  needs. Getting the package right comes first.
- **A finding changes the host contract, the state layer, or the form, never
  the section that surfaced it.** Applied from the first review round, not
  the ninth.

## Target architecture

### Host contract: an oRPC contract the package owns

The session, controller, compound-edit request, auxiliary codebook sessions,
and epoch-stamped command outcomes are replaced by one contract, defined
contract-first with `@orpc/contract` (already used by `@codaco/studio-rpc`)
and exported by the package. Studio serves it over its transport; Architect
serves the same contract in-process with an oRPC router client, no network;
the in-memory proof host serves it for tests and Storybook. Hosts never see
the package's state library.

- **Lock.** `acquireLock(sectionId)` returns the section document and holds
  the lock until `releaseLock`. If the lock is held by someone else, the
  editor opens read-only with the holder's presence, per #1275. Lock loss in
  normal operation does not happen; if it does, the host refuses the next
  submit and the editor reports it and discards the draft. There is no
  re-acquire, takeover, or recovery machinery in the package. Data loss on a
  lost lock is accepted.
- **Read and watch.** `getSection(sectionId)` returns a document at a
  revision. `watchProtocol(protocolId, { since })` is an event iterator that
  yields every section revision, lock change, and presence change for the
  protocol from the given cursor. One channel per open protocol (see "State
  and subscriptions").
- **Submit.** `submit(sectionId, document, { revision })` writes the whole
  section as one revision. The host checks two things: the caller holds the
  lock, and the document has the section's shape. Semantic invalidity across
  sections (the stage now references a deleted variable) is never a reason to
  refuse: #1275 says drafts tolerate transient invalidity, and validity is
  enforced at publication.
- **Create.** `create(kind, document)` atomically creates a new section and
  registers its pointer in the protocol. It needs no client lock; the host
  serialises it.
- **Compound refactor.** Delete a variable and strip it from every prompt,
  and its kin, remain server-mediated operations that acquire every affected
  lock or fail naming the holders (#1275). They belong to the codebook
  dialogs and the host. No stage editor issues one.
- **Resources.** The gateway keeps list, stage, promote, discard, inspect,
  and preview, as procedures on the same contract. Imported files stay staged
  for the life of the stage edit, are promoted with the stage's submit, and
  are discarded with its cancel. Secrets stay opaque staged handles.

What the editor does with this: acquire the stage lock on open; hold the
stage document in its `<Form>`; let its fields validate their own values
against whatever they subscribe to; on save, run the section's schema
validation for the researcher's benefit and submit the form's values whole;
release on close.

### State and subscriptions: two layers

The package uses TanStack Query for sections that components read and
Fresco's Zustand form for the section being edited. That is the ordinary
client-state versus server-state split. RTK Query was considered and
rejected: it would put a Redux store in the package for capability TanStack
Query provides without one, and oRPC's TanStack integration gives typed
query keys from the contract for free.

**Component layer: subscriptions live where the data is used.** Section
components call package hooks — `useEntityTypes('node')`,
`useStageIndex()`, `useSection(id)` — each of which is a TanStack Query
observer on a key derived from the contract (`orpc.getSection.queryKey`).
Components never import TanStack Query or oRPC; the two hooks
`useSection`-style readers and `useSectionMutation(kind)` are the whole
surface, and lock and presence handling lives inside them.

**Transport layer: one channel per open protocol feeds the cache.**
`<ProtocolBuilder>` mounts one `useProtocolChannel(protocolId)` that
consumes `watchProtocol` and writes every revision into the cache with
`queryClient.setQueryData` under the section's key. It holds no React state.
This is preferred over a server subscription per component because:

- a per-key subscription has a gap between "fetch the section" and "the
  stream is live", and every subscription would have to reconcile missed
  revisions by number; one channel with one cursor does that once;
- component mount and unmount churn (dialogs, StrictMode double mounts, list
  re-keying) would open and close server subscriptions at React's rhythm;
- lock and presence changes ride the same stream as the data, in order;
- the cost is revisions for sections nobody in this tab reads, which at human
  editing rates is nothing; if it ever matters, the channel takes a section
  filter and no component changes.

**Re-rendering is bounded by the component's key and `select`, not by the
channel.** The channel writes to the cache from outside any render; TanStack
Query notifies only the observers of the key that changed; structural
sharing makes a deep-equal revision a no-op; `select` narrows an observer to
the slice it renders (a picker selecting `{ id, name, color }` per node type
does not re-render when a variable inside that type changes); form fields are
Zustand subscriptions and never live in the query cache.

**Settings that follow from the stream being authoritative.** Section queries
use `staleTime: Infinity` and no refetch on focus; the only refetch is on
reconnect, where the channel resumes from the last revision seen. Tag
invalidation is not used; a host that cannot push (none planned) would be the
only reason to add it.

**Dependencies.** `@tanstack/react-query` and `@orpc/contract` in the
package; `@orpc/client` and `@orpc/server` in the hosts. Studio already
depends on the contract package. Architect gains the client and server for an
in-process router.

**Architect.** The package's state replaces `stageEditorDraft`, the codebook
transaction metadata, and the editing history hooks. Architect's persistent
store keeps the committed protocol and app state; its host implementation is
a router whose `watchProtocol` is a store subscription and whose `submit`
is a reducer. That is a smaller Architect than today.

### Form: Fresco's, as it is

The package built a parallel array layer (`DialogArrayField`, `RowField`,
`RowEditorBoundary`, `editedRow.ts`, `arrayFieldCommands`,
`reseedStageForm`, edited-row scopes, dormant values, binding memory) because
its command model needed array edits to be section commands and needed to
know which row a dialog was still editing after the list moved underneath
it. Under this plan the editor owns its section, so none of that is needed,
and Fresco's `ArrayField` already provides what the editors use:

- **Row dialogs.** `editorComponent` receives `item`, `isNewItem`, `onSave`,
  and `onCancel`, renders a `Dialog` with its own `FormStoreProvider` and
  `FormWithoutProvider`, and calls `onSave(value)` to commit the row or
  `onCancel` to discard it. The parent form's value changes only on save.
  See the `DialogEditing` story in `ArrayField.stories.tsx`.
- **Row identity.** `useArrayFieldItems` keys every row by a managed internal
  id (`getId` reads the schema's own id where one exists, as prompts,
  panels, and form fields have), so `updateItem`, `removeItem`, and moves act
  on identity and `editingId` survives a reorder; `stripManagedProperties`
  removes the managed keys on submit. Rows without a schema id (categorical
  options) get a form-issued one and nothing else.
- **Everything else the editors reach** — `sortable`, `maxItems`,
  `confirmDelete`, `immediateAdd`, `onOperation`, `itemTemplate`, the empty
  state — is already there.

The package's array layer is deleted. "Invent an attribute from a row" is a
codebook dialog that creates the attribute immediately (through `create`)
and hands its id back to the row's field. If a stage editor needs something
`ArrayField` lacks, it is added to Fresco's `ArrayField`, never rebuilt beside
it.

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
- The testing harness keeps `renderStageEditor`, the in-memory host, and the
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

1. **Contract and state.** The oRPC contract, the in-memory host, the
   Architect in-process router, `<ProtocolBuilder>` with the query client and
   the protocol channel, the two component hooks, and tests that fail when a
   submit without the lock is accepted, a revision is missed across a
   reconnect, a create leaves a dangling pointer, or a revision to one section
   re-renders an observer of another. Two spikes land here because they are
   the least-trodden paths: oRPC's event iterator over a WebSocket that drops
   mid-stream and resumes from a cursor, and one contract served by two hosts
   (Studio over the wire, Architect in-process) with the same router types.
   `main`'s four merged editors (the form family) are re-pointed at the
   contract in the same PR so there is never a second implementation.
2. **Form: Fresco's `ArrayField` throughout.** Deletion of the package's
   array and dialog layer, any gap found closed in Fresco's `ArrayField`
   rather than beside it, and the four merged editors rewritten as section
   lists to prove the pattern.
3. **The other fifteen editors** in one PR, because the point is that they
   are all the same shape and that is only reviewable whole. Includes the
   proof-host stories (#1493) and the release gates (#1494).

Architect adoption (#1491, #1492) is decided after PR 3, when the package's
size makes the cost of adopting it visible. Its host is small under this
contract: locks always granted, `watchProtocol` a store subscription,
`submit` a reducer.

## Review rules for this work

The loop that produced the current size adopted its useful rules too late.
They apply from the first PR here:

- Every finding is verified refute-first against the real host before any
  code changes.
- A finding changes code only for a failure a researcher can reach, a false
  claim the PR makes, or a silent boundary; the rest is resolved with the
  evidence.
- A fix lands in the contract, the state layer, or the form, never in a
  section. A section that needs its own check is a design finding against
  the contract.
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
- Hosts may be changed to fit the package: Architect's editing slices are
  replaced, Studio takes new dependencies.
- State layer: TanStack Query for read sections, fed by one revision channel
  per open protocol; the host contract is an oRPC contract owned by the
  package. RTK Query considered and rejected (Redux store in the package for
  no added capability; a cached copy of Architect's store).
- Whole-protocol channel rather than per-component server subscriptions;
  re-render scope set by query key and `select`.

## Decisions for Josh

- Close the eight open family PRs now, or leave them open as the reference
  while PR 1 is written.
- Start the rework from `main` as it is (four editors, the shared sections,
  S7's rounds) or from the package as it was before the family work landed.
- Whether Architect adoption comes back into this plan's scope once the
  package is small, or stays a separate decision.
- Whether Studio's adapter work should track PR 1 directly, since the
  contract is what it implements.

## Assumptions

- Studio's collaboration model (#1275) and sync ADR (#1247) are unchanged;
  this plan narrows how the package uses them, not what they say.
- oRPC's event iterators and TanStack Query's push-into-cache pattern behave
  as documented in the versions the catalog pins; PR 1's spikes are where this
  is checked.
- Fresco's `ArrayField` covers every row and dialog pattern the nineteen
  editors need; a gap found in PR 2 is closed in Fresco with its tests and
  Storybook, not in the package.
- The `all-interfaces` e2e fixture remains the source of representative
  stages for round-trip tests; its family-pedigree defect (no nomination
  prompt behind a mapped disease) is fixed in PR 3 where CI regenerates the
  baselines it moves.
