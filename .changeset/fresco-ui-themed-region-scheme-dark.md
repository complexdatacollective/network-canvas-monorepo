---
"@codaco/fresco-ui": minor
---

`<ThemedRegion theme="interview">` now also applies Tailwind's `scheme-dark` utility (`color-scheme: dark`) on the wrapper. Interview is a dark-only palette, so native UI inside the region — form controls, scrollbars, autofill backgrounds — now matches the themed surface without the consumer having to add `scheme-dark` themselves. Consumers that previously hardcoded `scheme-dark` alongside `<ThemedRegion theme="interview">` can drop it.
