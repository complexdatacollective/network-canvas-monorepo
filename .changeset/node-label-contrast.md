---
'@codaco/fresco-ui': patch
'@codaco/tailwind-config': major
---

Node labels now take black or white ink, whichever reads better across both halves of the node's two-tone fill, instead of white on every color. Six of the eight node colors failed WCAG AA with white labels. Node colors 3 and 6 are slightly deeper, so their white labels clear AA on both halves of the node. The `--node-1-contrast` to `--node-8-contrast` theme tokens, and their `node-N-contrast` Tailwind colors, are removed; use `contrast-color()` against the node color instead.
