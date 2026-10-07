---
'@codaco/fresco-ui': patch
'@codaco/tailwind-config': patch
---

Node labels now take black or white ink, whichever contrasts more with the node's color, instead of white on every color. Six of the eight node colors failed WCAG AA with white labels, and colors a protocol sets for itself now get readable labels too. Node colors 3 and 6 are slightly deeper, so their white labels clear AA on both halves of the node. The unused `--node-1-contrast` to `--node-8-contrast` theme tokens, and their `node-N-contrast` Tailwind colors, are removed.
