---
'@codaco/architect': minor
---

The Home screen's protocol timeline now draws each station from the shared stage-type maps in `@codaco/fresco-ui` — `STAGE_TYPE_COLORS` for the disc, connector and caption, `STAGE_TYPE_ICONS` for the glyph — instead of six bundled SVG images and its own hardcoded colours. The timeline's stops are real `StageType` values, so a station cannot name an interface the schema does not have, and the animation stays consistent with every other surface that colours a stage.
