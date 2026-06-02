---
'@codaco/interview': minor
'@codaco/protocol-utilities': minor
'@codaco/shared-consts': minor
---

Extract the synthetic network generator and `SyntheticInterview` builder into a new workspace package, `@codaco/protocol-utilities`.

**Breaking for `@codaco/interview`:** `generateNetwork`, `GenerateNetworkOptions`, `GenerateNetworkResult`, and `StageMetadataSchema` are no longer exported from `@codaco/interview`. Import `generateNetwork` and friends from `@codaco/protocol-utilities`; import `StageMetadataSchema` (and the related `DyadCensusMetadataItem` / `StageMetadata` types) from `@codaco/shared-consts`.

```diff
- import { generateNetwork, StageMetadataSchema } from '@codaco/interview';
+ import { generateNetwork } from '@codaco/protocol-utilities';
+ import { StageMetadataSchema } from '@codaco/shared-consts';
```

The new `@codaco/protocol-utilities` also publicly exports `SyntheticInterview` (previously internal to `@codaco/interview`), along with the `ComponentType` and `VariableOption` types used by its public methods.

`@codaco/shared-consts` gains the session-stage-metadata schemas (`StageMetadataSchema`, `DyadCensusMetadataItem`, `StageMetadata`) as the cross-package contract between synthetic-generation output and the interview engine's session state.

`@codaco/interview`'s runtime entry point and other public exports are untouched. The interview engine no longer carries the synthetic-data code in its published bundle.
