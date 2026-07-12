# NetworkCanvas.com Internationalisation and CSV Content Design

**Date:** 2026-07-12

## Goal

Internationalise the statically exported NetworkCanvas.com site in English and
Spanish with `next-intl`, and move Latest News, Recent Publications, Grants, and
Core Team records into simple build-time CSV files. The work must preserve the
current page structure and presentation, apart from adding the approved language
selector.

## Scope

This work includes:

- English and Spanish versions of every page and all user-facing copy.
- Locale-prefixed static routes at `/en`, `/es`, `/en/download`, and
  `/es/download`.
- Browser-language redirects from `/` at the Netlify CDN edge.
- A locale selector in the desktop navigation, mobile navigation, and footer.
- Build-time CSV content for Latest News, Recent Publications, Grants, and Core
  Team.
- Localised metadata, canonical URLs, and English/Spanish alternate links.
- Build-time validation and automated tests for localisation, content loading,
  routing, and static export.

This work does not redesign sections, alter their animations, or change their
display order or layout.

## Routing and Static Rendering

All content pages use an explicit locale prefix:

| Content  | English        | Spanish        |
| -------- | -------------- | -------------- |
| Home     | `/en`          | `/es`          |
| Download | `/en/download` | `/es/download` |

The Next.js app continues to use `output: 'export'`. Both locales and both pages
are generated during `next build`; no Next.js middleware, server function,
runtime content request, or browser-only translation layer is introduced.

The root `/` route has two redirect mechanisms:

1. `apps/networkcanvas.com/netlify.toml` contains ordered, forced CDN redirects.
   A Spanish `Accept-Language` preference receives a temporary redirect to
   `/es`. Every other request receives a temporary redirect to `/en`.
2. A statically generated root fallback redirects to `/en` for local development
   and deployments that do not process Netlify rules.

Temporary redirects are required because browser language preferences can
change. The language selector provides an explicit user override and switches
between the equivalent route without returning the user to the home page.

## next-intl Architecture

The website mirrors the proven `next-intl` structure already used by
`apps/documentation`:

- `next.config.ts` is wrapped with the `next-intl` plugin.
- Routing configuration declares `en` and `es`, with `en` as the default locale
  and an always-prefixed URL strategy.
- Request configuration loads the complete message catalog for the requested
  locale.
- Locale layouts validate route parameters, call `setRequestLocale`, set the
  document `lang`, and provide `NextIntlClientProvider` to client components.
- `generateStaticParams` emits both locales.
- Locale-aware navigation helpers preserve the current locale for internal
  links and switch locales while retaining the current pathname.
- English message types augment `next-intl` so invalid message keys fail type
  checking.

Every user-facing string moves into `messages/en.json` and `messages/es.json`,
including:

- navigation and footer labels;
- headings, paragraphs, buttons, and calls to action;
- Latest News and carousel accessibility labels;
- mailing-list form labels, placeholders, errors, and success states;
- download-page copy;
- metadata and Open Graph copy; and
- image alternative text that is not supplied by CSV content.

English retains the current copy and is the source locale. Spanish uses clear,
neutral international Spanish. Complete ICU messages and `t.rich` are used for
sentences containing links or emphasis so translations do not concatenate
grammatical fragments. Product names, people names, external URLs, colors, and
asset paths remain locale-neutral configuration.

Each localized page emits:

- the correct `<html lang>` value;
- localized title, description, and Open Graph metadata;
- a canonical URL for its locale; and
- alternate links for `en` and `es`.

Missing messages are errors. A localized page must never silently mix English
and Spanish.

## Language Selector

A compact `English / Español` selector appears in the desktop navigation, mobile
navigation, and footer. It uses locale-aware navigation rather than direct
location mutation, remains keyboard accessible, has a visible focus state, and
exposes a localized accessible label. Switching locale preserves the current
page:

- `/en` switches to `/es`;
- `/es` switches to `/en`;
- `/en/download` switches to `/es/download`; and
- `/es/download` switches to `/en/download`.

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
- translated interactive labels remain accessible; and
- existing behavior and presentation contracts remain intact.

### Locale integration tests

- English and Spanish pages render their message catalogs and CSV content;
- internal links retain the active locale;
- the selector switches the equivalent route;
- metadata, canonical URLs, alternate links, and document language are
  localized; and
- root redirect configuration selects Spanish for Spanish requests and English
  otherwise.

### Completion checks

- all website tests pass;
- website type checking passes;
- lint runs with automatic fixes and passes;
- all touched files pass the project formatter;
- `pnpm knip` passes;
- the production static build passes; and
- export output contains `/en`, `/es`, `/en/download`, and `/es/download`.

## Accessibility and Compatibility

The language selector is fully keyboard operable, has visible focus treatment,
and uses localized accessible names. Translated labels are allowed to expand
without fixed dimensions that clip content. Existing reduced-motion behavior is
preserved. The final implementation is verified at representative desktop and
mobile sizes in both locales without redesigning the page.
