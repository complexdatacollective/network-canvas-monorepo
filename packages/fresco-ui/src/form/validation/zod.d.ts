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
 *
 * This file is only part of a TypeScript program when a tsconfig's `include`
 * glob picks it up, which happens for fresco-ui's own build but not for
 * consumers that typecheck an individual source file (e.g. `helpers.tsx`)
 * directly under their own tsconfig. `./functions.ts` — the module every
 * validation schema and every reader of this metadata already imports —
 * pulls this file into the program with a type-only side-effect import (a
 * value-level `import`/`/// <reference>` would either break Vite's runtime
 * resolution of this declaration-only file or trip the project's
 * triple-slash-reference lint rule).
 */

declare module 'zod/v4/core' {
  interface GlobalMeta {
    hint?: string;
  }
}

// oxlint-disable-next-line require-module-specifiers -- This line is load-bearing; see comment at top.
export {};
