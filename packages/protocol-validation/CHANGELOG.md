# @codaco/protocol-validation

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
