---
'@codaco/protocol-validation': patch
---

Tighten two schema-8 coherence gaps where silently-ignored configuration was accepted:

- OrdinalBin `prompts[].color` is now restricted to the ten `ord-color-seq-1`–`ord-color-seq-10` palette values the interface can render; any other string was a silent no-op. The v7→v8 migration drops out-of-palette values so migrated prompts fall back to the default colour.
- CategoricalBin `otherOptionLabel` or `otherVariablePrompt` set without `otherVariable` is now rejected; without `otherVariable` no 'other' bin renders, so the properties were silently ignored. The v7→v8 migration drops the orphaned properties.
