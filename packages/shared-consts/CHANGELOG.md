# @codaco/shared-consts

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
