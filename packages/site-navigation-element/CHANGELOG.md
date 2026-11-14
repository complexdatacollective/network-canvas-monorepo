# @codaco/site-navigation-element

## 1.4.0

### Minor Changes

- 6e89119: Add Arabic (`ar`) to the languages the Network Canvas websites offer. The
  shared site header (`SiteNavigation` and `<nc-site-navigation>`) now has its
  words in Arabic and lays itself out right to left there, and a browser that
  asks for Arabic in any region is matched to it.

### Patch Changes

- e405448: Arabic text is now set in Readex Pro, a typeface that ships with the apps, so
  it looks the same on every device instead of depending on the fonts each one
  has installed. This applies to text marked as Arabic: an interface or
  interview shown in Arabic, and Arabic wording inside another language where
  the app knows its language. Text in every other language is unchanged,
  including languages such as Persian and Urdu that share the script.

  `@codaco/tailwind-config` adds `fonts/readex-pro.css`, and its themes add
  Readex Pro to the heading and body stacks for `lang="ar"` only. A host that
  imports `fonts/nunito.css` and `fonts/inclusive-sans.css` should import the
  new file beside them; without it Arabic falls back to a system font as
  before. Only the Arabic subset is declared (23 KB), and a browser fetches it
  only for a page that shows Arabic. Each theme now names the Latin face of its
  stacks as `--heading-face` and `--body-face`; a theme of your own that sets
  `--heading-font` or `--body-font` should set those too. The site navigation
  bundle ships the file in `dist/fonts/`.

## 1.3.0

### Minor Changes

- a3d63d1: `<nc-site-navigation>` can sit inside a site's own header bar, as it does on the community forum. `layout="embedded"` shows the logo and links alone on the host's background and fits them to the room it is given, folding the pages into Resources and then dropping to the logo; the element matches `:state(links)` while any links show. `layout="menu"` lists the links for the host's own menu. `host-menu` turns the active entry into the button that opens the host's menu: it dispatches `nc-host-menu-toggle`, reports `host-menu="open"` through `aria-expanded`, and `focusHostMenuTrigger()` returns focus to it. The element matches the layout it renders as a custom state (`:state(embedded)`, `:state(menu)`), so a host can keep its own header until a version with the layout arrives. The README's "Inside a host's header" has the details.

### Patch Changes

- a3d63d1: The Software menu wraps its cards onto more rows in a window too narrow for three across, instead of running off the screen.
- c34db26: The header takes the adjusted brand colours: Neon Coral, which marks the current page and the link under the pointer, is slightly lighter and less saturated, and the logo's colours shift slightly with the rest of the palette.

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
- 513d87a: Add an Updates link to the shared site navigation, pointing at the project's Updates page on networkcanvas.com.
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
