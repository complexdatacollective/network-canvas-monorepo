# Network Canvas Documentation

Welcome to the Network Canvas documentation website—a comprehensive resource for users of Network Canvas, a suite of applications designed to facilitate the collection of social network data.

## Overview

This documentation site covers various aspects of Network Canvas, including detailed information about its primary applications and related products. Whether you're a researcher, developer, or user, this documentation aims to provide you with the necessary information to make the most out of Network Canvas.

## Development

To run the app locally:

1. Set up the required environment variables in the `.env` file (refer to the template in `.env.example`).
2. Run `pnpm run build` to generate the static sidebar JSON and Algolia search index.

In development, `NEXT_PUBLIC_NETWORK_CANVAS_URL` is loaded automatically from
`.env.development` and points to the website at `http://localhost:3001`.
Override it in `.env.development.local` when using a different origin. When it
is unset outside development, links use `https://networkcanvas.com`. Netlify
deploy previews derive the matching website preview automatically; a
configured value takes precedence.

## Features

### 1. Product Coverage

- **Network Canvas Core:** The desktop suite includes two applications tailored to assist researchers in social network data collection.

- **Fresco (Interviewer in Browser):** Explore detailed documentation on Fresco, a key component of Network Canvas, providing an in-browser interviewer for streamlined data collection.

### 2. Search Functionality

Effortlessly find the information you need with the top-level search bar. Instantly locate relevant documentation, making navigation and discovery a breeze.

Search is powered by Algolia DocSearch (`@docsearch/react`) in `components/DocSearchComponent.tsx`, configured via the `NEXT_PUBLIC_ALGOLIA_*` env vars in `env.js`. Production receives these values from GitHub Actions secrets, while the `documentation-dev` Netlify site provides them to Git-integrated deploy previews. Results are made section-aware in two ways:

- **Section badge** — each result shows a coloured pill naming its workflow section (Get Started, Design Protocols, …), matching the homepage colours. The section slug is derived purely client-side from the hit's URL (the first path segment after the locale), so no Algolia-side data is required for the badge. Colours and labels come from `lib/sections.ts` and the `SectionSwitcher` translation namespace.
- **Current-section boost** — results from the section the reader is currently in are boosted (via Algolia `optionalFilters`) so same-section pages rank higher, while every section still appears.

#### Algolia `section` attribute (crawler-side, not in this repo)

The current-section boost filters on a `section` attribute on each Algolia record. This attribute is **not** produced by anything in this repo — it is populated by the hosted Algolia DocSearch **crawler**, whose config lives in the Algolia dashboard (app `QJYMR8V9ES`, index `networkcanvas`), not here. The setup is:

1. **Crawler `recordExtractor`** derives the slug from the page URL and attaches it to every record:

   ```js
   recordExtractor: ({ helpers, url }) => {
     const section = url.pathname.split("/").filter(Boolean)[1]; // /en/<section>/...
     return helpers.docsearch({ /* … */ }).map((record) => ({ ...record, section }));
   }
   ```

2. **`section` is facetable** (`filterOnly(section)`). This must be set in **two** places: the crawler's `initialIndexSettings.networkcanvas.attributesForFaceting` _and_ the live index's _Attributes for faceting_ (Configuration → Facets). The crawler's `initialIndexSettings` only applies when the index is first created, so the live index must be configured directly for an existing index.

#### Search in each language

The search box shows only results in the page's language: it filters on the `lang` attribute, which the crawler takes from each page's `<html lang>`, and each page also sets the `docsearch:language` meta tag. The crawler must therefore crawl every published language: its start URLs and sitemap need to include `/es/` and `/fr/` as well as `/en/`. Until it has crawled a language's pages, search on a page in that language finds nothing.

Because the slug is the first path segment after the locale, records only carry the correct workflow-section values once the reorganised `/en/<section>/…` routes are deployed and the crawler re-crawls them. `optionalFilters` against a facetable attribute with no matching values simply boosts nothing, so the client code is safe to deploy ahead of a crawl.

### 3. Table of Contents

For in-depth articles, utilize the convenient Table of Contents component located on the right side of the page. Jump directly to the sections you need, enhancing your reading experience.

### 4. Sidebar Navigation

Navigate seamlessly through the documentation using the intuitive sidebar located on the left. Access different sections and categories with ease.

### 5. AI Assistant

Experience enhanced productivity with our AI Assistant. Trained on the documentation, it can generate precise answers based on the content, aiding users in finding information quickly.

### 6. Language Localization

The site is published in English, Spanish and French. Every change to the English must update every published language in the same pull request; a test fails CI otherwise. How translations are made, checked and kept in step with the English is described in [`translation/README.md`](./translation/README.md).

Readers change language with the switcher in the footer. Their choice is stored in the `NEXT_LOCALE` cookie that every Network Canvas website shares, so it carries between the website and the documentation, and the locale edge function reads it before the browser's languages.

### 7. Dark and Light Modes

Choose between dark and light modes to suit your preferences and reduce eye strain during extended reading sessions.

### 8. Analytics

The documentation site records pageviews, page leaves and exceptions with PostHog (`posthog-js`), initialized in `instrumentation-client.ts` when client-side JS loads.

The site is a static export, so the same bundle is served in production, on Netlify deploy previews and locally. Analytics therefore start only when the page was loaded from the live site's hostname (`lib/analytics/isProductionHost.ts`); every other origin records nothing.

## Get Started

Explore the Network Canvas documentation to unlock the full potential of social network data collection. Whether you're a new user or an experienced researcher, this documentation is here to support you

Thank you for choosing Network Canvas!

---

# Redirects

The site is hosted on Netlify. Redirects live in `netlify.toml`, and the locale edge function in `netlify/edge-functions/locale.ts` sends readers to their language.

- `pnpm validate-redirects` checks `netlify.toml` for rules that can never match and for duplicates.
- `pnpm test-redirects <deployment-url>` requests each listed address from a deployment and checks where it redirects.
