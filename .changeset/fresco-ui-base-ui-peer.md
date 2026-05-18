---
'@codaco/fresco-ui': minor
---

Move `@base-ui/react` from `dependencies` to `peerDependencies` (range `^1.4.0`). Previously it shipped as a regular dependency pinned to exact `1.4.0`, which caused dual-install issues when consumers (or sibling peer deps like `@codaco/interview`) wanted a different patch version. Hosts must now declare `@base-ui/react` themselves.
