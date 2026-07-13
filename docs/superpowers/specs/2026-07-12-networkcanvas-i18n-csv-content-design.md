# NetworkCanvas.com Internationalisation and CSV Content Design

**Date:** 2026-07-12

## Goal

Internationalise NetworkCanvas.com in US English, UK English, and Spanish with
`next-intl`, and move Latest News, Recent Publications, Grants, and Core Team
records into simple build-time CSV files. The work must preserve the current
page structure and presentation, apart from adding the approved language
selector.

## Scope

This work includes:

- US English, UK English, and Spanish versions of every page and all user-facing
  copy.
- Locale-prefixed routes under `/en-US`, `/en-GB`, and `/es`.
- Browser-language redirects from `/` and unprefixed routes through the
  `next-intl` proxy, plus permanent legacy download redirects.
- A locale selector in the desktop navigation, mobile navigation, and footer.
- Build-time CSV content for Latest News, Recent Publications, Grants, and Core
  Team.
- Localised metadata, canonical URLs, and `en-US`/`en-GB`/`es` alternate links.
- Build-time validation and automated tests for localisation, content loading,
  routing, and pre-rendering.

This work does not redesign sections, alter their animations, or change their
display order or layout.

The localized Get Started page also preserves the refined compatibility
hierarchy exactly: the Classic compatibility warning uses the
`@codaco/fresco-ui/Alert` warning variant, appears immediately after the Design
path description and before its app cards, and is absent from the Collect path.
Fresco retains its slate-tinted surface with backdrop blur. The English source
status is exactly **Large Teams · Remote Administration · Recommended** and
receives a complete Spanish translation. At tablet-landscape widths,
Interviewer and Fresco remain equal-width cards on the first Collect row using
`tablet-landscape:col-span-6`; Interviewer Classic is full-width on the following
row using `tablet-landscape:col-span-12` with no column-start offset. Mobile
order remains Interviewer, Fresco, then Interviewer Classic.

## Routing and Rendering

All content pages use an explicit locale prefix:

| Content     | US English           | UK English           | Spanish           |
| ----------- | -------------------- | -------------------- | ----------------- |
| Home        | `/en-US`             | `/en-GB`             | `/es`             |
| Get Started | `/en-US/get-started` | `/en-GB/get-started` | `/es/get-started` |

The app deploys with the Next.js runtime rather than `output: 'export'`. The
All locale content pages are still pre-rendered during `next build`,
while `proxy.ts` runs through the Netlify Next.js runtime to negotiate locale
redirects.

The root `/` and unprefixed `/get-started` routes are handled by the next-intl
proxy. A saved `nf_lang` preference takes precedence over `Accept-Language`; a
Spanish preference redirects to the Spanish equivalent, UK English preferences
use `/en-GB`, and all other requests use US English at `/en-US`. Explicitly
prefixed routes remain stable.

The legacy `/download`, `/en-US/download`, `/en-GB/download`, and `/es/download`
routes remain only as permanent redirects. The localised legacy routes retain
their locale, while the unprefixed route uses the same runtime locale
negotiation. The proxy also normalises the cited legacy `/download.html` URL. No
download route renders page content or declares canonical metadata.

Temporary redirects are required because browser language preferences can
change. The language selector provides an explicit user override and switches
between the equivalent route without returning the user to the home page.

## next-intl Architecture

The website mirrors the proven `next-intl` structure already used by
`apps/documentation`:

- `next.config.ts` is wrapped with the `next-intl` plugin.
- Routing configuration declares `en-US`, `en-GB`, and `es`, with `en-US` as the
  default locale and an always-prefixed URL strategy.
- `proxy.ts` composes next-intl middleware with normalization for the legacy
  `/download.html` route.
- Request configuration loads the complete message catalog for the requested
  locale.
- Locale layouts validate route parameters, call `setRequestLocale`, set the
  document `lang`, and provide `NextIntlClientProvider` to client components.
- `generateStaticParams` emits all three locales.
- Locale-aware navigation helpers preserve the current locale for internal
  links and switch locales while retaining the current pathname.
- English message types augment `next-intl` so invalid message keys fail type
  checking.

Every user-facing string moves into the shared English source catalog at
`messages/en.json` and the Spanish catalog at `messages/es.json`,
including:

- navigation and footer labels;
- headings, paragraphs, buttons, and calls to action;
- Latest News and carousel accessibility labels;
- mailing-list form labels, placeholders, errors, and success states;
- Get Started pathway cards, workflow headings, app descriptions and guidance,
  status badges, action and platform labels, schema compatibility warning, and
  accessible names;
- metadata and Open Graph copy; and
- image alternative text that is not supplied by CSV content.

US and UK English initially share the current English source copy while
retaining distinct locale identifiers for routing, browser negotiation, Intl
formatting, metadata, and language selection. Spanish uses clear, neutral
international Spanish. Complete ICU messages and `t.rich` are used for
sentences containing links or emphasis so translations do not concatenate
grammatical fragments. Product names, people names, external URLs, colors, and
asset paths remain locale-neutral configuration.

Each localized page emits:

- the correct `<html lang>` value;
- localized title, description, and Open Graph metadata;
- a canonical URL for its locale; and
- alternate links for `en-US`, `en-GB`, and `es`.

Missing messages are errors. A localized page must never silently mix English
and Spanish.

## Language Selector

A compact, searchable Fresco UI combobox appears in the desktop navigation,
mobile navigation, and footer. Its options show country flags and localised
language names; its selected state shows only the current flag. It uses
locale-aware navigation rather than direct location mutation, remains keyboard
accessible, has a visible focus state, and exposes a localised accessible label.
Switching among `/en-US`, `/en-GB`, and `/es` preserves the current page.

## CSV Content Model

Four CSV files live under `apps/networkcanvas.com/content`:

- `latest-news.csv`
- `publications.csv`
- `grants.csv`
- `core-team.csv`

Each record has a stable, unique `id`. Locale-neutral values appear once, and
translated values use paired `_en` and `_es` columns. CSV row order is display
order.

### Latest News

```csv
id,title_en,title_es,href
```

All rows are passed to the existing news ticker in file order.

### Publications

```csv
id,title_en,title_es,source_en,source_es,authors,href
```

The existing section continues to show the first four rows in file order.
Publication titles and sources are translatable; author names remain shared.

### Grants

```csv
id,title_en,title_es,pis_en,pis_es,description_en,description_es,logo,logo_alt_en,logo_alt_es,href
```

All rows are passed to the existing grants carousel in file order.

### Core Team

```csv
id,name,institution_en,institution_es,photo
```

All rows are passed to the existing team grid in file order. Names and photos
remain shared; institution names are translatable.

## Build-Time Content Pipeline

A server-only loader reads the four CSV files during static generation. It uses
the workspace's existing CSV parser and Zod to:

1. parse CSV quoting, commas, and embedded newlines;
2. validate the complete source row;
3. reject duplicate IDs;
4. require non-empty English and Spanish fields;
5. validate external links as HTTPS URLs;
6. validate image references as `/images/...` public asset paths;
7. select the requested locale; and
8. return serializable typed records with stable IDs.

The loader reports the CSV filename, one-based data-row number, and field name
for invalid content. Missing files and empty required datasets also fail the
build. There is no locale fallback in the loader.

The localized home page loads all four datasets in parallel and passes them as
props to News Ticker, Publications, Grants, and Core Team. Those components stop
importing hardcoded arrays from `lib/content.ts`, but retain their existing
markup, styling, animation, carousel behavior, and presentation.

The hardcoded Latest News, Publication, Grant, and Core Team arrays are removed
from `lib/content.ts` after their current records have been migrated into CSV.
Other locale-neutral configuration remains in TypeScript, while rendered text
moves into message catalogs.

`content/**` and `messages/**` are added to the website's Turbo build and
typecheck inputs so content-only or translation-only changes cannot reuse stale
outputs.

## Error Handling

Content and translation errors are deployment errors, not runtime UI states.
The build stops when:

- a configured locale or CSV file is missing;
- a required dataset is empty;
- a required field or translation is blank;
- an ID is duplicated within a dataset;
- a URL or image path is malformed; or
- a message key is missing or invalid.

Because failures occur before export, visitors never see a partially translated
page, loading placeholder, empty carousel, or stale fallback content.

## Testing and Verification

Implementation follows test-driven development. Tests are written and observed
failing before production changes.

### Content loader tests

- quoted commas and embedded newlines parse correctly;
- English and Spanish fields are selected correctly;
- row order is preserved;
- publications expose only the first four rows to their section;
- duplicate IDs are rejected;
- invalid HTTPS URLs and public image paths are rejected;
- blank or missing translations are rejected;
- missing and empty datasets are rejected; and
- errors identify the filename, row, and field.

### Component tests

- Latest News, Publications, Grants, and Core Team render passed localized
  records rather than importing hardcoded data;
- translated interactive labels remain accessible;
- Get Started pathway cards, app actions, status badges, platform controls, and
  compatibility guidance are complete in all locales;
- the compatibility warning retains its Fresco UI warning status, follows the
  Design description before the Design cards, and is absent from Collect;
- Fresco retains both its slate tint and backdrop blur, including when its
  translated status is **Large Teams · Remote Administration · Recommended**
  in English;
- Interviewer and Fresco retain equal
  `tablet-landscape:col-span-6` widths, Interviewer Classic is full-width on the
  following row with `tablet-landscape:col-span-12` and no column-start offset,
  and mobile order remains Interviewer, Fresco, Interviewer Classic; and
- existing behavior and presentation contracts remain intact.

### Locale integration tests

- US English, UK English, and Spanish pages render their message catalogs and
  CSV content;
- internal links retain the active locale;
- the selector switches the equivalent route;
- metadata, canonical URLs, alternate links, and document language are
  localized; and
- root proxy negotiation selects Spanish for Spanish requests, UK English for
  UK English requests, and US English otherwise.

### Completion checks

- all website tests pass;
- website type checking passes;
- lint runs with automatic fixes and passes;
- all touched files pass the project formatter;
- `pnpm knip` passes;
- the production Next.js runtime build passes; and
- the build pre-renders `/en-US`, `/en-GB`, `/es`, and their Get Started routes,
  while download paths contain redirects only.

## Accessibility and Compatibility

The language selector is fully keyboard operable, has visible focus treatment,
and uses localized accessible names. The Get Started pathway links and Classic
platform controls also use localized accessible names that identify their
destination or target app. Status badges supplement translated app guidance
rather than carrying meaning alone. Translated labels are allowed to expand
without fixed dimensions that clip content. Existing reduced-motion behavior is
preserved. The final implementation is verified at representative desktop and
mobile sizes in all locales without redesigning the page.
