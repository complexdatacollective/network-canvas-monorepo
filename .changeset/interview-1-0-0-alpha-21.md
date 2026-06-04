---
'@codaco/interview': prerelease
---

**Public-API removal.** `generateNetwork`, `GenerateNetworkOptions`, `GenerateNetworkResult`, and `StageMetadataSchema` are no longer exported from `@codaco/interview`. Import them from their new homes:

```diff
- import { generateNetwork, StageMetadataSchema } from '@codaco/interview';
+ import { generateNetwork } from '@codaco/protocol-utilities';
+ import { StageMetadataSchema } from '@codaco/shared-consts';
```

The synthetic-data code (`generateNetwork`, `SyntheticInterview`, plus shared `ValueGenerator`/types/constants) has moved into the new `@codaco/protocol-utilities` workspace package. The session stage-metadata schemas have moved into `@codaco/shared-consts`. The interview runtime bundle no longer carries either.

Internal cleanup: removed the `~/utils/codebook.ts` shim (replaced by canonical types from `@codaco/protocol-validation`); redirected `DyadCensusMetadataItem` imports to `@codaco/shared-consts`; Storybook stories import `SyntheticInterview` from `@codaco/protocol-utilities` (devDependency); dropped now-unused `zod` from `dependencies` (transitive usage via `@codaco/protocol-validation` and `@codaco/shared-consts` is unaffected).
