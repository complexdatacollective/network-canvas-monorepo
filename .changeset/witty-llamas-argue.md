---
'@codaco/protocol-utilities': major
---

**Breaking:** `generateNetwork` no longer takes `seed` as a positional argument. It is now part of the options object, so callers no longer need to pass `undefined` to reach the other options:

```ts
// Before
generateNetwork(codebook, stages, 42, { simulateDropOut: true });
generateNetwork(codebook, stages, undefined, { simulateDropOut: true });

// After
generateNetwork(codebook, stages, { seed: 42, simulateDropOut: true });
generateNetwork(codebook, stages, { simulateDropOut: true });
```
