---
"@codaco/protocol-validation": patch
---

Fix type inference in zod-mock-extension generateMock function

- Fixed `base` parameter type inference in `generateMock()` callbacks by using `z.output<this>` instead of explicit type parameters
- Added excess property checking for object schemas to catch extra properties at compile time
- The `ExactReturn` type utility now correctly handles unions, primitives, arrays, and Record types without false positives
