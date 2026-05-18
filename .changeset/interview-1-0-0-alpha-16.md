---
'@codaco/interview': prerelease
---

Pairs with `@codaco/fresco-ui@2.8.0` and `@codaco/tailwind-config@1.0.0-alpha.16` to make the scoped interview theme actually paint when `data-theme-interview` is applied to the `<main>` wrapper instead of `:root`.

`Shell` no longer hardcodes the `scheme-dark` utility on `<main>` — it's now applied automatically by `<ThemedRegion theme="interview">` (fresco-ui 2.8.0). No consumer-visible change beyond the upgrade requirement: the rendered DOM still has `data-theme-interview` and `scheme-dark` on the same element.

`canvas` selectors (`getPlacedNodes`, `getEdges`, `getNodes`, `getUnplacedNodes`) converted from JS to TypeScript. Runtime behaviour is unchanged for valid protocols — dead branches that the type system rules out (array-shaped subjects, type-keyed `layoutVariable` lookups) were dropped during the conversion.
