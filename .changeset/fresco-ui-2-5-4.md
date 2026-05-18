---
'@codaco/fresco-ui': patch
---

Drop `@import "tailwindcss"` from `src/styles.css`. The Tailwind v4 entry now lives inside `@codaco/tailwind-config/fresco.css` (1.0.0-alpha.11), which fresco-ui already pulls in transitively. Behavior is unchanged for consumers that go through fresco-ui — Tailwind still loads exactly once via the same chain, just initiated one layer deeper. Consumers that previously layered their own `@import "tailwindcss"` on top of fresco-ui's CSS should remove it (the duplicate caused conflicting utilities and inconsistent variant resolution; `@codaco/tailwind-config` now owns the single Tailwind entry).
