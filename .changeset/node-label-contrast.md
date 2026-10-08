---
'@codaco/tailwind-config': minor
'@codaco/fresco-ui': patch
'@codaco/art': patch
'@codaco/background-creator': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Every named palette color now carries a paired `-contrast` ink that meets WCAG AA (4.5:1) against both the color and its `-dark` variant, for example `--kiwi-contrast` and the `kiwi-contrast` Tailwind color. The node, edge, ordinal, and categorical sequence tokens gain matching `--node-N-contrast`, `--edge-N-contrast`, `--ord-N-contrast`, and `--cat-N-contrast` tokens that point at those inks.

Purple Pizazz, Cerulean Blue, and Barbie Pink are slightly darker, because neither white nor black text met AA on them before. They now take white text.

Node labels use their color's paired ink instead of white on every color, so labels on nodes 2, 4, 5, 7, and 8 are now black. A theme that overrides `--node-N` must now also set `--node-N-contrast` to a readable ink, because the label no longer defaults to white. Badges, tags, and stage-type chips also take their ink from the palette, which fixes the white text on Sea Green and Paradise Pink that failed AA. The Background Creator swatches use the updated Purple Pizazz and Cerulean Blue, and the generated art backgrounds use the updated Cerulean Blue.
