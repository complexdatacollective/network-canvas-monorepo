# Network Canvas community theme

The Discourse theme for the community forum at
[community.networkcanvas.com](https://community.networkcanvas.com). It gives
the forum the look of the Network Canvas apps and websites and puts the shared
site header above Discourse's own.

## What it does

- **Shared header.** Renders `<nc-site-navigation>` from
  `@codaco/site-navigation-element` above Discourse's header, in the forum's
  language and colour mode. Discourse's header becomes the forum's bar, titled
  "Community" in the visitor's language (the shared header's own word for it).
- **Design tokens.** Every token of the default Network Canvas theme is
  declared as `--nc-*` (light and dark), and Discourse's variables are set from
  them: fonts, radii, buttons, inputs, links and its muted text shades.
- **Palettes.** Ships "Network Canvas" and "Network Canvas Dark" palettes,
  filled from the same tokens.
- **Fonts.** Ships Nunito and Inclusive Sans as theme assets, the same files
  the apps load.
- **Home page.** Replaces the forum's front page (`/`; the topic list moves to
  `/latest`) with a page that sends people to the right category. It shows a
  card for each of help, feature requests, general discussion and
  announcements, with that category's newest topic. It also shows the latest
  discussions, a small network of who posted in them, and the forum's totals.
  Its illustrations are inline SVG drawn in the websites' style.

## Where things come from

Nothing that the design system defines is copied by hand. `pnpm build`
generates it from the workspace packages:

| Generated                       | From                                                                       |
| ------------------------------- | -------------------------------------------------------------------------- |
| `common/color_definitions.scss` | `@codaco/tailwind-config` theme tokens (`fresco/themes/default.css`)       |
|                                 | and its `elevation-*` shadows (`@codaco/tailwind-config/elevation`)        |
| palettes in `about.json`        | the same tokens, resolved to hex by `@codaco/tailwind-config/theme-colors` |
| `scss/fonts.scss`, `assets/`    | `@codaco/tailwind-config/fonts/*.css` and their fontsource files           |
| `locales/*.yml`                 | the shared header's messages in `@codaco/fresco-ui`, and the home page's   |
|                                 | app-i18n catalogs in `src/locales/`                                        |

Everything else in [`theme/`](theme) is written by hand: the SCSS partials that
map the tokens onto Discourse (`theme/scss/`) and the header components
(`theme/javascripts/`). The build refuses a hand-written file at a generated
path.

`color_definitions.scss` is compiled by Discourse once per palette, so the
light tokens apply under a light palette and the dark ones under a dark
palette, whichever the visitor has chosen.

## Building

```bash
pnpm --filter @codaco/community-theme build
```

This writes `dist/network-canvas/` (the theme as a folder) and
`dist/network-canvas.zip`. `pnpm --filter @codaco/community-theme test` checks
that every `--nc-*` token the stylesheets read is generated in both modes,
that text, links and muted text stay legible on what they sit on, that every
font face and translation the theme uses is shipped, and that the home page's
network keeps people and discussions apart.

## Home page copy

The home page's English lives in
[`src/landing.messages.ts`](src/landing.messages.ts) as app-i18n message
descriptors, like the apps' copy. After changing it, run
`pnpm --filter @codaco/community-theme i18n:extract` to regenerate
`src/locales/en.json`. A translation goes in `src/locales/<tag>.json` and is
stamped with `i18n:stamp`, as in the apps. A language with no catalog shows
English.

The build turns each message into a Discourse translation, and Discourse
supports less than ICU: plain text, `{arguments}`, and a message that is a
single `{count, plural, …}` using the language's own plural categories. An
exact match such as `=0` has no Discourse equivalent, so the build refuses
it.

## Installing on the forum

1. Admin → Appearance → Themes → Install → From your device, and upload
   `dist/network-canvas.zip`. Updating an installed theme is the same upload.
2. Attach the components the current theme uses (DiscoTOC, Discourse Clickable
   Topic, Discourse Loading Slider, Modern Category + Group Boxes) to the new
   theme. Leave out Custom Header Links, which the shared header replaces, and
   the Google font component, whose fonts and sizes would override the
   theme's.
3. Preview the theme, then make it the default.
4. Under Admin → Appearance → Color palettes, set "Network Canvas" as the
   default light palette. To offer dark mode, set "Network Canvas Dark" as the
   default dark palette.
5. To show the forum in each visitor's language, turn on the site settings
   `allow user locale` and `set locale from accept language header`.

To work on the theme against a forum, the
[`discourse_theme` CLI](https://meta.discourse.org/t/discourse-theme-cli-console-app-to-help-you-build-themes/82950)
can watch `dist/network-canvas/` and upload each change: rebuild after editing
`theme/`, and the CLI picks up the new files.

The theme setting `site_navigation_script_url` says where the shared header's
script loads from. The default follows every 1.x release on jsDelivr; set an
exact version to pin it.

The home page finds its categories by slug, through the settings
`help_category`, `ideas_category`, `conversation_category` and
`news_category`; the defaults are the current forum's. A card whose category
cannot be found, or that the visitor cannot see, is left out.
`documentation_url` is where the note under the cards points.

## Known shortfall

The dark palette's link colour is the design system's own dark `--link`, which
measures 4.31:1 on the dark page and 4.13:1 on the dark content surface,
under the 4.5:1 WCAG AA asks of normal text. The test pins both ratios so a
change to either colour is noticed. The shared contrast test in
`tooling/tailwind` does not check link colours.
