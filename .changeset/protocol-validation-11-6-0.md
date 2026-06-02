---
'@codaco/protocol-validation': minor
---

Add `VariableOption` and `VariableOptionValue` types, derived from the existing `VariableOptions` (`z.infer<typeof categoricalOptionsSchema>`). `VariableOption = VariableOptions[number]`, `VariableOptionValue = VariableOption['value']`. Replaces hand-rolled shims that previously lived in `@codaco/interview`'s `utils/codebook.ts` and `@codaco/protocol-utilities`'s `types.ts`.
