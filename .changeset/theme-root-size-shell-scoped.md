---
'@codaco/tailwind-config': prerelease
'@codaco/interview': prerelease
---

The viewport-width ramp for the `--theme-root-size` type-scale sentinel (1rem → 1.125rem → 1.25rem) now lives on the interview `Shell`'s `<main>` instead of on every `[data-theme-interview]` element. The `[data-theme-interview]` rule in `@codaco/tailwind-config` keeps only the non-responsive base (`--theme-root-size: 1rem` + `font-size`), so only the full-screen interview scales its type with the viewport — other themed regions (app chrome, Storybook wrappers, embedded previews) stay at the base size.

The mid-tier breakpoint is corrected from a hardcoded `1080px` to the `--breakpoint-laptop` token (`1280px`); the upper tier remains `--breakpoint-desktop-lg` (`1920px`). Between 1080–1279px the interview now renders at the base 1rem instead of 1.125rem.
