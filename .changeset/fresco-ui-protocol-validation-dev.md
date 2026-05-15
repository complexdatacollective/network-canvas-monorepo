---
'@codaco/fresco-ui': minor
---

Move `@codaco/protocol-validation` from `peerDependencies` to `devDependencies`. All usages inside fresco-ui are `import type` only (`Variable`, `StageSubject`, `Codebook`, `AdditionalAttributes` in the form layer's type signatures), so nothing ends up in the runtime bundle. Hosts that consume fresco-ui's form types must declare `@codaco/protocol-validation` themselves; without it, fresco-ui's emitted `.d.ts` files won't typecheck cleanly.
