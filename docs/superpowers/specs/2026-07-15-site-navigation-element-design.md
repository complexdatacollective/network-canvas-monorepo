# Site Navigation Web Component (`@codaco/site-navigation-element`)

**Date:** 2026-07-15
**Status:** Approved

## Motivation

The Network Canvas community forum (<https://community.networkcanvas.com>, a
self-hosted Discourse instance) should carry the same global site header as the
other Network Canvas web properties. Discourse is an Ember application with
server-compiled SCSS, so the canonical React header
(`@codaco/fresco-ui/navigation/SiteNavigation`) cannot be imported there
directly. Re-implementing the header as a Discourse theme component was
rejected because it creates a second implementation that drifts.

Instead, this design packages the existing `SiteNavigation` React component as
a self-contained custom element that any non-React host page can load with a
script tag, achieving a true 1:1 header.

### Decisions already made

- **Distribution: CDN auto-tracking.** The bundle is published to npm and
  loaded from jsDelivr pinned to a major-version range (`@1`). Hosts pick up
  nav changes automatically with zero touch. (Vendored/PR-sync and
  exact-version pinning were considered and rejected in favour of zero-touch
  updates.)
- **Packaging: new monorepo package.** A second build target inside fresco-ui
  and a standalone repo were rejected; fresco-ui's externals-only ESM build
  stays untouched, and the element builds against `workspace:*` sources so nav
  changes and element releases ship together from one PR.
- **The Discourse theme component is out of scope for now.** This deliverable
  is the element plus its consumption contract. The forum-side loader (theme
  component, plugin outlet, CSP `csp_extensions` modifier, colour-scheme sync)
  will be designed separately.

## Scope

**In scope**

- New library package `packages/site-navigation-element`, published to npm as
  `@codaco/site-navigation-element` (public, normal changesets library lane).
- A custom element `<nc-site-navigation>` rendering `SiteNavigation` inside a
  shadow root, fully self-contained (React, motion, Base UI, icons, compiled
  CSS, fonts).
- Small upstream changes to `@codaco/fresco-ui` (see below).

**Out of scope (deliberately deferred)**

- The Discourse theme component that loads the element on the forum.
- `SiteFooter` as a web component (architecture leaves room for it).
- Theming the forum itself with the shared design tokens.

## Element contract

Tag name: **`<nc-site-navigation>`**.

| Attribute     | Values                         | Default | Maps to                                               |
| ------------- | ------------------------------ | ------- | ----------------------------------------------------- |
| `active-item` | `SiteNavigationItemId` strings | unset   | `activeItemId` (forum will use `community`)           |
| `locale`      | `SiteLocale` strings           | `en`    | `locale`                                              |
| `theme`       | `light` \| `dark` \| `auto`    | `auto`  | resolved theme; `auto` follows `prefers-color-scheme` |

- Links render as plain anchors via the component's default `renderLink`.
- No utility slot in v1 — the ThemeSwitcher remains app-side; a host such as
  Discourse sets `theme` explicitly to mirror its own colour scheme.
- Attribute changes re-render via `attributeChangedCallback`.
- The element always passes `site="external"` to `SiteNavigation`.

Consumption (any host):

```html
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@codaco/site-navigation-element@1/dist/element.js"
></script>
<nc-site-navigation active-item="community" theme="dark"></nc-site-navigation>
```

## Upstream fresco-ui changes

1. **`site: 'external'`** added to `SiteNavigationProps`. Today `site` is
   `'documentation' | 'website'`, and each value makes one destination
   root-relative. `external` makes both the brand link
   (networkcanvas.com) and the Docs link absolute.
2. **Portal containment.** `SiteNavigation` currently renders its two
   `NavigationMenu.Portal`s with no `container`, so popups mount in
   `document.body` — outside a shadow root and therefore unstyled.
   `SiteNavigation` will consume the existing `usePortalContainer()` context
   and pass it as `container` (undefined → unchanged default for existing
   apps). The element wraps its React tree in `PortalContainerProvider`
   _inside_ the shadow root so dropdowns stay styled and isolated.
3. **Storybook**: the SiteNavigation story gains the `external` site variant,
   per repo convention.

## Style strategy — Shadow DOM

`connectedCallback` attaches an open shadow root, mounts a React root inside
it, and applies one compiled stylesheet via `adoptedStyleSheets`.

- **CSS payload.** Compiled in this package by Tailwind v4 from an entry that
  imports `@codaco/tailwind-config/fresco.css`, with `@source` scoped to only
  the fresco-ui modules the nav uses (`navigation/`, `Button`, `Spinner`,
  `typography/`, `PortalContainer`) to keep the payload lean.
- **Shadow-boundary transforms (build-time).**
  - `:root`-scoped token blocks are rewritten to also match `:host`.
  - `@font-face` and `@property` rules do not take effect inside shadow
    roots; they are hoisted into a document-level `<style>` the element
    injects once (idempotent, guarded against double-injection).
- **Dark mode.** The resolved theme is reflected onto a wrapper
  `div[data-theme]` inside the shadow root — exactly the ancestor selector the
  component's existing dark styles key off (`[data-theme='dark']` token block
  and `[[data-theme=dark]_&]` utilities).
- **Fonts.** Nunito Variable and Inclusive Sans Variable woff2 files are
  copied into `dist/` at build time and referenced via
  `new URL(..., import.meta.url)`, so they resolve from the CDN (or any
  self-hosted copy) with no host setup.

## Build & distribution

- Vite lib build: a single minified ESM file with everything inlined — React,
  react-dom, motion, Base UI, lucide icons, and the compiled CSS imported as a
  string. This is intentionally the opposite of fresco-ui's externals-only
  build.
- Output: `dist/element.js` plus `dist/fonts/*.woff2`.
- Size budget: **~120–150 kB gzipped** (JS + CSS); fonts load separately on
  first visit.
- **Supply-chain trade-off (accepted).** Subresource Integrity cannot be used
  with a semver-range CDN URL: an `integrity` hash pins exact bytes and would
  break on every release. Auto-tracking therefore extends trust to the npm +
  jsDelivr supply chain for this bundle. Two properties bound the risk: npm
  publishing for `@codaco` happens only through the repo's release CI, and the
  element renders additive chrome (a compromised bundle still cannot read the
  host page's DOM outside its own subtree without further action, though any
  third-party script ultimately runs with page privileges). If harder
  guarantees are wanted later, the host switches to an exact-version URL with
  an `integrity` hash — a one-line change, at the cost of manual updates.
- `demo/index.html` served by `pnpm dev` for local verification.
- Standard turbo wiring (`build` via `with-turbo.mjs`, depends on `^build` so
  fresco-ui dist exists for `@source` scanning).
- Release: normal library changesets. fresco-ui gets a minor for the upstream
  changes; the element publishes from 1.0.0.

## Testing

- **Browser tests (primary).** vitest browser mode (Chromium via the
  catalog's `@vitest/browser-playwright`, as fresco-ui already uses):
  - element registers and renders the full link set inside its shadow root;
  - `active-item` produces `aria-current="page"` on the matching link;
  - `theme="dark"` changes computed colours; `auto` follows
    `prefers-color-scheme`;
  - the Resources dropdown opens and its popup mounts **inside** the shadow
    root;
  - Escape/keyboard interactions survive shadow-DOM event retargeting.
- **Unit tests.** fresco-ui's existing SiteNavigation tests extended for
  `site="external"` and the portal-container plumbing.
- Standard `typecheck`, `lint`, and `knip` gates.

## Failure modes

- Double registration guarded with `customElements.get()` before `define`.
- Invalid attribute values fall back to defaults with a `console.warn`.
- If the CDN script is blocked or fails, nothing renders — benign by design:
  the element is additive chrome above the host's own header, so the host
  page degrades to exactly what it is today.
