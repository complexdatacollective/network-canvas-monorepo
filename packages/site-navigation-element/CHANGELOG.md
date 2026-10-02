# @codaco/site-navigation-element

## 1.2.0

### Minor Changes

- 08fd0f7: Brazilian Portuguese (Português (Brasil), `pt-BR`) is now available as an
  interface language in Architect, Interviewer and Fresco, alongside English,
  Spanish and Simplified Chinese. Choose it from the language setting, or let it
  be selected automatically when your browser prefers Portuguese. The built-in
  interview controls participants see are translated too; protocol content keeps
  the language it was written in.
- ee4ad52: Dutch (Nederlands, `nl`) is now available as an interface language in
  Architect, Interviewer and Fresco. Choose it from the language setting, or let
  it be selected automatically when your browser prefers Dutch, whether from the
  Netherlands or Belgium. The built-in interview controls participants see are
  translated too; protocol content keeps the language it was written in.
- bff61d5: French (Français, `fr`) is now available as an interface language in
  Architect, Interviewer and Fresco, alongside English, Spanish and Simplified
  Chinese. Choose it from the language setting, or let it be selected
  automatically when your browser prefers French — including Canadian, Belgian
  and Swiss French. The built-in interview controls participants see are
  translated too; protocol content keeps the language it was written in.
- 62617a9: German (Deutsch, `de`) is now available as an interface language in Architect,
  Interviewer and Fresco, alongside English, Spanish and Simplified Chinese.
  Choose it from the language setting, or let it be selected automatically when
  your browser prefers German, including the Austrian and Swiss variants. The
  built-in interview controls participants see are translated too; protocol
  content keeps the language it was written in.
- 5b12f3b: Italian (Italiano, `it`) is now available as an interface language in
  Architect, Interviewer and Fresco. Choose it from the language setting, or let
  it be selected automatically when your browser prefers Italian. The built-in
  interview controls participants see are translated too; protocol content keeps
  the language it was written in.
- f32135f: Simplified Chinese (简体中文, `zh-Hans`) is now available as an interface
  language in Architect, Interviewer and Fresco, alongside English and Spanish.
  Choose it from the language setting, or let it be selected automatically when
  your browser prefers Chinese. The built-in interview controls participants see
  are translated too; protocol content keeps the language it was written in.
- e5f6a9a: Traditional Chinese (繁體中文, `zh-Hant`) is now available as an interface
  language in Architect, Interviewer and Fresco, written in Taiwan-standard
  vocabulary. Choose it from the language setting, or let it be selected
  automatically: browsers set to Chinese for Taiwan, Hong Kong or Macau now get
  Traditional Chinese instead of Simplified Chinese, while other Chinese browser
  languages still get Simplified Chinese. The built-in interview controls
  participants see are translated too; protocol content keeps the language it
  was written in.

  Chinese browser languages are now matched by script rather than by region.
  `resolveAppLocale` in `@codaco/app-i18n` maps each Chinese tag to its script
  first, so Hong Kong (`zh-HK`) and Macau (`zh-MO`) resolve to Traditional
  Chinese even when the browser also sends a generic `zh`, which previously won
  Simplified Chinese. `@codaco/shared-consts` exports the rule as
  `toScriptMatchingTag`, which the website uses too. A registry that declares a
  regional Chinese tag such as `zh-TW` exactly still receives that tag.

### Patch Changes

- 56e16d0: Update third-party dependencies to their latest minor and patch releases, including Base UI 1.8, React Aria Components 1.21, Tiptap 3.31.4, Mapbox GL 3.32, Motion 13.4, Lucide 1.49, the Inclusive Sans and Nunito variable fonts 5.3, PostHog, Prisma 7.10 and Electron 43.7.

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
