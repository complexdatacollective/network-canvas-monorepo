---
'@codaco/tailwind-config': prerelease
---

Drop the `@import '../theme.css' reference;` from `themes/interview.css` and inline the two breakpoint values in its `@media` queries. The reference re-import was needed for `theme(--breakpoint-*)` to resolve, but Tailwind v4's `reference` modifier flips a `@theme` block into reference-only mode globally — that retroactively cancels the `@theme static` :root emission from the earlier non-reference import of `theme.css`, leaving every `--color-*` token undeclared at runtime in any host that loads both themes (e.g. the interview package's Storybook). Hardcoded breakpoints lose single-source-of-truth, but the alternative is a much larger blast radius. The two hardcoded values are kept in sync with `--breakpoint-tablet-landscape-max` (1279px) and `--breakpoint-desktop-lg` (1920px) and a comment cross-references them.
