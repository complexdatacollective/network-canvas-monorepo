---
'@codaco/tailwind-config': minor
'@codaco/fresco-ui': patch
'@codaco/art': patch
'@codaco/architect': patch
'@codaco/background-creator': patch
'@codaco/interviewer': patch
'fresco': patch
'@codaco/site-navigation-element': patch
---

Node labels are easier to read. Nodes are now filled with a single flat color instead of a two-tone diagonal, and the node colors are adjusted, most of them darker, so their white labels stand out. All eight node colors now meet the WCAG AA contrast ratio of 4.5:1 for text.

The node colors in the default and interview themes (`--node-1` to `--node-8`) are now derived from the brand colors rather than equal to them. The brand colors Mustard, Neon Carrot, Sea Serpent, Kiwi and Paradise Pink also shift in hue, so edge, ordinal and categorical colors, the warning color, the loading spinner, Background Creator's color swatches, and generated background patterns built from them change color slightly too.

In Architect, a read-only shape picker now tells assistive technology that its shapes are unavailable, matching the read-only type picker.
