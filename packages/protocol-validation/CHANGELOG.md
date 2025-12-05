# @codaco/protocol-validation

## 8.0.0

### Major Changes

- edc9dcb: added relationship to ego variables to edges for family tree census #315

## 7.2.0

### Minor Changes

- 26ae10b: Add comprehensive migration tests and wildcard support for schema transformations

  - Add comprehensive test suite for v7 to v8 migration covering all transformations (displayVariable removal, Toggle options removal, filter type transformations, schema version updates)
  - Extend traverseAndTransform utility to support wildcard (\*) syntax in transformation paths
  - Add 9 new tests for wildcard functionality including nested paths, multiple wildcards, and edge cases
  - Create Protocol<V> generic type for discriminated union extraction by schema version
  - Fix TypeScript compilation errors using schema validation and optional chaining patterns
  - Update extractProtocol utility to use VersionedProtocol type for better type safety

## 7.1.0

### Minor Changes

- c0c9e2b: Fix typo in filter rule operators

## 7.0.1

### Patch Changes

- dc865db: Second draft of family tree census
- d795dd9: Changeset
- 9c213e7: Add node and edge color sequences
- f0fd48b: Implement initial family tree census
- 018f3a0: Adjust property names

## 7.0.0

### Major Changes

- 7ec964b: Refactored protocol-validation API to return the Zod validation result directly, which is a result object with success and error properties.

## 6.0.0

### Major Changes

- 3849e0e: Updated zod to version 4. Consumers must also use zod 4 to avoid type conflicts.

### Patch Changes

- Updated dependencies [3849e0e]
  - @codaco/shared-consts@5.0.0

## 5.0.2

### Patch Changes

- 793bf39: Fix TypeScript declaration merging errors by disabling rollupTypes in vite-plugin-dts. This resolves "Individual declarations in merged declaration must be all exported or all local" errors and "const initializer in ambient context" issues when importing the package.

## 5.0.1

### Patch Changes

- 29287ef: Schema 8 migration fixes/improvements:
  - Fix displayVariable removal
  - Remove options from Toggle variables

## 5.0.0

### Major Changes

- 97fd038: # Release stable versions for protocol-validation

  This changeset marks the transition from alpha/prerelease to stable versions for protocol-validation package.

  ## Changes

  - **@codaco/protocol-validation**: Upgraded from `4.0.0-alpha.11` → `4.0.0` (stable)

  ## Context

  - Both shared-consts (3.0.0) and protocol-validation are now considered stable and ready for production use
  - This removes the alpha/prerelease status and indicates these packages have reached production readiness

  ## Breaking Changes

  This is not a breaking change in terms of functionality - the API remains the same. The version bump reflects the move from alpha to stable status.

- ae26f2a: ### Major Update for `@codaco/protocol-validation` (Schema 8)

  #### Key Changes:

  - **New Stage Types Added**:

    - `Geospatial`
    - `Anonymisation`
    - `OneToManyDyadCensus`
    - `FamilyTreeCensus`

  - **Expanded `assetManifest` Schema**:

    - Added a new `apiAssetSchema`, enabling support for API keys.
    - Expanded `fileAssetSchema` with the addition of the `geojson` type, enabling support for geospatial data.

  - **New `experiments` Property on `Protocol`**:
    - Introduced a new `experiments` property with an `encryptNames` boolean.

### Patch Changes

- a4969c4: small changes
- 86aa8c0: separate out node and edge based stage subjects so that they can be extracted
- Improve types for variables
- 4ea6b33: Ensure development protocol can validate
- 43c3304: make data source required property in panel schema
- 3605f81: export even more types
- df6da79: Make migration for schema 8 return proocol object
- 04aff9d: Correct SortOrderSchema
- 37df451: Export stage types
- ec38a8a: change anonymisation schema
- 3e394d5: use specific stage subject types
- ceda2af: Export additional schemas to support prisma json transformer extension
- 551b473: Improve prompt type
- Updated dependencies [a4969c4]
- Updated dependencies
- Updated dependencies [9ec9284]
- Updated dependencies [304c64f]
- Updated dependencies [b0fa339]
  - @codaco/shared-consts@4.0.0

## 4.0.0-alpha.11

### Patch Changes

- df6da79: Make migration for schema 8 return proocol object

## 4.0.0-alpha.10

### Patch Changes

- 551b473: Improve prompt type

## 4.0.0-alpha.9

### Patch Changes

- 43c3304: make data source required property in panel schema
- 04aff9d: Correct SortOrderSchema

## 4.0.0-alpha.8

### Patch Changes

- 3e394d5: use specific stage subject types

## 4.0.0-alpha.7

### Patch Changes

- 86aa8c0: separate out node and edge based stage subjects so that they can be extracted

## 4.0.0-alpha.6

### Patch Changes

- a4969c4: small changes

## 4.0.0-alpha.5

### Patch Changes

- ceda2af: Export additional schemas to support prisma json transformer extension

## 4.0.0-alpha.4

### Patch Changes

- 3605f81: export even more types

## 4.0.0-alpha.3

### Patch Changes

- 4ea6b33: Ensure development protocol can validate
- 37df451: Export stage types
- ec38a8a: change anonymisation schema

## 4.0.0-alpha.2

### Patch Changes

- Improve types for variables

## 4.0.0-alpha.1

### Major Changes

- ae26f2a: ### Major Update for `@codaco/protocol-validation` (Schema 8)

  #### Key Changes:

  - **New Stage Types Added**:

    - `Geospatial`
    - `Anonymisation`
    - `OneToManyDyadCensus`
    - `FamilyTreeCensus`

  - **Expanded `assetManifest` Schema**:

    - Added a new `apiAssetSchema`, enabling support for API keys.
    - Expanded `fileAssetSchema` with the addition of the `geojson` type, enabling support for geospatial data.

  - **New `experiments` Property on `Protocol`**:
    - Introduced a new `experiments` property with an `encryptNames` boolean.
