---
"@codaco/shared-consts": major
---

# Implement bundling with Vite for @codaco/shared-consts

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
