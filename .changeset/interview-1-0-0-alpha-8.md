---
'@codaco/interview': prerelease
---

Shell now mirrors `data-theme-interview` onto `<html>` via a `useLayoutEffect` (set on mount, removed on unmount), in addition to the existing static attribute on its `<main>`. Pairs with `@codaco/tailwind-config@1.0.0-alpha.8`'s `:root[data-theme-interview]` selectors so `1rem` tracks the interview theme's responsive font-size override (16/18/20px at tablet / desktop) — every `text-*` and `p-*` / `gap-*` utility now scales together without the em-compounding regression that landed in alpha.7.

The marker on `<main data-theme-interview>` is preserved as a stable selector for tests, e2e fixtures, and storybook hooks.

The interview package's Storybook decorator (`.storybook/preview.tsx`) does the same: it mounts an `InterviewThemeRoot` component that toggles the attribute on `<html>` so every story in this package renders in interview mode.
