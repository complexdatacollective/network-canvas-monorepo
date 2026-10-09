# Application UI localization

`@codaco/app-i18n` is the supported internationalization facade for Network
Canvas application chrome. Protocol-authored content, collected data, and
persisted identifiers keep their own language and identity.

## Messages and catalogs

Import `defineMessages`, `defineMessage`, `createAppIntl`, and their types from
`@codaco/app-i18n/messages`. This entry is safe in React Server Components and
ordinary JavaScript contexts. Use `useAppIntl` in client components; it renders
English defaults when no provider is mounted.

Give every descriptor a stable namespaced ID, an English `defaultMessage`, and
a description that explains its context to a translator. Keep sentences whole;
use ICU plurals/selects, rich-text tags, and number/date arguments instead of
joining translated fragments.

```tsx
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

const messages = defineMessages({
  selected: {
    id: 'example.records.selected',
    defaultMessage:
      '{count, plural, one {# record selected} other {# records selected}}',
    description: 'Selection count above the researcher records table.',
  },
});

function SelectedCount({ count }: { count: number }) {
  return useAppIntl().formatMessage(messages.selected, { count });
}
```

The host loads the catalogs of `common`, each consumed package, and its own app,
one locale at a time (see [Loading catalogs](#loading-catalogs)). Every locale
in `ecosystemLocales` has a complete catalog in each catalog-owning shared
package, except `en-GB`, which is a sparse reviewed English override. English
`src/locales/en.json` files are generated extraction artifacts, never runtime
imports: descriptor defaults provide the English runtime fallback. Keep
application catalogs under `src/locales/<canonical-BCP-47-tag>.json` for
build-time compilation.

An app declares the subset it actually supports; adding a locale to the
ecosystem does not require another app to advertise it. `defineAppLocales`
adds the diagnostic pseudo-locale only when explicitly enabled. Do not persist
that diagnostic choice as a production preference.

Use `AppMessage` from `@codaco/app-i18n/react` for queued dialogs or toasts:

```tsx
<AppMessage message={messages.selected} values={{ count }} />
```

The node subscribes to the active provider even after it has been queued.
Formatting to a string when an operation starts freezes the old language.
Fresco UI dialog titles, descriptions, action labels, and `describeError`
callbacks accept these nodes.

For existing string-only error/result contracts, `createMessageError` from
`@codaco/app-i18n/messages` preserves a plain-text descriptor and its named values
without capturing the active locale. It retains both source defaults and compiled
ICU AST. Fresco UI's existing field/form error renderers resolve these messages at
display time and preserve server refusals during a language switch. Use
`AppErrorMessage` from `@codaco/app-i18n/react` for other stored string errors, or
`formatMessageError(error, intl) ?? error` in a string renderer. Ordinary
validation/diagnostic text remains unchanged. A transported list uses
`{ dependencies: { list: dependencyIds } }`, so conjunctions are formatted in the
reader's language rather than captured before the switch.

When a whole message contains a separately owned translated label, pass
`{ rule: { messageError: createMessageError(ruleDescriptor) } }`. List items
also accept this explicit wrapper. Ordinary strings are always literal data,
even if they happen to resemble an encoded error. This keeps shared rule names
and unnamed-attribute labels reactive without duplicating their translations.

## Loading catalogs

Every catalog-owning package exports a map of loaders: for each locale it
translates, a function returning `import('./<tag>.json')`. Each language is
therefore its own chunk, and a host downloads only the one it renders. English
has no loader and needs none.

| Package                       | Entry                                 | Export                             |
| ----------------------------- | ------------------------------------- | ---------------------------------- |
| `@codaco/app-i18n`            | `@codaco/app-i18n/common`             | `commonCatalogLoaders`             |
| `@codaco/fresco-ui`           | `@codaco/fresco-ui/locales`           | `frescoUiCatalogLoaders`           |
| `@codaco/interview`           | `@codaco/interview/locales`           | `interviewCatalogLoaders`          |
| `@codaco/network-exporters`   | `@codaco/network-exporters/locales`   | `networkExporterCatalogLoaders`    |
| `@codaco/protocol-builder`    | `@codaco/protocol-builder/locales`    | `protocolBuilderCatalogLoaders`    |
| `@codaco/protocol-utilities`  | `@codaco/protocol-utilities/locales`  | `protocolUtilitiesCatalogLoaders`  |
| `@codaco/protocol-validation` | `@codaco/protocol-validation/locales` | `protocolValidationCatalogLoaders` |

A host declares its own loaders in the same shape and passes everything it
renders to `createCatalogSource` from `@codaco/app-i18n/locales`, in merge order:
common first, then shared packages, then the app. Later loaders win on a shared
ID.

```ts
import { commonCatalogLoaders } from '@codaco/app-i18n/common';
import {
  createCatalogSource,
  type CatalogLoaders,
} from '@codaco/app-i18n/locales';
import { frescoUiCatalogLoaders } from '@codaco/fresco-ui/locales';

const appCatalogLoaders: CatalogLoaders = {
  'es': () => import('./es.json'),
  'zh-Hans': () => import('./zh-Hans.json'),
};

export const catalogSource = createCatalogSource(
  commonCatalogLoaders,
  frescoUiCatalogLoaders,
  appCatalogLoaders,
);
```

The source merges and caches one locale at a time:

- `load(locale)` resolves to the merged catalog. Concurrent and repeated calls
  share one request, and the call after a failed load starts a fresh one.
- `attempt(locale)` returns the load the locale already has, including its
  last failed attempt, and starts one only if there is none. Suspend on this
  rather than `load`: a render that suspends on `load` would start a new
  attempt every time React retries it, and never settle. A `load` an attempt
  joined while it was in flight counts as an attempt. One that failed before
  any attempt joined it (a preload before the first render, say) is not handed
  on, so the first attempt after it still tries afresh.
- `peek(locale)` returns the merged catalog once it has loaded, otherwise
  `undefined`. A locale no package translates (English, the pseudo-locale) is
  always ready with an empty catalog.
- `subscribe(onLoad)` reports each finished load and returns the unsubscribe.

`useLocaleCatalog(source, locale, preloaded?)` from `@codaco/app-i18n/react`
returns the `{ locale, messages, failure }` to give `AppI18nProvider`. Pass its
result in place of the requested locale, because the two differ while a switch
is loading and when a load fails:

```tsx
import { AppI18nProvider, useLocaleCatalog } from '@codaco/app-i18n/react';
import type { ReactNode } from 'react';

import { appLocales } from './locales';
import { catalogSource } from './locales/catalogs';

export function I18n({
  locale,
  children,
}: {
  locale: string;
  children: ReactNode;
}) {
  const rendered = useLocaleCatalog(catalogSource, locale);
  return (
    <AppI18nProvider
      locale={rendered.locale}
      locales={appLocales}
      messages={rendered.messages}
      loadFailure={rendered.failure}
    >
      {children}
    </AppI18nProvider>
  );
}
```

The hook keeps the current language on screen until the new one has loaded,
then changes over in one render, so a switch never passes through English or
shows a half-translated interface. With nothing on screen yet there is no
language to keep, so the first load suspends: render the provider under a
Suspense boundary, or await `source.load(locale)` before the first render so it
never suspends.

A load that fails never stops the interface. A switch stays in the current
language, and a first load falls back to English, which every descriptor
carries. Either way the hook returns the language it could not load as
`failure`, and keeps trying: at once when the device comes back online,
otherwise after a wait that doubles with each failure, up to 30 seconds. A
browser that keeps a failed module import for the life of the page, as Chrome
does, answers each of those retries from the failure without a request, so
there the language arrives only after a reload. Give `failure` to the provider
as `loadFailure`, and tell the user: `useLocaleLoadFailure()` returns the
registry entries of the language that could not be loaded (`locale`) and the
one on screen in its place (`shown`), with the `error`, and
`LocaleLoadFailureToast` from
`@codaco/fresco-ui` shows it as a toast that stays until it is dismissed or the
language arrives.

A server host loads the request's catalog, formats with it, and sends the same
messages to the client as props. Passing them as the hook's `preloaded` argument
renders and hydrates in that language without a download, for as long as
`preloaded.locale` matches `locale`:

```tsx
// On the server, per request:
const messages = await catalogSource.load(locale);
const intl = createAppIntl({ locale, messages });

// In the client provider, with `messages` received as a prop:
const rendered = useLocaleCatalog(catalogSource, locale, { locale, messages });
```

Where no source is needed, such as a one-off server formatter, a Storybook
decorator, or a test, `loadCatalog(locale, ...loaders)` from
`@codaco/app-i18n/locales` loads and merges a single locale:

```ts
import { commonCatalogLoaders } from '@codaco/app-i18n/common';
import { loadCatalog } from '@codaco/app-i18n/locales';
import { frescoUiCatalogLoaders } from '@codaco/fresco-ui/locales';

const messages = await loadCatalog(
  'es',
  commonCatalogLoaders,
  frescoUiCatalogLoaders,
);
```

The loaders import their JSON without an `import` attribute, so catalogs load
only through a bundler; Node's own ESM loader cannot read them. A package or app
that owns catalogs asserts that each committed `src/locales/<tag>.json` has a
loader that loads it, and no loader points at a missing file, with
`checkCatalogLoaders(localesDir, loaders)` from `@codaco/app-i18n/catalog-guards`.
It resolves to a list of problems, empty when the loaders are sound.

## Host responsibilities

Mount `AppI18nProvider` with the active locale, supported registry, and that
locale's messages from a catalog source. Its `onLocaleChange` callback delegates
persistence to the host; `null` means automatic negotiation. `resolveAppLocale`
handles canonicalization, best-fit browser matching, and the explicit English
fallback. Browser preferences are matched one at a time, in order, so the first
preference with an acceptable fit wins: `es-MX, en` selects Spanish when `es` is
declared. Chinese requests
are matched by script, so `zh-TW`, `zh-HK` and `zh-MO` select `zh-Hant` and
`zh`, `zh-CN` and `zh-SG` select `zh-Hans`, even when a generic `zh` follows a
regional tag in the browser list. HTTP hosts can obtain ordered requested tags
using `parseAcceptLanguage` from the root `@codaco/protocol-validation` export.

The outer provider manages document `lang` and `dir`. An embedded participant
interview or preview has an independent provider with `manageDocument={false}`
and its own element carrying `lang` and `dir`. Keep the current protocol
runtime's language independent from the researcher preference.

Server hosts resolve a request's account/device/browser preference before
rendering, then serialize that initialization to the client. Create each server
formatter with `createAppIntl`, passing the catalog from
`source.load(locale)`; do not put request-specific locale state in a
module global or a cross-user cache. Use the same explicit `timeZone` on both
server formatter and client provider for deterministic date/time hydration.

## Vite builds

Place `appI18n()` from `@codaco/app-i18n/vite` before the framework plugin. It
compiles source defaults and imported locale catalogs to ICU AST. The ICU
parser stays in every bundle, because protocol strings are ICU messages that
`@codaco/protocol-validation` and the interview runtime parse at run time. A
published package that owns descriptors/catalogs uses the same `appI18n()` in
its library build so its messages reach consumers already compiled.

## Next.js with Turbopack

Use `@codaco/app-i18n/next-loader` for source defaults and source locale catalogs.
The shared loader applies the same compiler as Vite and preserves client
directives. The source rule retains the original extension so Next still
performs its normal TypeScript/JSX transform; only the JSON rule emits JavaScript.

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.{js,jsx,ts,tsx}': {
        condition: { not: 'foreign' },
        loaders: ['@codaco/app-i18n/next-loader'],
      },
      '**/src/locales/*.json': {
        condition: { not: 'foreign' },
        loaders: ['@codaco/app-i18n/next-loader'],
        as: '*.js',
      },
    },
  },
};

export default nextConfig;
```

Workspace packages export source, so the rules also compile their descriptors
and catalogs. Published packages export precompiled `dist` artifacts and must
compile their own messages during their library build. A non-catalog JSON file
remains ordinary data. Do not alias away the runtime parser: protocol strings
are parsed at run time.

## Validation and generation guidance

Framework-free worker/CLI diagnostics remain available unchanged. Researcher
hosts can opt into localized presentation through the owning package:

- `@codaco/protocol-validation/messages`: protocol-file error descriptors,
  validation-rule labels, actionable contradiction summaries, and
  `formatMigrationNotes(version, notes, intl)` for migration approval guidance.
  Known migration versions translate each complete Markdown bullet while
  preserving list structure and literal protocol defaults; unknown versions
  retain their supplied notes. Core migration notes remain English.
- `@codaco/protocol-utilities/messages`: generation conflict guidance selected
  by stable reason codes; original technical diagnostics remain available.
- `@codaco/network-exporters/messages`: export progress descriptors selected
  by stable event stage IDs.
- `@codaco/protocol-builder`: localized stage interface display names, keeping
  persisted protocol naming independent from the active locale.

Each package provides its translations through its `./locales` export. The
message and locale entries in validation/utilities/exporters have an optional
`@codaco/app-i18n` peer; their existing engine entry points do not acquire a
React dependency. Hosts choosing localized presentation install the peer and
add the package's catalog loaders (listed under
[Loading catalogs](#loading-catalogs)) to their catalog source.

## Translation provenance

Changing an English sentence invalidates its translations. Each locale catalog
has a committed record of the English its entries were made from, in a sibling
`src/locales/<tag>.source.json`, and the catalog guards fail when a recorded
sentence no longer matches today's `en.json`.

Without it a reworded English string leaves every translation saying the old
thing with every other guard still green: the catalog is complete, the ICU
arguments still match, nothing is blank, and the wrong copy is on screen. This
is not hypothetical — it shipped a Spanish string telling researchers a
protocol had been downloaded after the English had been changed to say that no
file was written at all.

So, when the English behind a translation changes:

1. `pnpm --filter <pkg> i18n:extract` regenerates `en.json`, and the guard
   starts failing with the id, the English it was translated from, the English
   it says now, and the translation itself.
2. Decide, per id, from those three sentences. Most English edits are
   editorial — a capitalisation, a comma, a synonym — and the translation still
   says the right thing. Some change the meaning, and the translation has to be
   rewritten before it goes back in front of a reader.
3. `pnpm --filter <pkg> i18n:stamp` rewrites the records and prints every pair
   it accepted. Read that report, and commit it alongside any retranslation;
   the sidecar diff is the reviewable record of what was accepted.

Read these files from disk; never import one. That is what keeps the English
copy out of bundles, and the name backs it up: a locale tag cannot contain a
dot, so no build step that scans a locales directory can mistake
`es.source.json` for a catalog.

Only the `defaultMessage` is recorded, not the `description`. A description is
advisory, and it is edited for editorial reasons that do not change the
sentence a translator produced; coupling the two would fire the guard on
clarifications and train people to re-stamp without reading, which is the one
habit that would make this guard worthless.

## Verification

Run each owner's `i18n:extract` script and commit the generated English catalog.
The catalog guards check freshness, IDs, translator descriptions, complete
Spanish, sparse British English, valid ICU, placeholder/rich-text parity, that
every committed catalog has a loader that loads it, and that every translation
still records the English it was made from.
Also audit rendered surfaces and copy generated outside JSX: a complete
catalog cannot find strings that were never extracted. Exercise production
builds, live locale changes, host preference persistence, and independently
review translation meaning and layout.
