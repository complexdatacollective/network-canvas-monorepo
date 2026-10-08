# networkcanvas.com

## 0.7.0

### Minor Changes

- Add a searchable Updates page: an illustrated timeline of news from across the Network Canvas project since 2013 (software releases, funding, research papers, and workshops at Sunbelt and EUSN), linked from the site navigation and footer. The site header and footer now sit outside each page's main landmark. The homepage news ticker now shows the five newest Updates entries and links each one to its place on the Updates page; the stories it carried before are now Updates entries.

### Patch Changes

- Pages no longer re-render part of themselves on load. The footer's copyright
  year is now fixed when the site is published, instead of being read from the
  visitor's device, which could disagree with the published page and force the
  browser to rebuild it.
- A protocol preview in another language now fetches the interview's messages
  while the protocol downloads, so the interview opens without a further wait
  for its language.
- The language-detection edge function now bundles its locale matcher with the
  site instead of loading it from a third-party CDN at request time.

## 0.6.0

### Minor Changes

- networkcanvas.com is now available in Brazilian Portuguese (Português (Brasil))
  at `/pt-BR/`, including the site navigation, news, publications, grants and
  team listings. Visitors whose browser prefers Portuguese are sent there
  automatically.
- networkcanvas.com is now available in Dutch (Nederlands) at `/nl/`, including
  the site navigation, news, publications, grants and team listings. Visitors
  whose browser prefers Dutch are sent there automatically.
- networkcanvas.com is now available in French (Français) at `/fr/`, including
  the site navigation, news, publications, grants and team listings. Visitors
  whose browser prefers French, wherever they are, are sent there automatically.
- networkcanvas.com is now available in German (Deutsch) at `/de/`, including
  the site navigation, news, publications, grants and team listings. Visitors
  whose browser prefers German are sent there automatically.
- networkcanvas.com is now available in Italian (Italiano) at `/it/`, including
  the site navigation, news, publications, grants and team listings. Visitors
  whose browser prefers Italian are sent there automatically.
- networkcanvas.com is now available in Simplified Chinese (简体中文) at
  `/zh-Hans/`, including the site navigation, news, publications, grants and team
  listings. Visitors whose browser prefers Chinese are sent there automatically.
- networkcanvas.com is now available in Traditional Chinese (繁體中文) at
  `/zh-Hant/`, including the site navigation, news, publications, grants and team
  listings. Visitors whose browser prefers Chinese for Taiwan, Hong Kong or Macau
  are sent there automatically; other Chinese browser languages still go to
  `/zh-Hans/`.

### Patch Changes

- The homepage news ticker no longer breaks the page for visitors who prefer
  reduced motion.

  The ticker chose between two different layouts based on that preference, but the
  server cannot know it — so the page arrived built one way and was immediately
  re-rendered the other way. React treats that disagreement as a failure, discards
  everything it had already placed on the page and builds it again from scratch,
  which is slower and loses the benefit of sending a finished page at all.

  The ticker now arrives the same way for everyone and settles into its reduced
  version once the page is interactive. It never animates for these visitors at
  any point.

- The site now honours the operating-system "reduce motion" setting throughout.

  Motion is off by default in the animation library the site uses, so the
  preference reached only those components that had been written to ask for it
  individually. The homepage background, the hero intro, the publication rail and
  the Summer Update visuals all did ask, and were already correct. Everywhere
  else — the site header, the hero, the grants section, the Summer Update's
  entrance sequence, and every animated dialog, menu and overlay from the shared
  component library — a visitor who had asked their device for less movement
  still got the full animation.

  The preference is now applied once, for the whole site. Content that used to
  slide, travel or scale into place arrives already in position for those
  visitors, while gentle fades still play, so pages stay legible rather than
  appearing without any sense of progression.

- The site's language list now opens with a search box, so you can find your
  language by typing its name instead of scrolling through every language on
  offer.
- Update third-party dependencies to their latest minor and patch releases, including Base UI 1.8, next-intl 4.14, Motion 13.4, Lucide 1.49, the Inclusive Sans and Nunito variable fonts 5.3 and PostHog.

## 0.5.2

### Patch Changes

- Add a newly published Network Canvas study on sexual partner typologies among Latino men in Miami.
- The protocol gallery facet chips, the Get Started path and app-status labels
  and the Summer Update compatibility chips all use the shared `Badge`, so they
  share one size, weight and theme-aware colour treatment instead of hand-rolled
  approximations. The news ticker's label, which only borrowed a chip for its
  layout, is a plain label again.

## 0.5.1

### Patch Changes

- Fix the US and UK English pages of the protocol gallery at protocolgallery.networkcanvas.com, which redirected back and forth between two addresses instead of loading.

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
