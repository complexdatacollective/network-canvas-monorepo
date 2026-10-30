---
'@codaco/fresco-ui': major
'@codaco/tailwind-config': minor
'@codaco/architect': minor
---

Every kind of stage now has one colour and one icon, the same in every app. Stages that do similar work share a colour family: naming people in coral reds, describing them in blues, sorting them in oranges, mapping in teal, finding ties in purples, reflecting in sea greens, and the screens that collect no network data in greys. Every colour carries a white icon at the WCAG AA contrast ratio of 4.5:1. Eight interfaces get new icons drawn in Lucide's style: Ego Form, Per Alter Form, Per Alter Edge Form, Sociogram, Network Composer, Narrative, Dyad Census and Tie-Strength Census.

**Architect**

- The protocol timeline on the start screen draws each stage in its new colour and icon. Information stages are a lighter grey instead of charcoal.
- Each stage in that timeline now carries the name of the interface it really uses, under a title that says what happens on the stage. Previously some stages showed the wrong type, such as a Sociogram labelled "Connections". The stage labels also have more padding and tighter, clearer type.

**Tailwind config (`@codaco/tailwind-config`)**

- Adds `interfaces.css`, which `fresco.css` loads, with `--interface-<stage-type>` and `--interface-<stage-type>-contrast` tokens for each stage type and `--color-interface-*` aliases for Tailwind utilities. An app that keeps its own theme instead of `fresco.css` imports `colors.css` and then `interfaces.css`.

**Fresco UI (`@codaco/fresco-ui`)**

- **Breaking:** `STAGE_TYPES` in `stages/stageTypes` replaces `STAGE_TYPE_COLORS` and `STAGE_TYPE_ICONS`, mapping each stage type to its colour token and icon. `stageTypeColorStyle` now returns the stage type's `--interface-*` tokens instead of a palette colour, and `stageTypeIcon` returns the new icons. `StageBar` draws its segments in the new colours.
