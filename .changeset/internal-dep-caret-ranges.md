---
"@codaco/network-exporters": patch
"@codaco/network-query": patch
"@codaco/protocol-utilities": patch
---

Widen the internal `@codaco/*` dependency ranges from exact pins to caret ranges. When you install several Network Canvas packages together, npm and pnpm can now resolve a single shared version of each common dependency instead of being forced to keep multiple exact-pinned copies side by side.
