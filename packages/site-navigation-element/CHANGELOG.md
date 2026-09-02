# @codaco/site-navigation-element

## 1.1.0

### Minor Changes

- 0666674: `SiteNavigation` now opens with a "Skip to main content" link, so every site
  that renders the canonical header has the mechanism WCAG 2.4.1 requires for
  bypassing a block repeated on every page.

  The link is the first focusable element in the header, invisible until it takes
  focus, and translated alongside the rest of the navigation copy. It jumps to the
  new `skipToId` prop, which defaults to `main-content`. The new
  `navigation/SiteNavigation.constants` subpath exports that default as
  `SITE_NAVIGATION_SKIP_TARGET_ID`, so a page can mark its target with the same
  value the header links to without importing the header itself.

  The host page owns the target element — the header cannot supply one — and the
  link moves focus onto it explicitly, adding `tabindex="-1"` when the page has
  not already made it focusable, because browsers otherwise only set the
  sequential focus navigation starting point and Safari does not honour it.

  `<nc-site-navigation>` exposes the same target through a `skip-to-id`
  attribute. The fragment resolves against the host document from inside the
  shadow root, so the link reaches an element the component cannot see; a host
  page with no matching element gets a link that does nothing, which the README
  now spells out.

## 1.0.2

### Patch Changes

- d33236b: Compile the navigation styles with the catalog-managed Tailwind CLI so nested source files are scanned correctly.

## 1.0.1

### Patch Changes

- a95c5e8: Reveal the software destinations in the shared site navigation with a staggered animation, keep the dropdown stable while it closes, and respect reduced-motion preferences.

## 1.0.0

### Major Changes

- 436e04c: Initial release: the canonical Network Canvas site header packaged as a self-contained `<nc-site-navigation>` web component for non-React hosts. Loads from a CDN with a single script tag; Shadow DOM isolation; `active-item`, `locale`, and `theme` (light/dark/auto) attributes. Bundle size: ~194 kB gzipped / ~161 kB brotli (JS + CSS inlined; jsDelivr serves brotli).
