# @codaco/protocol-utilities

## 2.0.0

### Major Changes

- 6420d8b: **Breaking:** `generateNetwork` no longer takes `seed` as a positional argument. It is now part of the options object, so callers no longer need to pass `undefined` to reach the other options:

  ```ts
  // Before
  generateNetwork(codebook, stages, 42, { simulateDropOut: true });
  generateNetwork(codebook, stages, undefined, { simulateDropOut: true });

  // After
  generateNetwork(codebook, stages, { seed: 42, simulateDropOut: true });
  generateNetwork(codebook, stages, { simulateDropOut: true });
  ```

### Minor Changes

- c8978ce: Add an `inProgressStageIndex` option to `generateNetwork` that treats one stage as in progress rather than complete. For interaction-driven stages (OrdinalBin, CategoricalBin, Sociogram) a subset of subject nodes is left without a value for the stage's prompt variables, so previews of those stages still have unplaced nodes to interact with. Architect's preview passes the previewed stage index, leaving all other stages fully populated.

### Patch Changes

- d0ca1be: Fix two NameGeneratorRoster bugs and remove a dead schema field.
  - **Roster cards no longer show a raw UID.** When the name heuristic could not
    resolve a label for an external-roster node (e.g. the asset came from a
    preview interview export whose attribute keys are variable UUIDs absent from
    the running codebook, or the subject has no populated text variable), the
    card title fell back to the node's content-hash `_uid` — an opaque "random
    ID". The new `resolveRosterNodeLabel` falls back to the first usable
    attribute value, then to a stable `Unnamed {subject} {n}` placeholder.
  - **DataCards shrink to fit narrow panels.** `GridLayout`'s
    `repeat(auto-fill, minmax(Npx, 1fr))` forced columns to at least `minItemWidth`
    even in a narrower container, so a single roster card overflowed its panel at
    the default resizable width (observed on iPad), breaking drag-and-drop. The
    column floor is now `min(Npx, 100%)` so a lone column shrinks to fit.
  - **The roster panel can't be resized narrower than a card.** `ResizableFlexPanel`
    gains an optional `minSizePx` (a hard pixel floor for the first panel, enforced
    by the resize hook and a CSS backstop). NameGeneratorRoster sets it to the card
    width plus chrome, so the resize handle stops before a card would overflow.
  - **Removed the unused `cardOptions.displayLabel`.** It was introduced in the v8
    schema but was never read by any application (legacy or current) and cannot be
    set in Architect. Dropped from the schema, the `protocol-utilities` types, and
    the `SyntheticInterview` builder.

- Updated dependencies [dd13556]
- Updated dependencies [dd13556]
- Updated dependencies [8be592d]
- Updated dependencies [545edda]
- Updated dependencies [d0ca1be]
  - @codaco/network-query@1.1.0
  - @codaco/protocol-validation@11.7.0
  - @codaco/shared-consts@5.3.0

## 1.0.0

### Minor Changes

- Extract the synthetic network generator and `SyntheticInterview` builder into a new workspace package, `@codaco/protocol-utilities`.

  **Breaking for `@codaco/interview`:** `generateNetwork`, `GenerateNetworkOptions`, `GenerateNetworkResult`, and `StageMetadataSchema` are no longer exported from `@codaco/interview`. Import `generateNetwork` and friends from `@codaco/protocol-utilities`; import `StageMetadataSchema` (and the related `DyadCensusMetadataItem` / `StageMetadata` types) from `@codaco/shared-consts`.

  ```diff
  - import { generateNetwork, StageMetadataSchema } from '@codaco/interview';
  + import { generateNetwork } from '@codaco/protocol-utilities';
  + import { StageMetadataSchema } from '@codaco/shared-consts';
  ```

  The new `@codaco/protocol-utilities` also publicly exports `SyntheticInterview` (previously internal to `@codaco/interview`), along with the `ComponentType` and `VariableOption` types used by its public methods.

  `@codaco/shared-consts` gains the session-stage-metadata schemas (`StageMetadataSchema`, `DyadCensusMetadataItem`, `StageMetadata`) as the cross-package contract between synthetic-generation output and the interview engine's session state.

  `@codaco/interview`'s runtime entry point and other public exports are untouched. The interview engine no longer carries the synthetic-data code in its published bundle.

## 1.0.0-alpha.0

### Minor Changes

- Initial alpha release. Provides two exports extracted from `@codaco/interview`:
  - `generateNetwork(codebook, stages, seed?, options?)` — pure function that produces an `NcNetwork` (plus per-stage metadata and step state) from a protocol codebook and stages array. Used by `@codaco/architect-web`'s preview host to populate previews and by tests that need a deterministic network shape.
  - `SyntheticInterview` — fluent builder for codebooks, stages, prompts, forms, and full interview payloads. Previously internal to `@codaco/interview`; now public so consumers can construct synthetic interview payloads outside the engine package (e.g., Storybook stories).
- Both share a `@faker-js/faker`-backed value generator for deterministic, seedable value synthesis.
- Peer/runtime dependencies: `@codaco/network-query`, `@codaco/protocol-validation`, `@codaco/shared-consts`, `@faker-js/faker`, `es-toolkit`, `uuid`, `zod`.
