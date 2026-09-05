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

The host merges `commonCatalogs`, each consumed package's catalogs, and its app
catalog with `mergeCatalogs`. Every locale in `ecosystemLocales` has a complete
catalog in each catalog-owning shared package, except `en-GB`, which is a sparse
reviewed English override. English `src/locales/en.json` files are generated
extraction artifacts, never runtime imports: descriptor defaults provide the
English runtime fallback. Keep application catalogs under
`src/locales/<canonical-BCP-47-tag>.json` for build-time compilation.

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

## Host responsibilities

Mount `AppI18nProvider` with the active locale, supported registry, and merged
messages. Its `onLocaleChange` callback delegates persistence to the host;
`null` means automatic negotiation. `resolveAppLocale` handles canonicalization,
best-fit browser matching, and the explicit English fallback. HTTP hosts can
obtain ordered requested tags using `parseAcceptLanguage` from the root
`@codaco/protocol-validation` export.

The outer provider manages document `lang` and `dir`. An embedded participant
interview or preview has an independent provider with `manageDocument={false}`
and its own element carrying `lang` and `dir`. Keep the current protocol
runtime's language independent from the researcher preference.

Server hosts resolve a request's account/device/browser preference before
rendering, then serialize that initialization to the client. Create each server
formatter with `createAppIntl`; do not put request-specific locale state in a
module global or a cross-user cache. Use the same explicit `timeZone` on both
server formatter and client provider for deterministic date/time hydration.

## Vite builds

Place `appI18n()` from `@codaco/app-i18n/vite` before the framework plugin. It
compiles source defaults and imported locale catalogs to ICU AST and removes
the runtime parser in production application builds. A published package that
owns descriptors/catalogs uses `appI18n({ build: 'library' })` to compile them
while leaving parser selection to its consumers.

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
    resolveAlias: {
      ...(process.env.NODE_ENV === 'production'
        ? {
            '@formatjs/icu-messageformat-parser':
              '@formatjs/icu-messageformat-parser/no-parser',
          }
        : {}),
    },
  },
};

export default nextConfig;
```

Workspace packages export source, so the rules also compile their descriptors
and catalogs. Published packages export precompiled `dist` artifacts and must
compile their own messages during their library build. A non-catalog JSON file
remains ordinary data. Do not alias away the runtime parser unless every source
default and runtime catalog is compiled.

## Validation and generation guidance

Framework-free worker/CLI diagnostics remain available unchanged. Researcher
hosts can opt into localized presentation through the owning package:

- `@codaco/protocol-validation/messages`: protocol-file error descriptors,
  validation-rule labels, and actionable contradiction summaries.
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
merge the corresponding catalogs.

## Verification

Run each owner's `i18n:extract` script and commit the generated English catalog.
The catalog guards check freshness, IDs, translator descriptions, complete
Spanish, sparse British English, valid ICU, and placeholder/rich-text parity.
Also audit rendered surfaces and copy generated outside JSX: a complete
catalog cannot find strings that were never extracted. Exercise production
builds, live locale changes, host preference persistence, and independently
review translation meaning and layout.
