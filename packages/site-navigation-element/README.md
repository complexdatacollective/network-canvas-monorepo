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

| Attribute     | Values                                                                                                                                   | Default        | Notes                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `active-item` | `home` \| `community` \| `documentation` \| `protocolGallery` \| `updates` \| `resources` \| `software` \| `getStarted`                  | unset          | Highlights the matching link (`aria-current="page"`).                                                                          |
| `host-menu`   | `open` \| `closed`                                                                                                                       | unset          | `embedded` only. See **Inside a host's header**.                                                                               |
| `layout`      | `header` \| `embedded` \| `menu`                                                                                                         | `header`       | See **Inside a host's header**.                                                                                                |
| `locale`      | any language the websites offer: `en-US` \| `en-GB` \| `es` \| `zh-Hans` \| `zh-Hant` \| `de` \| `nl` \| `pt-BR` \| `it` \| `fr` \| `ar` | `en-US`        | Selects the nav's translated copy. The nav takes the page's direction, so an Arabic page (`dir="rtl"`) shows it right to left. |
| `skip-to-id`  | any element `id` on the host page                                                                                                        | `main-content` | Where the skip link jumps to. See **Skip link** below.                                                                         |
| `theme`       | `light` \| `dark` \| `auto`                                                                                                              | `auto`         | `auto` follows the page's `prefers-color-scheme`.                                                                              |

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

## Inside a host's header

By default the element is a whole header: the skip link, the logo, the links,
"Get started" and, in a narrow window, a menu of its own. A host whose own
header bar has to stay (a forum, with its search and account controls) can
place the shared header inside that bar instead:

```html
<header class="host-header">
  <nc-site-navigation
    layout="embedded"
    active-item="community"
    host-menu="closed"
  ></nc-site-navigation>
  <!-- the host's own controls -->
</header>
```

- **`layout="embedded"`** renders the logo and the links alone, on the host's
  background, without the skip link, "Get started" or a menu of its own. It
  takes the room the host gives it (give it `flex: 1; min-width: 0` in a flex
  row) and measures what fits there: every link; the pages folded into a
  Resources menu; that without the logo's name; then the logo alone. While
  any links show, the element matches the custom state
  `nc-site-navigation:state(links)`, so the host's styles can hide what the
  header already offers, such as the host's own menu button. Hide it in
  place rather than taking it out of the layout, and keep anything added
  while the links show within the room it frees: the element measures the
  room it is given, so a room that shrinks once its links show makes it fold
  them away again, and the two alternate at the width where they just fit.

  ```css
  .host-header:has(nc-site-navigation:state(links)) .host-menu-button {
    visibility: hidden;
  }
  ```

- **`layout="menu"`** renders the links as the narrow header's menu lists
  them, for the host to put in its own menu where the embedded header shows
  the logo alone.

- **`host-menu`** turns the `active-item` entry into the button that opens
  the host's own menu. It leads the links, is never folded into Resources,
  and is exposed as the shadow part `host-menu-trigger`. Pressing it
  dispatches a bubbling `nc-host-menu-toggle` event whose `detail.anchor` is
  the button's bounding rectangle, to hang the menu from; the host opens or
  closes its menu and sets `host-menu` to `open` or `closed`, which the button
  reports through `aria-expanded`. When the host closes its menu from the
  keyboard, `element.focusHostMenuTrigger()` puts focus back on the button
  (it returns `false` when there is none).

The element also matches the layout it renders as a custom state
(`:state(header)`, `:state(embedded)`, `:state(menu)`). A version older than
1.3.0 ignores `layout` and renders a whole header, so a host that loads the
element through the `@1` range should show it only once it reports the
layout, keeping its own logo and menu until then:

```css
.host-header nc-site-navigation:not(:state(embedded)) {
  display: none;
}
```

## How it works / footprint

- The whole thing ships as one self-contained ESM file — React, the compiled
  CSS, and everything else needed to render the header are inlined into
  `dist/element.js` (~300 kB gzipped / ~263 kB brotli over the wire).
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
