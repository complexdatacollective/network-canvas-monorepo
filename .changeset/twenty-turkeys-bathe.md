---
"@codaco/protocol-validation": major
---

### Major Update for `@codaco/protocol-validation` (Schema 8)

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
