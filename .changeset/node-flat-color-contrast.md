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

Node labels are easier to read. The node colors are adjusted, most of them darker, so their white labels stand out: all eight node colors now meet the WCAG AA contrast ratio of 4.5:1 for text, and the lighter half of each node stands out at 3:1 against the interview background. Nodes keep their two-tone diagonal.

The node colors in the default and interview themes (`--node-1` to `--node-8`) are now derived from the brand colors rather than equal to them. The brand color Neon Coral is slightly lighter and less saturated, and Mustard, Neon Carrot, Sea Serpent, Kiwi and Paradise Pink shift in hue, so edge, ordinal and categorical colors, the destructive and warning colors, the loading spinner, Background Creator's color swatches, and generated background patterns built from them change color slightly too.

In Architect, a read-only shape picker now tells assistive technology that its shapes are unavailable, matching the read-only type picker.
