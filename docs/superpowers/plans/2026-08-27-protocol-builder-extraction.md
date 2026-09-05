# Extract Architect stage editors into `@codaco/protocol-builder`

**Date:** 2026-08-27
**Last updated:** 2026-09-05
**Status:** In implementation
**Scope:** Architect stage editing, shared protocol-authoring components, and a
Studio-compatible protocol-builder package boundary
**Tracking:** [epic #1483](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1483)
and [Studio project 14](https://github.com/orgs/complexdatacollective/projects/14)

## Summary

The migration is active. The private, source-first
`@codaco/protocol-builder@0.1.0` package and its host-neutral session contract
landed in [PR #1513](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1513),
and the shared form shell, outline, progressive-disclosure behavior, first two
common Sections, and initial authoring primitives landed in
[PR #1539](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1539).
Architect already consumes the extracted interface metadata, documentation
metadata, markdown adapter, rich-text field, and stage-name input. These are
dependency-free leaf primitives, not an incremental migration of Architect's
stage-editor host.

The remaining target is unchanged: move all 19 stage editors, their Sections,
nested form/dialog components, validation behavior, and protocol-specific
editing primitives into the package. Architect will then fully adopt the
package and delete its existing Redux-coupled stage-editor implementation.
Architect adoption is explicitly deferred until the package passes the
feature-complete gate defined below. The app-local editors and Redux draft seam
remain active until that adoption is complete; the package does not yet export
a named stage editor.

The package will follow Studio's accepted model: section-scoped commands,
leases and presence supplied by the host, live cross-section updates, and
explicit compound edits. This aligns with
[Studio's editor architecture](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1272),
[collaboration model](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1275),
and
[sync ADR](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1247).

## Implementation status and evidence

| Work                                                                                                                                                                                               | Status                               | Evidence and result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [#1484](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1484) — package, taxonomy, and session API                                                                         | Done                                 | [PR #1513](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1513) merged 2026-08-31 (`3e42c954d`). It created the package, moved the client-safe taxonomy and protocol assembly into `@codaco/studio-sync`, and added the session, controller, exhaustive registry contract, Storybook wiring, and a real Studio session adapter.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [#1485](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1485) — form shell, Sections, and initial primitives                                                               | Done                                 | [PR #1539](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1539) merged 2026-08-31 (`4b5019acf`). It added the shell, outline, `ProtocolField`, progressive disclosure, stage-name and interviewer-guidance Sections, and moved the first shared primitives out of Architect.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [#1489](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1489) — codebook entities, variables, and compound edits                                                           | **Implemented; in review**           | [PR #1574](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1574) adds the tolerant typed codebook/stage-order context, role and contradiction semantics, entity and variable editors, validation surfaces, auxiliary draft sessions, attributed live validation, and a fenced atomic compound-edit contract with a deterministic proof host. Architect and Studio adoption remain untouched.                                                                                                                                                                                                                                                                                                                                                       |
| [#1490](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1490) — staged resource gateway                                                                                    | Planned; may proceed alongside #1489 | Required before resource-consuming editor families and final host adoption.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [#1548](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1548) — skip logic, rules, filters, and automatic naming                                                           | Blocked by #1489                     | Split out after #1485 proved that these controls require a package-owned codebook and ordered-stage read model.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [#1486](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1486)–[#1488](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1488) — all 19 named editors | In progress (shared primitives)      | The shared authoring primitives #1486 carries are landing first: templates, stage-creation initial values, and thumbnails in [PR #1689](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1689) (Architect swapped to the package exports, copies deleted); the shared `DialogForm` primitive in [PR #1688](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1688). The array, dialog, option-row, and attribute primitives (and the in-place re-seeding stage editor shell) are in [PR #1693](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1693). Begin the named editors after the array/dialog, rule, and resource dependencies exist; do not rebuild those dependencies inside individual editors. |
| [#1493](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1493) — Studio-compatible Redux-free proof host                                                                    | Package-completion gate              | Exercise the completed package after all editor families and shared dependencies land. Its acceptance criteria must pass before Architect adoption begins.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [#1491](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1491) — Architect adoption                                                                                         | **Deferred until feature complete**  | Do not route Architect stage editing through the package or add its live session adapter until #1493 passes against the completed package.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [#1492](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1492) — Redux and app-local implementation removal                                                                 | Blocked by #1491                     | Remove the old seam only after every Architect stage flow has adopted the feature-complete package.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [#1494](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1494) — cross-surface verification and release readiness                                                           | Final gate                           | Run after Architect adoption and removal are complete.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Project 14 still labels the overall epic `Backlog` and does not currently mark
an open successor `Ready`. That is scheduling metadata, not an accurate
implementation status: two epic slices have merged. Promote the selected issue
on the board when committing it to a sprint.

### Current implementation sequence

1. ~~Establish the package, shared taxonomy, and session/controller contract~~
   — #1484, complete.
2. ~~Build the form shell, outline, progressive disclosure, common
   dependency-free Sections, and initial primitives~~ — #1485, complete.
3. Complete and merge #1489: its current implementation derives typed codebook
   and stage-order access from the session's protocol sections, moves
   entity/variable editing and validation semantics, and proves atomic compound
   edits and live no-echo updates.
4. Implement #1490 independently or alongside #1489 so resource-consuming
   editors do not invent host storage behavior.
5. Implement #1548 once #1489 supplies its read model.
6. Implement #1486–#1488 against those shared seams and complete the exhaustive
   package dispatcher. Do not route any of these editors through Architect as
   they land.
7. Complete the Redux-free, Studio-compatible proof host in #1493 against the
   finished package. Passing #1493 is the package feature-complete gate.
8. Only after that gate passes, migrate every Architect stage flow through the
   package in #1491, then remove the Redux/app-local seam in #1492.
9. Run the final cross-surface gate in #1494.

## Architecture and public API

- **Implemented in #1484:** `packages/protocol-builder` has raw-TypeScript
  exports, `styles.css`, tests, and local Storybook configuration. It is private
  and has no publishing configuration.
- **Public API progress:**
  - the exhaustive registry/dispatcher _contract_ exists; the generic
    `StageEditor` component waits on the named editors;
  - one named component for every `StageType`, from
    `AlterEdgeFormStageEditor` through `NarrativePedigreeStageEditor`, remains to
    be implemented in #1486–#1488;
  - `ProtocolBuilderSession`, snapshot/access/presence types,
    compound-edit types, `StageEditorController`, and
    `useStageEditorController` are implemented;
  - `ProtocolBuilderResourceGateway` and resource descriptor/staging types are
    planned in #1490;
  - entity-type and variable editors needed by both stage editors and
    Architect's codebook surface are implemented on the current #1489 branch.
- **Implemented policy:** keep Sections, form controls, validation controls,
  and stage-specific implementation components internal. Where Architect's
  printable summary needs shared rule semantics, extract a pure
  rule-description helper rather than exporting interactive Section internals.
- **Implemented in #1484:** the client-safe section taxonomy lives in
  `@codaco/studio-sync`, so
  Architect, Studio, and protocol-builder share the same
  stage/node/edge/ego/assets identities and `set`/`unset`/array command
  vocabulary.
- **Implemented in #1484:** `ProtocolBuilderSession` is an external store with
  `subscribe`/`getSnapshot`. Its snapshot contains the edited section
  document, assembled protocol sections, manifest revision, access state,
  presence, attribution, pending commands, and history state.
- **Implemented in #1484:** possibly invalid form drafts are typed separately
  from `Stage`/`CurrentProtocol`. Only expose `validatedProtocol` after
  canonical validation succeeds; never cast partial drafts to valid stages.
- **Implemented in #1484:** new stages receive a stable ID when the session
  opens. Preserve `id` and `type` as session-owned identity rather than form
  fields.
- **Partially implemented:** form changes dispatch top-level section commands
  and authoritative host updates do not echo back as local commands. Array
  insert/remove/move behavior with stable row identity lands with the shared
  array/dialog primitives in #1486.
- **Implemented on the current #1489 branch:** support auxiliary
  codebook-section sessions for nested node, edge, ego, and variable editing.
  New entities and semantically coupled changes produce a
  `CompoundEditRequest`; the host either acquires all required sections and
  applies it atomically or returns the specific lock holder or failure.
- **Implemented session policy:** do not implement generic rebasing. Remote
  dependency sections update the editor immediately and trigger metadata
  resolution and validation; loss of the edited stage's lease rolls back
  unacknowledged commands, fences undo history, and switches the editor to
  read-only.
- **Shell implemented in #1485; named compositions pending:** wrap every named
  editor in one Fresco `<Form>`. Submission flushes pending field changes,
  validates the assembled protocol, and delegates finishing to the session
  adapter. Host action chrome receives the controller and form ID through a
  slot.
- **Planned in #1490:** implement the resource gateway as a UI-to-host port for
  listing, staging uploads and secrets, preview URL resolution, inspection, and
  download.
  Imported resources remain staged until the stage finishes; discard removes
  staging, while successful finish promotes bytes and manifest/reference
  commands together. Studio's implementation will use its HTTP/S3 path rather
  than introducing a second server-side storage abstraction, consistent with
  [asset management #1278](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1278).

## Editor composition and UX

- **Implemented in the shared shell:** use one scrolling semantic form with a
  sticky section outline on wide screens and a compact jump control on smaller
  screens.
- **Implemented with an evidence-driven refinement:** derive outline states
  from registered fields. The implementation has five states — error,
  incomplete, complete, switched off, and unavailable — because a capability
  the researcher disabled and a capability whose prerequisites do not yet
  exist require different explanations and actions. Read-only is not an
  outline state; it preserves the section's real progress. Jumping focuses the
  Section heading, and field-level validation remains owned and rendered by the
  actual field.
- **Implemented in `BuilderSection`:** apply progressive disclosure: required
  and core fields remain visible, optional capabilities use explicit enable
  controls, and advanced sub-options begin collapsed. Hidden fields retain
  dormant values, and disabling a feature removes its values intentionally as
  `undefined`, never `null`.
- **To apply as named editors land:** standardize ordering as: identity/header,
  data and subjects, participant content/tasks, behavior and appearance, skip
  logic, and interviewer guidance.
- **Established by #1485:** let shared Sections accept only semantic variation
  props such as subject kind, supported modes, or copy overrides. They receive
  form state, protocol sections, validation, resources, and commands through
  package context, not stage paths, Redux selectors, or host stores.
- Compose the editors as follows; every row also includes the common stage
  header, skip logic, and interviewer-guidance Sections:

| Stage editor          | Ordered stage-specific Sections                                                            |
| --------------------- | ------------------------------------------------------------------------------------------ |
| AlterEdgeForm         | Edge type/filter; introduction; form fields                                                |
| AlterForm             | Node type/filter; introduction; form fields                                                |
| CategoricalBin        | Node type/filter; categorical prompts                                                      |
| DyadCensus            | Node type/filter; introduction; dyad prompts                                               |
| OneToManyDyadCensus   | Node type/filter; prompts; remove-after-consideration                                      |
| EgoForm               | Introduction; form fields                                                                  |
| Information           | Page content                                                                               |
| NameGenerator         | Node type; form fields; prompts; node panels; alter limits                                 |
| NameGeneratorRoster   | Node type; external source; prompts; card display; sort/search; alter limits               |
| NameGeneratorQuickAdd | Node type; quick-add settings; prompts; node panels; alter limits                          |
| Narrative             | Node type/filter; presets; background; narrative behavior                                  |
| OrdinalBin            | Node type/filter; ordinal prompts                                                          |
| Sociogram             | Node type/filter; prompts; background; automatic layout                                    |
| NetworkComposer       | Node type; node configuration; edge configuration; background                              |
| TieStrengthCensus     | Node type/filter; introduction; tie-strength prompts                                       |
| Geospatial            | Node type/filter; map access/layers; prompts; map appearance/start position                |
| Anonymisation         | Explanation; validation; encrypted variables                                               |
| FamilyPedigree        | Framing/boundary; node and edge configuration; introduction; census and nomination prompts |
| NarrativePedigree     | Source stage; diseases; at-risk statuses                                                   |

- Migrate authoring primitives once, at the first dependency-ready consumer:
  - **Done in #1485:** interface names, documentation metadata, the protocol
    field wrapper, the markdown adapter and rich-text field, and the stage-name
    input;
  - **#1486:** templates, stage-creation initial values, thumbnails, and shared
    array/dialog editors;
  - **In implementation in #1489:** codebook entity/variable editors,
    validation controls,
    variable-role indexes, and contradiction checks;
  - **#1548:** skip logic, query/rule editing, network filtering, automatic
    naming, and the pure rule-description helper;
  - **#1490 and resource-consuming editors:** gateway contracts, resource
    pickers, staging, promotion, and discard behavior.
- Retain English package copy for now; do not add an i18n framework or
  message-port API in this refactor.

## Architect migration and Studio proof

### Feature-complete gate for Architect adoption

Architect's stage-editor migration is strictly deferred until the package is
feature complete. For this migration, that means all of the following are true:

- #1486, #1487, and #1488 have delivered every named editor and the exhaustive
  generic dispatcher;
- #1489, #1490, and #1548 have delivered codebook/entity editing, compound
  edits, resources, skip logic, rule/filter editing, and automatic naming;
- package tests cover every editor family and the cross-cutting session,
  validation, resource, and compound-edit behavior;
- #1493's Redux-free, Studio-compatible proof host demonstrates editable and
  spectator views, presence and lease loss, remote codebook changes with
  attributed validation, compound edits, resources, and representative editors
  from every family; and
- the package's unit/component, Storybook interaction, typecheck, lint, and
  `knip` gates pass.

Until that gate passes, do **not** replace Architect's `StageEditorPage`, add the
live Architect session adapter, or route individual Architect stage types
through package editors as they land. Architect must remain on one complete,
internally consistent stage-editor implementation during package development.

### Deferred Architect adoption

- Architect currently imports dependency-free leaf primitives from the
  package, including interface/documentation metadata, markdown/rich-text
  behavior, and the stage-name input. These imports do not satisfy or partially
  start #1491. Its active stage dispatcher, Sections, form bridge, codebook
  transaction, and Redux stage-draft implementation have not migrated.
- **After the feature-complete gate passes**, replace Architect's
  `StageEditorPage` with a thin host container that opens an Architect session
  adapter and renders the package editor.
- Keep routing, protocol tab ownership, navigation guards, toolbar placement,
  preview-window launching, persistence, and recovery/download dialogs in
  Architect.
- Let the Architect adapter buffer section commands locally and expose one
  atomic finish operation for the stage, touched codebook entities, and asset
  manifest. Cancel discards the buffer and staged resources.
- Feed package validation and Section status into Architect's existing problem
  panel. Preview consumes the controller's exact validated work-in-progress
  protocol.
- Replace the Redux stage-draft slice, selectors, form bridge, codebook
  transaction metadata, stage-specific history hooks, and related middleware
  with the session adapter. Retain Redux only for Architect's committed
  protocol and application state.
- Update Architect's remaining codebook consumers to use the package's stable
  entity and variable editors, then remove every migrated app-local
  implementation and verify no package source imports `~/` or Architect
  modules.
- Preserve current cross-tab demotion and recovery behavior by switching the
  session to read-only and letting the Architect host present recovery actions.
- Deliver the epic as dependency-ordered, reviewable issue PRs. The first two
  slices have already merged separately; retaining a one-PR constraint would
  no longer describe the work or make the remaining review safer. Keep only one
  active implementation for each migrated primitive and do not activate a
  second stage-editor seam alongside the Architect dispatcher. Add the minor
  Architect changeset when package adoption changes the shipped Architect app;
  the private package receives no release changeset.

## Test and acceptance plan

### Evidence so far

- #1484 landed the session/controller tests, exhaustive registry-contract test,
  taxonomy tests, and a Storybook session-contract proof alongside Studio's
  real session adapter tests.
- #1485 landed focused shell, field, outline, progressive-disclosure,
  submission-merge, stage-name, styles, and shared-primitive coverage. Its final
  review evidence reported 58 protocol-builder tests, 48 Studio client tests,
  full workspace typecheck (23/23), lint, `knip`, changeset validation, and 166
  Architect E2E tests passing.
- #1489 is implemented in PR #1574 and its review-hardening follow-up #1578
  with a package-owned
  tolerant protocol context, entity and variable request builders and UI,
  validation/role/contradiction semantics, auxiliary draft handling, validation
  attribution, atomic compound-edit fencing, and a deterministic in-memory
  proof host. Its package suite currently covers 279 tests, including a real
  stage-session UI flow that creates a codebook entity and changes the stage in
  one atomic revision, serialized compound submissions, pending-publication
  reconciliation, stable retry identities across content-identical authority
  re-emissions, remote variable-type fencing for dirty validation drafts, and
  settings/asset validation attribution; Architect's stage-editor host and
  Studio's production adapter remain deliberately unchanged.
- The load-bearing shell assertions were mutation-checked during review,
  including field-path resolution, read-only submission refusal, draft
  replacement, outline registration, dormant-value precedence, and complete
  removal of a switched-off capability.
- No Architect visual baseline was adopted for either foundation slice because
  the package shell is not yet rendered by Architect; its initial consumption
  changed imports and shared primitives without changing the stage-editor
  composition.

### Package tests

- Add exhaustive registry coverage so a new `StageType` fails compilation
  until its named editor exists.
- Mount and submit every editor using representative valid fixtures; verify
  imported stages round-trip without silently losing schema-supported keys.
- Assert Section ordering, field-name ownership, outline states, progressive
  disclosure, dormant-value preservation, and accessibility semantics.
- Prove command batching, no remote-update echo, undo/redo fencing, read-only
  transitions, lease failure reporting, and compound-edit behavior.
- Verify live codebook changes rerun whole-document validation with
  attribution, following
  [validation #1277](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1277).
- Cover resource stage/promote/discard/retry behavior and new/existing entity
  editing.
- Prove critical assertions fail when guarded behavior is deliberately broken.

### Architect tests

- Adapt existing stage editor, navigation guard, tab-lock, preview, validation,
  codebook transaction, and resource tests to the session adapter.
- Run all 19 existing interface E2E specifications, including create/edit,
  invalid submission, cancel/discard, nested entity changes, preview, and
  read-only demotion.
- Add regression checks that exactly one owning-field error appears and absent
  array/form values remain `undefined`.

### Visual verification

- Regenerate only affected Architect stage-editor PNG baselines in the pinned
  environment.
- Inspect every image diff for the new outline, ordering, and progressive
  disclosure before adopting it; do not bulk-accept unrelated changes.

### Final gates

- Run package and Architect unit/component tests.
- Build Storybook for the proof host.
- Run `pnpm lint:fix`, `pnpm typecheck`, `pnpm knip`, relevant builds, and the
  full Architect E2E split.
- Confirm the old stage-editor and Sections implementation has no remaining
  call sites and the worktree is clean.

## Assumptions

- The current protocol schema and all 19 current stage types are the v1
  compatibility target.
- Studio storage/transport integration, the three-region application shell,
  localization framework, and production collaboration UI remain follow-up
  work.
- Classic Architect and Interviewer are outside scope.
- Cross-section semantic invalidity is surfaced live rather than rejected;
  only missing leases, lost epochs, or failed compound acquisition block
  writes, matching
  [collaboration #1275](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1275).
- Published protocols remain validated `CurrentProtocol` documents; sectioning
  and command history remain host/storage concerns, matching
  [protocol versioning #1276](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1276).
