/**
 * see: https://zod.dev/metadata
 *
 * Augments zod's GlobalMeta interface so schemas can carry hint text that we
 * display to users filling out forms. Lives in `zod/v4/core` and is re-exported
 * by both `zod` and `zod/mini`, so augmenting it once here is enough.
 *
 * Two things this file gets right that the previous version did not:
 *  - `interface` (which merges) instead of `type` (which does not).
 *  - The `export {}` below makes this file a module, so the `declare module`
 *    block behaves as a module augmentation rather than ambient module
 *    replacement (which would shadow zod's own types).
 */

declare module 'zod/v4/core' {
  interface GlobalMeta {
    hintText?: string;
  }
}

export {};
