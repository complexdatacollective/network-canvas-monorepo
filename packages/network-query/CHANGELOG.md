# @codaco/network-query

## 1.2.5

### Patch Changes

- Updated dependencies ([2eafe92](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2eafe92060cd4aa1dbcde5c2b79d00d87bba9159), [e322f90](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e322f9040c9f5f4218ea8d7da1aa286ef4e719e9), [4ea797d](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4ea797d7159622173f7a605cf2ce6cac1884e854), [d7e93c5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/d7e93c571df1fea1a8fc71d8c9d4f6692e2dbe7c), [55f5549](https://github.com/complexdatacollective/network-canvas-monorepo/commit/55f554975bc6731a7f5bc94dde0a7000b64ce2da), [2bea7ee](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2bea7eed99b1f0f5056144a1d6ac30855c36513e), [02ead76](https://github.com/complexdatacollective/network-canvas-monorepo/commit/02ead76454267cb9fcc8e2810eb6189e6d3aabc9), [eea0b5a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eea0b5acf7c4b852a57c6b57c5a504a34a7d11c0), [eee19fb](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eee19fb93d4cb57d3c4d256971da78df15730a88), [b2ca402](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b2ca402a852b5527e0455c7ff2949da3be50dccd), [3ae3a94](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3ae3a9438da400fc357a0c71721d45cd32f3a7ac), [01aaed2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/01aaed2d0bcd7ce203f50952ddd3e4ddeaed143a))
  - @codaco/shared-consts@6.1.0
  - @codaco/protocol-validation@14.0.0

## 1.2.4

### Patch Changes

- Updated dependencies ([c599dac](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c599dacf78b18efb7d0c5c5fad4d38644a57e775), [e9a6522](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e9a652266ef9ddfa7fc42de1c8123bd7011c52a1), [fdb3b56](https://github.com/complexdatacollective/network-canvas-monorepo/commit/fdb3b56440f6cad89a44718d24ff725be3bb5e15))
  - @codaco/protocol-validation@13.0.0
  - @codaco/shared-consts@6.0.0

## 1.2.3

### Patch Changes

- Updated dependencies [9c25292]
- Updated dependencies [c8c4614]
  - @codaco/protocol-validation@12.0.0

## 1.2.2

### Patch Changes

- 98a31e7: Widen the internal `@codaco/*` dependency ranges from exact pins to caret ranges. When you install several Network Canvas packages together, npm and pnpm can now resolve a single shared version of each common dependency instead of being forced to keep multiple exact-pinned copies side by side.
- Updated dependencies [c7e767c]
  - @codaco/protocol-validation@11.11.0

## 1.2.1

### Patch Changes

- Updated dependencies [34d2bfd]
  - @codaco/protocol-validation@11.10.0

## 1.2.0

### Minor Changes

- b467615: Add forward skip destinations to schema 8, shared skip evaluation, synthetic
  network generation, and the interview runtime. Hidden stages can now continue
  at a later stage or route to the interview finish screen, with live route
  recalculation, safe Back navigation, and confirmed one-screen overrides for
  unavailable stages.

  Also keep shared Select fields correctly labelled and contained when option
  labels are long. The bundled sample protocol now ends the interview when a
  participant declines consent.

### Patch Changes

- Updated dependencies [367e702]
- Updated dependencies [e6c58c2]
- Updated dependencies [c16a1d9]
- Updated dependencies [803e4e7]
- Updated dependencies [179952e]
- Updated dependencies [b467615]
  - @codaco/protocol-validation@11.9.0
  - @codaco/shared-consts@5.5.0

## 1.1.2

### Patch Changes

- Updated dependencies [272c1b2]
  - @codaco/protocol-validation@11.8.1

## 1.1.1

### Patch Changes

- Updated dependencies [38aff29]
- Updated dependencies [37006d0]
- Updated dependencies [fd2a7e2]
- Updated dependencies [a171f96]
- Updated dependencies [3218905]
- Updated dependencies [0f577dd]
- Updated dependencies [7970d1f]
- Updated dependencies [c56b75a]
  - @codaco/protocol-validation@11.8.0
  - @codaco/shared-consts@5.4.0

## 1.1.0

### Minor Changes

- 8be592d: Store categorical attribute values consistently as arrays of selected option values.

  Previously the CategoricalBin interface wrote a bare scalar while CheckboxGroup / ToggleButtonGroup wrote arrays, and consumers carried bridging helpers to tolerate both shapes. Categorical attributes are now always arrays (a single selection is a one-element array), and the bridges have been removed:

  - `interview`: `CategoricalBin` writes a single-element array; the node-shape resolver, categorical sorter, and bin matcher read the array contract directly.
  - `network-query`: `EXACTLY` / `NOT` use deep equality and `OPTIONS_*` use array length — the scalar-categorical fallbacks (`categoricalEqual`, scalar `optionsLength`) are gone.
  - `network-exporters`: `isCategoricalOptionSelected` checks array membership only.
  - `shared-consts`: `VariableValue` types categorical as an array of option values.
  - `protocol-validation`: the v7→v8 migration wraps existing scalar categorical filter / skip-logic rule operands (`EXACTLY` / `NOT` / `INCLUDES` / `EXCLUDES`) in a single-element array.
  - `interview` (FamilyPedigree): the `relationshipType` edge variable (a categorical) is now written and read as a single-element array, conforming to the contract so its values export and query correctly.
  - `shared-consts`: adds the canonical `RelationshipType` type and `RELATIONSHIP_TYPE_OPTIONS`, shared between Architect (which locks the categorical edge variable's options) and the FamilyPedigree interface so they cannot drift.

  Collected interview networks holding scalar categorical values must be migrated by the host application (tracked for Fresco).

### Patch Changes

- dd13556: Fix query-predicate schema-conformance bugs found in a release audit:

  - Treat absent/undefined attributes the same as `null` for `EXISTS` / `NOT_EXISTS`.
  - Guard numeric comparison operators against null and non-numeric values: datetime values are compared chronologically, and an unanswered value is no longer coerced to `0` (so `LESS_THAN` stops wrongly matching unanswered nodes).
  - Treat an invalid `CONTAINS` / `DOES_NOT_CONTAIN` regular expression as a non-match instead of throwing (the operators remain regular-expression matches, matching the architect rule editor's regex value input).

- Updated dependencies [dd13556]
- Updated dependencies [8be592d]
- Updated dependencies [545edda]
- Updated dependencies [d0ca1be]
  - @codaco/protocol-validation@11.7.0
  - @codaco/shared-consts@5.3.0

## 1.0.1

### Patch Changes

- Republish to fix 1.0.0 which was published with an empty `dist/` folder. The build script's "no pending changesets" fallback excluded `@codaco/network-query`, so its build artifacts were never produced before publish.

## 1.0.0

### Major Changes

- e31e28d: Substantial rewrite of `@codaco/network-query` with source converted to TypeScript and tests reorganized under `src/__tests__/`.

### Patch Changes

- Updated dependencies [f1dbd8d]
  - @codaco/protocol-validation@11.4.0

## 0.1.2

### Patch Changes

- Updated dependencies [b8b9fb0]
  - @codaco/protocol-validation@11.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [4f2d778]
  - @codaco/protocol-validation@11.1.1
