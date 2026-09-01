# Extract Architect stage editors into `@codaco/protocol-builder`

**Date:** 2026-08-27
**Status:** Proposed
**Scope:** Architect stage editing, shared protocol-authoring components, and a
Studio-compatible protocol-builder package boundary

## Summary

Create a private, source-first `@codaco/protocol-builder@0.1.0` package
containing all 19 stage editors, their Sections, nested form/dialog components,
validation behavior, and protocol-specific editing primitives. Architect will
fully adopt the package and delete its existing Redux-coupled stage-editor
implementation.

The package will follow Studio's accepted model: section-scoped commands,
leases and presence supplied by the host, live cross-section updates, and
explicit compound edits. This aligns with
[Studio's editor architecture](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1272),
[collaboration model](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1275),
and
[sync ADR](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1247).

## Architecture and public API

- Add `packages/protocol-builder` with raw-TypeScript exports, `styles.css`,
  tests, and a local Storybook proof host. Keep it private and omit publishing
  configuration.
- Export:
  - a generic, exhaustive `StageEditor` dispatcher;
  - one named component for every `StageType`, from
    `AlterEdgeFormStageEditor` through `NarrativePedigreeStageEditor`;
  - `ProtocolBuilderSession`, snapshot/access/presence types,
    compound-edit types, `StageEditorController`, and
    `useStageEditorController`;
  - `ProtocolBuilderResourceGateway` and resource descriptor/staging types;
  - entity-type and variable editors needed by both stage editors and
    Architect's codebook surface.
- Keep Sections, form controls, validation controls, and stage-specific
  implementation components internal. Where Architect's printable summary
  needs shared rule semantics, extract a pure rule-description helper rather
  than exporting interactive Section internals.
- Move the client-safe section taxonomy into `@codaco/studio-sync` so
  Architect, Studio, and protocol-builder share the same
  stage/node/edge/ego/assets identities and `set`/`unset`/array command
  vocabulary.
- Model `ProtocolBuilderSession` as an external store with
  `subscribe`/`getSnapshot`. Its snapshot contains the edited section
  document, assembled protocol sections, manifest revision, access state,
  presence, attribution, pending commands, and history state.
- Keep possibly invalid form drafts typed separately from
  `Stage`/`CurrentProtocol`. Only expose `validatedProtocol` after canonical
  validation succeeds; never cast partial drafts to valid stages.
- Assign new stages a stable ID when the session opens. Preserve `id` and
  `type` as session-owned identity rather than form fields.
- Coalesce form changes into top-level section commands, using array
  insert/remove/move commands when row identity is available. Authoritative
  host updates must not echo back as local commands.
- Support auxiliary codebook-section sessions for nested node, edge, ego, and
  variable editing. New entities and semantically coupled changes produce a
  `CompoundEditRequest`; the host either acquires all required sections and
  applies it atomically or returns the specific lock holder or failure.
- Do not implement generic rebasing. Remote dependency sections update the
  editor immediately and trigger metadata resolution and validation; loss of
  the edited stage's lease rolls back unacknowledged commands, fences undo
  history, and switches the editor to read-only.
- Wrap every named editor in one Fresco `<Form>`. Submission flushes pending
  field changes, validates the assembled protocol, and delegates finishing to
  the session adapter. Host action chrome receives the controller and form ID
  through a slot.
- Implement the resource gateway as a UI-to-host port for listing, staging
  uploads and secrets, preview URL resolution, inspection, and download.
  Imported resources remain staged until the stage finishes; discard removes
  staging, while successful finish promotes bytes and manifest/reference
  commands together. Studio's implementation will use its HTTP/S3 path rather
  than introducing a second server-side storage abstraction, consistent with
  [asset management #1278](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1278).

## Editor composition and UX

- Use one scrolling semantic form with a sticky section outline on wide
  screens and a compact jump control on smaller screens.
- Derive outline states from registered fields: error, incomplete, complete,
  or disabled. Jumping focuses the Section heading; field-level validation
  remains owned and rendered by the actual field.
- Apply progressive disclosure: required and core fields remain visible,
  optional capabilities use explicit enable controls, and advanced sub-options
  begin collapsed. Hidden fields retain dormant values, and disabling a feature
  removes its values intentionally as `undefined`, never `null`.
- Standardize ordering as: identity/header, data and subjects, participant
  content/tasks, behavior and appearance, skip logic, and interviewer guidance.
- Let shared Sections accept only semantic variation props such as subject
  kind, supported modes, or copy overrides. They receive form state, protocol
  sections, validation, resources, and commands through package context, not
  stage paths, Redux selectors, or host stores.
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

- Move interface names, templates, documentation metadata, thumbnails,
  automatic naming, query/rule editing, protocol field wrappers, array/dialog
  editors, variable-role checks, contradiction checks, and resource pickers
  with the editors.
- Retain English package copy for now; do not add an i18n framework or
  message-port API in this refactor.

## Architect migration and Studio proof

- Replace Architect's `StageEditorPage` with a thin host container that opens
  an Architect session adapter and renders the package editor.
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
- Add a Redux-free package Storybook harness backed by the real Studio
  command/apply types. Demonstrate editable and spectator views,
  presence/lease loss, remote codebook changes causing attributed validation,
  compound node creation, and staged resources. Do not add a Studio route or
  connect the Studio transport yet.
- Land the extraction as one feature PR with reviewable commits; do not merge
  a duplicate package seam while old Architect call sites remain active. Add a
  minor Architect changeset; the private package receives no release changeset.

## Test and acceptance plan

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
