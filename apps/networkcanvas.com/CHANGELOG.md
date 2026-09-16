# networkcanvas.com

## 0.5.0

### Minor Changes

- Add a searchable, filterable protocol gallery with localized static study pages and repository-hosted protocol and codebook downloads, served from protocolgallery.networkcanvas.com.

  Each protocol's stage sequence is read from its `.netcanvas` file at build time: gallery cards show a colour-coded stage bar with stage and edge-generation counts, and study pages list every stage with its interface type. The gallery can be filtered by field of study and edge-generation method, sorted, and searched.

  Every protocol can be previewed in the browser without deploying it anywhere: the study page's "Preview in browser" action opens a popup that downloads the `.netcanvas`, migrates it to the current schema in memory, and runs it in the interview engine. Nothing entered in a preview is saved.

- The language control in the footer is now the same switcher the rest of Network
  Canvas uses. It names the language you are reading in, and opens a list of every
  language the site speaks, each written in itself.

  The list now starts with Automatic, which follows the languages your browser
  asks for and says which one that currently is. Choosing it forgets a language
  you picked earlier, so the site goes back to matching your browser — previously
  a choice could only be replaced, never undone. Choosing any language still keeps
  you on the page you were reading.

  The switcher's own wording is translated, so the list, its heading and the
  button's description are in the language of the page you are on.

### Patch Changes

- Cache fonts and other build assets in the browser, and start the fonts downloading sooner.

  The site's stylesheets, scripts and fonts were served with `Cache-Control: public, max-age=0, must-revalidate`, so every page load re-checked each of them with the server even though their filenames already change whenever their contents do. They are now cached for a year, and a repeat visit or an onward navigation loads them from disk instead of the network.

  The two fonts the site starts with are also preloaded, so they begin downloading alongside the stylesheet rather than only once it has been parsed. Together this removes the delay before text settles into its final typeface.

## 0.4.7

### Patch Changes

- The homepage's Recent Publications section now shows two rows of publication cards instead of one. The list keeps advancing as you scroll the page, and can also be scrolled by hand at any time. Also trimmed the introductory text down to the publication count and the link to the full list.

## 0.4.6

### Patch Changes

- Add two newly identified publications that used Network Canvas for network data collection.
- The hero video now plays immediately when you arrive on the homepage from another page on the site, instead of showing its still image for a moment first.

## 0.4.5

### Patch Changes

- Add a newly published Network Canvas study to the website publications list.

## 0.4.4

### Patch Changes

- Every page now marks where its content starts, so the site header's new skip
  link has somewhere to land and keyboard and screen-reader visitors can bypass
  the navigation.

## 0.4.3

### Patch Changes

- Add a new publication that used Network Canvas to map inter-organisational school networks.

## 0.4.2

### Patch Changes

- Add newly identified publications that used Network Canvas in research data collection.

## 0.4.1

### Patch Changes

- Populate PostHog's built-in app name and version metadata for Website events.

## 0.4.0

### Minor Changes

- Add a publications page listing every publication that uses Network Canvas,
  newest first, and link to it from the homepage. The page restores the full list
  that the previous site offered, including the publications that were not
  carried over when the site was rebuilt, and each entry now shows its year.

### Patch Changes

- Add a newly published Network Canvas study to the website publications list.

## 0.3.0

### Minor Changes

- Add privacy-conscious usage analytics, so we can see which pages people find
  useful and be told when a page fails to load. Analytics run only on the live
  site — never on previews or local development — and are sent through the
  project's own relay rather than to a third party directly.

## 0.2.4

### Patch Changes

- Add newly identified Network Canvas publications.

## 0.2.3

### Patch Changes

- Keep Architect Classic and Interviewer Classic installer links working when GitHub release assets change.

## 0.2.2

### Patch Changes

- Make documentation links follow the active local or deploy-preview documentation site, automate paired local site development, repair outdated documentation and publication links, and derive Classic downloads from the latest GitHub releases.

## 0.2.1

### Patch Changes

- Explain the original Classic apps and link to their downloads from the Summer 2026 update.

## 0.2.0

### Minor Changes

- Introduce a localized Summer 2026 update page for the redesigned Architect and Interviewer apps, Fresco 4.0.0, and the Schema 8 protocol format. Publish the complete announcement in English and Spanish, and refresh shared website headings, buttons, navigation, and footer composition to support it.

### Patch Changes

- Redesign the homepage design principles as wider, fully linked cards with original illustrations, and refresh the localized summer announcement copy.
- Improve the homepage with a wider recent-publications grid, a compact scientific-advisors subsection, and larger, visually balanced institution logos.
- Rename the site navigation "Docs" link to "Documentation", and calm the homepage background: the network weave now waits for the hero entrance before it appears, then eases its focus toward the viewport origin as the hero video scrolls away, with ribbons that retain their direction throughout the movement, instead of roaming between page sections as you scroll. Also reword the tools introduction to mention "apps" for survey design and interviewing, and refresh the Fresco description.
- Remove the iPhone and iPad download option for Interviewer Classic. The linked App Store listing is no longer available, and Interviewer is not intended for phones.
- Smooth the homepage background weave as visitors scroll beyond the hero.
- Publish the Summer 2026 release announcement, refresh the homepage app screenshots and latest-news ticker, and refine the shared visual treatment across the website.
- Show complete announcement screenshots in source-matched frames, localize the homepage announcement link, and keep the weave hidden until its entrance begins.
- Add scroll-linked motion to the homepage and Get Started experience, including a pinned recent-publications rail, improve responsive tool cards, prevent animation-wrapper key warnings, and restore working mailing-list subscriptions.
- Opt the marketing site into the shared fluid root-size ramp, so typography and
  spacing grow smoothly on wide and high-resolution displays while staying compact
  at standard sizes.
- Keep the background weave behind page content so translucent surfaces retain their blur during entrance animations and scrolling, while team photos remain opaque.

## 0.1.1

### Patch Changes

- Updated dependencies [02c4314]
  - @codaco/fresco-ui@2.12.2
