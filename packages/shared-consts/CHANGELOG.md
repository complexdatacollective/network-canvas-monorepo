# @codaco/shared-consts

## 5.2.0

### Minor Changes

- `FamilyPedigreeStageMetadataSchema`: edges may now carry an optional internal `gameteRole` (`'egg' | 'sperm'`) recording which gamete a biological/donor parent contributed. It is persisted in stage metadata for relationship labelling and is never written to the interview network.

## 5.1.0

### Minor Changes

- Add session stage-metadata schemas as a cross-package contract for code that produces or consumes interview session state. New exports from `./stage-metadata`:
  - `StageMetadataSchema` (zod) — record of stage ID → either a FamilyPedigree metadata object or an array of DyadCensus/TieStrengthCensus tuples.
  - `DyadCensusMetadataItem` (type) — the `[promptIndex, fromId, toId, isPresent]` tuple shape.
  - `StageMetadata` (type) — inferred from `StageMetadataSchema`.

  These previously lived inside `@codaco/interview`'s session reducer; relocated here so `@codaco/protocol-utilities` (which generates conforming metadata) and `@codaco/interview` (which validates and stores it) can share a single definition. See `@codaco/interview`'s and `@codaco/protocol-utilities`'s changelogs for the corresponding consumer updates.

## 5.0.0

### Major Changes

- 3849e0e: Updated zod to version 4. Consumers must also use zod 4 to avoid type conflicts.

## 4.0.0

### Major Changes

- Improve types for variables
- b0fa339: # Implement bundling with Vite for @codaco/shared-consts

  This is a major breaking change that transitions the package from exporting raw TypeScript files to providing bundled JavaScript output.

  ## Changes
  - Added Vite library mode configuration with dual format support (ESM + CJS)
  - Added vite-plugin-dts for TypeScript declaration generation
  - Updated package.json with proper exports configuration for both ESM and CJS
  - Added build scripts and development workflow
  - Updated version to 3.0.0 to reflect the breaking change

  ## Breaking Changes
  - Package now exports bundled JavaScript instead of raw TypeScript
  - Build step is now required before publishing
  - Import paths remain the same, but the underlying module format has changed

  This change improves compatibility with legacy applications while maintaining support for modern ESM environments.

### Patch Changes

- a4969c4: small changes
- 9ec9284: export additional types
- 304c64f: Make ego a required property of NcNetwork

## 1.0.0-alpha.3

### Patch Changes

- a4969c4: small changes

## 1.0.0-alpha.2

### Patch Changes

- 304c64f: Make ego a required property of NcNetwork

## 1.0.0-alpha.1

### Patch Changes

- 9ec9284: export additional types

## 1.0.0-alpha.0

### Major Changes

- Improve types for variables
