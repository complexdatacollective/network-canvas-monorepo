---
'@codaco/app-i18n': minor
'@codaco/fresco-ui': major
'@codaco/interview': major
'@codaco/network-exporters': major
'@codaco/protocol-utilities': major
'@codaco/protocol-validation': major
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Architect, Interviewer and Fresco now download only the interface language you
are using, instead of every translation at once. English needs no download at
all, and starting in another language fetches that one language before the
first screen appears, so the interface never shows English first and then
switches. Changing language loads the new one and then switches over, keeping
the current language on screen in the meantime. If a language cannot be
downloaded, the app keeps working — in English at startup, or in the current
language after a switch — and a notice names the language that could not be
loaded and offers to reload; the language still switches in by itself if a
later attempt succeeds. In an interview the same notice appears without the
reload. Installed offline copies of Architect and Interviewer still hold every
language, so switching works without a connection. A Fresco interview in
another language now arrives with its messages, so it opens without waiting for
a download, and Architect's preview and Interviewer fetch the interview's
language while they prepare it rather than afterwards.

Breaking: each package's catalog map is replaced by per-locale loaders.
`commonCatalogs`, `frescoUiCatalogs`, `interviewCatalogs`,
`networkExporterCatalogs`, `protocolUtilitiesCatalogs` and
`protocolValidationCatalogs` become `commonCatalogLoaders`,
`frescoUiCatalogLoaders`, `interviewCatalogLoaders`,
`networkExporterCatalogLoaders`, `protocolUtilitiesCatalogLoaders` and
`protocolValidationCatalogLoaders`: for each translated locale, a function that
dynamically imports that locale's catalog. Combine them with
`createCatalogSource(...)` from `@codaco/app-i18n/locales`, then either
`await source.load(locale)` before rendering or pass the source to
`useLocaleCatalog` from `@codaco/app-i18n/react`, which feeds
`AppI18nProvider`. `loadCatalog(locale, ...loaders)` loads and merges one
locale where no source is needed, and `checkCatalogLoaders` in
`@codaco/app-i18n/catalog-guards` checks that every committed catalog has a
loader that loads it. `InterviewI18nProvider` from `@codaco/interview` now
suspends while the catalog for a language it has not shown yet loads, so a
host that renders it directly needs a `Suspense` boundary above it; `Shell`
brings its own and shows a spinner in the interview's frame meanwhile.

A catalog that cannot be loaded no longer reaches an error boundary.
`useLocaleCatalog` falls back to English for a first load, or keeps the current
language for a switch, and returns the `failure`; pass it to `AppI18nProvider`
as `loadFailure`, and read it anywhere below with `useLocaleLoadFailure()`.
`@codaco/fresco-ui/LocaleLoadFailureToast` presents it as a toast that stays
until the language arrives, with an optional `onReload` button and an
`onFailure` callback for error reporting. A fresco-ui toast with both a
description and an action button no longer pushes the button out of view.

`Shell` takes an optional `catalog`, and the new `@codaco/interview/catalog`
entry, which carries no React and can be imported on a server, exports
`loadInterviewCatalog(requestedLocale, localePreference)`: it negotiates as
`Shell` does and resolves to the `catalog` to pass, so a server-rendered host
can deliver the interview's messages with the page and a client host can start
the download before mounting `Shell`.
