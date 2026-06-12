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
