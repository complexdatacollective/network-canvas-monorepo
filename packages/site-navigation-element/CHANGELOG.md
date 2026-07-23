# @codaco/site-navigation-element

## 1.0.1

### Patch Changes

- a95c5e8: Reveal the software destinations in the shared site navigation with a staggered animation, keep the dropdown stable while it closes, and respect reduced-motion preferences.

## 1.0.0

### Major Changes

- 436e04c: Initial release: the canonical Network Canvas site header packaged as a self-contained `<nc-site-navigation>` web component for non-React hosts. Loads from a CDN with a single script tag; Shadow DOM isolation; `active-item`, `locale`, and `theme` (light/dark/auto) attributes. Bundle size: ~194 kB gzipped / ~161 kB brotli (JS + CSS inlined; jsDelivr serves brotli).
