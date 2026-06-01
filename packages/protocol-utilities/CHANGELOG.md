# @codaco/protocol-utilities

## 1.0.0-alpha.0

### Minor Changes

- Initial alpha release. Provides two exports extracted from `@codaco/interview`:
  - `generateNetwork(codebook, stages, seed?, options?)` — pure function that produces an `NcNetwork` (plus per-stage metadata and step state) from a protocol codebook and stages array. Used by `@codaco/architect-web`'s preview host to populate previews and by tests that need a deterministic network shape.
  - `SyntheticInterview` — fluent builder for codebooks, stages, prompts, forms, and full interview payloads. Previously internal to `@codaco/interview`; now public so consumers can construct synthetic interview payloads outside the engine package (e.g., Storybook stories).
- Both share a `@faker-js/faker`-backed value generator for deterministic, seedable value synthesis.
- Peer/runtime dependencies: `@codaco/network-query`, `@codaco/protocol-validation`, `@codaco/shared-consts`, `@faker-js/faker`, `es-toolkit`, `uuid`, `zod`.
