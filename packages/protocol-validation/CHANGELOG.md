# @codaco/protocol-validation

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
