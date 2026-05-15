---
'@codaco/fresco-ui': patch
---

Sync with `@codaco/tailwind-config@1.0.0-alpha.9`: the base-layer rules and `prefers-reduced-motion` global override now ship inside `@codaco/tailwind-config/fresco/utilities.css`, which fresco-ui already pulls in transitively via `dist/styles.css → @codaco/tailwind-config/fresco.css`. No fresco-ui component or runtime change — this release only widens the dependency range so consumers of fresco-ui pick up the new baseline.
