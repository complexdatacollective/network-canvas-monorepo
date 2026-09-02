# @codaco/site-navigation-element

The canonical Network Canvas site header, packaged as a self-contained
`<nc-site-navigation>` web component for pages that aren't React apps (a
Discourse forum, a static site, a CMS template, ...). It renders the same
React `SiteNavigation` component the Network Canvas sites use, mounted inside
a shadow root.

## Usage

```html
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@codaco/site-navigation-element@1/dist/element.js"
></script>
<nc-site-navigation active-item="community" theme="dark"></nc-site-navigation>
```

The `@1` pins to the major-version range, so hosts pick up nav changes
automatically with no further action. A version range is incompatible with
Subresource Integrity (a hash pins exact bytes and would break on every
release); a host that wants that guarantee instead can point at an exact
version and add its own `integrity` hash, trading auto-updates for a manual
bump on every release.

You can also install it as a regular dependency and import the same bundle
through your own bundler (`import '@codaco/site-navigation-element'`) instead
of loading it from a CDN.

## Attributes

| Attribute     | Values                                                                                                     | Default        | Notes                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------ |
| `active-item` | `home` \| `community` \| `documentation` \| `protocolGallery` \| `resources` \| `software` \| `getStarted` | unset          | Highlights the matching link (`aria-current="page"`).  |
| `locale`      | `en-US` \| `en-GB` \| `es`                                                                                 | `en-US`        | Selects the nav's translated copy.                     |
| `skip-to-id`  | any element `id` on the host page                                                                          | `main-content` | Where the skip link jumps to. See **Skip link** below. |
| `theme`       | `light` \| `dark` \| `auto`                                                                                | `auto`         | `auto` follows the page's `prefers-color-scheme`.      |

Attribute changes re-render the element live — updating `theme` or
`active-item` after the element has connected takes effect immediately.

## Skip link

The header is repeated on every page of a site, so its first focusable element
is a "Skip to main content" link that lets a keyboard or screen-reader user
bypass it (WCAG 2.4.1). It is invisible until focused, so it costs the host
page nothing visually.

**The host page must supply the target.** The element renders inside a shadow
root and cannot add an `id` to your markup, so give the element where your
content starts — usually your `<main>` — the matching `id`:

```html
<nc-site-navigation></nc-site-navigation>
<main id="main-content">…</main>
```

Use `skip-to-id` when that element already has a different `id`:

```html
<nc-site-navigation skip-to-id="content"></nc-site-navigation>
<div id="content">…</div>
```

A fragment link works normally from inside the shadow root: the browser
resolves `#main-content` against the host document, so it finds and scrolls to
your element and the component moves focus onto it (adding `tabindex="-1"` if
the element is not already focusable, which is what makes the jump land in
Safari as well as Chrome and Firefox).

**If the host page has no element with that `id`, activating the link does
nothing** beyond appending `#main-content` to the address bar — no scroll, no
focus change, no error. The header still renders and behaves normally, so a
page that forgets the target simply keeps the accessibility gap it already had.
Placing the element immediately before your main content and adding the `id` is
all that is required.

There's no utility slot (a place to render the account/theme switcher) in
this version — hosts that want their own colour scheme reflected should set
`theme` explicitly rather than relying on `auto`.

## How it works / footprint

- The whole thing ships as one self-contained ESM file — React, the compiled
  CSS, and everything else needed to render the header are inlined into
  `dist/element.js` (~194 kB gzipped / ~161 kB brotli over the wire).
- Styles are isolated in a shadow root, so the header can't leak into or be
  affected by the host page's CSS.
- Fonts and the `@font-face`/`@property` rules that can't apply inside a
  shadow root are injected once as a single document-level `<style>` tag. The
  woff2 font files themselves load from `dist/fonts/`, next to the bundle.
- **CSP caveat:** a host with a strict `style-src` may block that injected
  document-level style tag. If it does, the header falls back to system fonts
  but stays otherwise styled — the shadow root's own styles are unaffected.
  The bundle URL also needs to be allowed by `script-src`.

## Failure mode

If the script fails to load (network error, blocked by CSP, etc.), nothing
renders. The element is purely additive chrome above the host's own page, so
the rest of the page is unaffected either way.
