# Studio UI Localization and Shared App i18n Design

**Status:** Accepted for implementation (2026-09-04).

**Tracking:** #1309 (Shared i18n infrastructure package) and #1310 (Studio UI
localization), under epic #1308 (Localization & internationalisation), part of
the Studio specification tree (#1242).

**Related:** the protocol localization design
(`docs/superpowers/specs/2026-08-27-protocol-localization-design.md`), whose
non-goals section names this work as "a separate application-message-catalog
project"; the Studio app shell design
(`docs/superpowers/specs/2026-09-01-studio-app-shell-design.md`), whose §8
defers the locale negotiation chain to #1309 and reserves `/account/language`
for #1310; #1312 (translation service integration); #1313 (localized interview
delivery); #1315 (WCAG-compliant component foundations, whose Storybook
harness verifies RTL here).

## 1. Summary

Network Canvas has two localization concerns that must never be conflated:
what a **protocol** says to a **participant** (schema-9 `LocalizedString`
content, designed in the protocol localization spec) and what an
**application** says to its **user** (chrome, navigation, forms, dialogs,
errors). This design covers the second concern: a shared workspace package,
`@codaco/app-i18n`, that gives every application in the monorepo one way to
declare, extract, translate, negotiate, and render its own user-interface
messages — and the first full adoption of that package, the researcher-facing
Studio interface.

The package wraps FormatJS (`react-intl` and `@formatjs/intl-localematcher`)
behind a small curated API. Messages are declared next to the code that
renders them, as ICU MessageFormat descriptors with explicit ids, inline
English source text, and a description for translators. A CLI extraction step
generates the committed English catalog; translated catalogs are per-locale
JSON files reviewed in pull requests; build-time compilation turns every
message — source defaults and catalogs alike — into pre-parsed AST so
production bundles carry no ICU parser. A component that renders through the
package works in English with no provider mounted, which is what lets
`@codaco/fresco-ui` adopt message descriptors without breaking the four
applications that have not localized yet.

Studio becomes the reference consumer. It declares two supported UI locales —
`en` (source) and `en-GB` (a sparse override catalog, the same shape the
website uses) — plus a dev-only pseudo-locale. The locale a researcher sees is
resolved by one negotiation chain: their stored account preference, then the
device's last-known choice, then browser language negotiation, then `en`. The
preference is a new nullable `locale` column on the auth-plane `user` table,
surfaced on the `me` payload, and edited from the `/account/language` route
the app shell already reserves. The provider owns `<html lang>` and
`<html dir>`; layout uses CSS logical properties so right-to-left support is a
direction, not a second stylesheet, verified in the fresco-ui Storybook
harness.

### 1.1 Decisions this design records

Taken 2026-09-04 in specification review:

1. **App UI localization is a separate system from protocol content
   localization, and the two meet only at conventions.** Protocol-authored
   participant strings are schema data resolved by
   `@codaco/protocol-validation` helpers and rendered by `@codaco/interview`
   (per the accepted 2026-08-27 design). Application chrome is message
   catalogs owned by each app and rendered through `@codaco/app-i18n`. The
   shared conventions are the locale-metadata shape
   (`{ locale, label, direction }`), FormatJS best-fit matching, the rule
   that the host owns document-level `lang`/`dir` while nested content regions
   may override their own, and one message syntax: protocol-authored
   formatted strings are ICU MessageFormat-compatible so a single runtime
   renders both systems' messages (recorded 2026-09-04 on #1477).
2. **The shared infrastructure package is `@codaco/app-i18n`, built on
   `react-intl`, published to npm in the normal changeset lane.** The grant
   names ECMAScript Intl, Unicode CLDR, and ICU Message syntax; FormatJS is
   the reference implementation of exactly those standards, and the monorepo
   already uses its locale matcher. Consumers import only from
   `@codaco/app-i18n`, never from `react-intl` directly, so the wrapper can
   enforce house rules (provider-optional rendering, curated API surface).
   The choice is validated against every host type in the end state: the
   Vite SPAs (Studio, Architect, Interviewer) mount the provider directly,
   and Next.js (Fresco) uses the same bindings in client components with
   `createAppIntl` on the server — which is what rules out next-intl
   (Next-only) as the shared runtime.
3. **Messages are source-of-record in code**: `defineMessages` beside the
   rendering component, with an explicit dot-namespaced id, an inline English
   `defaultMessage`, and a `description` for translators. The committed
   `src/locales/en.json` is a generated extraction artifact guarded for
   freshness in CI, not a hand-edited file. Translated catalogs are
   hand-reviewable per-locale JSON keyed by id.
4. **Rendering never breaks on a missing translation, but supported locales
   are complete by policy.** At runtime every message falls back to its
   English `defaultMessage`. In CI, a full locale's catalog must cover every
   extracted id and carry token-parity with the source (the website's guard,
   generalized); an override locale (`en-GB`) must be a subset with
   token-parity. This blends the website's "never silently mix languages"
   build bar with the availability requirement of an operational tool.
5. **`@codaco/fresco-ui` stays provider-optional and gains its own catalog.**
   Every baked-in English string in fresco-ui (27 hardcoded strings, English
   prop defaults, form-validation copy, icon titles) becomes a message
   descriptor rendered through `@codaco/app-i18n`; with no provider mounted
   the component renders English exactly as today, so Architect, Interviewer,
   Fresco, docs, and the website are unaffected until they adopt. fresco-ui's
   catalog ships with the package and hosts merge it with their own.
6. **The app locale negotiation chain (the one app-shell §8 defers to #1309)
   is: stored account preference → device mirror → browser languages
   best-fit → app default.** An explicit user choice becomes the stored
   preference at the moment it is made; it is never concatenated with browser
   preferences. Matching uses `@formatjs/intl-localematcher` `best fit`
   against the app's declared locales.
7. **Studio's per-user preference is a nullable `locale` column on the
   better-auth `user` table**, exposed on `MeSchema`, and written by a new
   `account.updateLocale` RPC that requires only a user (no tenant). `null`
   means "follow the browser". The write is not an audited command: the audit
   log records study and team activity, and a personal presentation
   preference has neither a tenant to record against nor research-data
   significance.
8. **Studio ships `en` and `en-GB` as supported locales, plus a dev-only
   pseudo-locale.** `en-GB` is a sparse override catalog carrying only
   regional divergences, deep-merged over English — the website's proven
   shape. Machine-produced first-pass translations are acceptable when
   human-reviewed in the pull request; commissioned translations arrive
   through #1312 and replace them.
9. **RTL is direction, not a second stylesheet.** New layout code uses CSS
   logical properties; existing physical-direction utilities in Studio and in
   the fresco-ui components Studio consumes are converted; the fresco-ui
   Storybook harness (the same one #1315 uses for accessibility) gains an RTL
   global so direction is verified per component in CI. No RTL locale ships
   in the initial set, but the infrastructure is complete and tested.
10. **The everything-bar and navigation-manifest label shapes are confirmed as
    the catalog contract.** Labels are whole translated strings; counts and
    lists are ICU `plural` and list formatting, never sentence assembly.
    fresco-ui components keep receiving host-supplied strings for
    host-specific copy (`EverythingBarLabels`, `accessibleName` callbacks);
    the catalog conversion applies to copy fresco-ui itself owns.
11. **Copy lives with the package that owns the string, and universal chrome
    is translated exactly once.** Shared packages ship their own descriptors
    and catalogs (`frescoUi.*` now; `interview.*` when #1313 converts that
    package by the same mechanism), and `@codaco/app-i18n` itself ships a
    `common` module — descriptors and catalogs for genuinely universal
    chrome verbs and boilerplate (`common.*`: cancel, save, close, retry,
    generic failure copy) that shared packages and every app import instead
    of redefining. Hosts merge app + shared-package + common catalogs;
    dot-namespaced ids make collisions structurally impossible.
12. **Locale coverage policy differs for apps and shared packages.** Each
    app declares its own supported registry (Studio ships `en`/`en-GB`);
    a shared package's catalogs must cover every locale any in-repo app
    ships, so shared-package completeness guards run against a central
    ecosystem locale set (data exported by `@codaco/app-i18n`, updated in
    the PR that adds a locale to any app), while app registries are
    subsets of it.

## 2. Requirements

### 2.1 Fundamental requirement

A researcher whose language is not English can operate every Studio surface —
sign-in through study administration — in a supported locale of their choice,
with that choice following them across devices; and adding the next locale to
Studio (or localizing the next application) must require only translation
work, never engineering rework.

### 2.2 Invariants

1. **No user-visible string is assembled from grammatical fragments.** Every
   message is a whole ICU string; plurals use `plural`, alternatives use
   `select`, emphasis and links use rich-text tags. (`framingTerms.ts` in the
   interview package already documents why: prepending an article to a term
   and lower-casing it is not localizable.)
2. **English keeps working everywhere, unconditionally.** A component using
   the message API renders its English `defaultMessage` when no provider is
   mounted, when a catalog is missing, and when a message id is absent from
   the active catalog. Localization failures degrade to English, never to
   blank UI or thrown errors.
3. **Locale identity is data; display text is presentation.** Stable ids,
   catalog keys, stored locale tags, and schema values never derive from
   translated text. Stored tags are canonical BCP 47.
4. **Shared modules are universal.** Nothing in `@codaco/app-i18n` reads
   `window`, `navigator`, `document`, or storage at module scope; preference
   collection happens in host adapters (the same rule as protocol
   localization §7.3), so the package serves Vite SPAs, Next.js servers, and
   tests without shims.
5. **The host owns `<html lang>` and `<html dir>`; content regions may
   override locally.** Studio's provider writes the document attributes for
   the app locale; a protocol preview or interview region nests its own
   `lang`/`dir` (protocol design §8.6) without touching the document root.
6. **Catalog artifacts cannot drift silently.** Extraction freshness, full
   completeness for full locales, subset-plus-token-parity for override
   locales, and Turbo input coverage for catalog files are all CI-enforced.
7. **The preference is honored before meaningful first paint.** Studio
   resolves the locale synchronously from the device mirror and browser
   languages before rendering routes; the server-stored preference applies as
   soon as identity loads and is then mirrored, so a returning researcher on
   their own device never sees a language flash.
8. **Message ids are unique and greppable.** Explicit dot-namespaced ids
   (`studio.nav.language`, `frescoUi.dataTable.nextPage`); extraction fails
   on duplicates.

## 3. Scope boundaries

This design deliberately does not cover, and must not creep into:

- **Protocol content localization** (#1475, #1477, #1497): schema-9
  `LocalizedString`, per-string fallback, protocol locale selection, Studio's
  protocol-store round-trip. Owned by the accepted 2026-08-27 design; the
  helpers it places in `@codaco/protocol-validation` are not duplicated here,
  and `@codaco/app-i18n` takes no dependency on protocol packages.
- **Participant-facing runtime chrome** (#1313): the interview package's 61
  hardcoded labels, session-start locale selection, and onboarding copy.
  The _mechanism_ is decided here (decision 11: `interview.*` descriptors
  and catalogs shipped with `@codaco/interview`, rendered provider-optional
  through `@codaco/app-i18n`, common verbs imported from `common.*`), but
  the conversion, its interaction with protocol locale, and its release
  coupling (`BUNDLED_RUNTIME_DEPENDENTS` ties interview changesets to
  Architect, Fresco, and Interviewer) are #1313's work.
- **Translation interchange and commissioning** (#1312): XLIFF or equivalent
  export/import, outstanding-translation tracking, vendor integration. This
  design's committed-JSON catalogs are the substrate #1312 will read and
  write.
- **Transactional email localization** (#1305 territory): server-rendered
  messages to researchers or participants. The `user.locale` column this
  design adds is the value such features will read; nothing else is provided
  for them here.
- **Localizing Architect, Interviewer, and Fresco's researcher chrome**:
  each is a tracked adoption issue under #1308 (created with this design —
  see §13) using the same package, provider, negotiation chain, and
  catalog layering; Fresco's covers the Next.js server boundary (stored
  preference plus `Accept-Language` via protocol-validation's parser, with
  `createAppIntl` on the server). Docs and the website's existing
  next-intl setup are untouched.

## 4. The `@codaco/app-i18n` package

### 4.1 Runtime choice

The package is built on `react-intl` (the FormatJS React binding) and
`@formatjs/intl-localematcher`, with `@formatjs/cli-lib` powering extraction
and compilation. Rationale, against the alternatives in §10: FormatJS is the
reference implementation of ICU MessageFormat over `Intl` and CLDR — the
standards the grant names — it is the only i18n stack already in the monorepo
(the website's matcher, next-intl's own foundations), and the accepted
protocol design commits to the same matcher. `next-intl` itself is
Next.js-only and cannot serve a Vite SPA; hand-rolled tables (the
`SiteNavigation.messages.ts` / `framingTerms.ts` pattern) cannot express
plurals or selects and have no extraction path.

`react-intl` is an implementation detail. The public API is the package's
own; consumers never import `react-intl`, so the runtime can be swapped or
trimmed without touching call sites. `react-intl` and the matcher enter the
workspace catalog (`pnpm-workspace.yaml`) with the house-style inline
comments; the protocol design already planned the matcher's catalog entry.

### 4.2 Module layout and exports

`packages/app-i18n`, published as `@codaco/app-i18n`, ESM-only, following the
`packages/protocol-utilities` publishConfig shape (types + default, no CJS)
and the shared-consts build conventions (vite lib build, per-module `.d.ts`
via `vite-plugin-dts` — not `bundleTypes`, per the recorded API Extractor
constraint). No barrel file; explicit subpath exports:

| Subpath            | Contents                                                                                                            | Environment       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `./messages`       | `defineMessages`, `defineMessage`, `MessageDescriptor`, `createAppIntl` (non-React formatter for servers and tests) | universal         |
| `./react`          | `AppI18nProvider`, `useAppIntl`, `useAppLocale`                                                                     | React (client)    |
| `./negotiate`      | `resolveAppLocale`, `canonicalizeAppLocale`                                                                         | universal         |
| `./locales`        | `AppLocale` type, `defineAppLocales`, `mergeCatalogs`, `ecosystemLocales`, `pseudoLocale` helpers                   | universal         |
| `./common`         | `common.*` descriptors for universal chrome + their catalogs (decision 11)                                          | universal         |
| `./vite`           | `appI18n()`: oxc-based formatjs source transform + catalog compile + production no-parser alias                     | Node (build-time) |
| `./catalog-guards` | extraction wrapper and the reusable catalog guards (freshness, completeness, subset, token parity)                  | Node (test-time)  |

The `./vite` and `./catalog-guards` modules and anything they import use
explicit `.ts` extensions on relative specifiers, because they are loaded by
Node's own ESM loader from a consumer's `vite.config.ts` chain or a script —
the same rule protocol-validation and shared-consts already follow.

Dependencies: `react-intl` and `@formatjs/intl-localematcher` as regular
dependencies (`catalog:`); `@formatjs/cli-lib` and the ICU parser as regular
dependencies used only by the Node-side modules (never in client bundles);
`react` as a peer (`catalog:`). Internal consumers reference the package with
`workspace:^`.

No `engines` field, matching the repo's other published libraries
(`fresco-ui`, `interview`, `protocol-validation`, `network-exporters`). The
real Node floor here comes from transitives of `@formatjs/cli-lib` — today
`@babel/types@8` at `^22.18.0 || >=24.11.0`, a disjoint range excluding Node
23 and 24.0–24.10 — and those packages declare it themselves, so
`engine-strict` enforces the true constraint whatever this manifest says.
Restating it here could only be a copy that rots into a false claim on the
next transitive bump.

Registration mechanics (all confirmed against current tooling): nothing to
add in `pnpm-workspace.yaml`, `.changeset/config.json`, `turbo.json`, or
`knip.json` for the package itself; a first-publication approval entry in
`.github/npm-first-publications.json` in the publishing PR (removed after);
`scripts/verify-publish-exports.mjs` picks the package up automatically.

### 4.3 Message model

A message is declared where it is rendered:

```ts
import { defineMessages } from '@codaco/app-i18n/messages';

const messages = defineMessages({
  results: {
    id: 'studio.everythingBar.resultCount',
    defaultMessage:
      '{count, plural, one {# result} other {# results}}',
    description:
      'Announced result total under the everything-bar search input.',
  },
});
```

Rules:

- **Ids are explicit, dot-namespaced, and permanent.** The first segment is
  the owning workspace (`studio`, `frescoUi`); the rest mirrors the feature.
  Renaming an id is a translation-invalidating change and is treated like
  one (the old translations are dropped by the parity guard, which is
  correct: the copy changed).
- **`defaultMessage` is the English source of record.** en has no runtime
  catalog; English renders from the descriptors themselves.
- **`description` is mandatory** — it is the translator's only context, and
  extraction enforces its presence.
- **Whole strings only** (invariant 1). Values are data (`{count}`,
  `{name}`), plurals are `plural`, alternatives are `select`, markup is
  rich-text tags (`<strong>…</strong>`) with chunk renderers supplied at the
  call site.
- Dates, numbers, and lists render through the intl object
  (`formatDate`, `formatNumber`, `formatList`), never through direct
  `Intl.*` constructors with hardcoded locales or module-scope formatter
  singletons (which freeze the locale at import time —
  `TeamActivity.tsx` demonstrates the bug today).

### 4.4 React API

```ts
// @codaco/app-i18n/react
function AppI18nProvider(props: {
  locale: string;                       // active app locale tag
  locales: readonly AppLocale[];        // the app's declared registry
  messages?: Record<string, MessageFormatElement[] | string>;
  onLocaleChange?: (locale: string | null) => void;
  manageDocument?: boolean;             // default true: write <html lang>/<dir>
  children: ReactNode;
}): ReactElement;

function useAppIntl(): IntlShape;       // works with OR without a provider

function useAppLocale(): Readonly<{
  locale: string;                       // active locale
  direction: 'ltr' | 'rtl';
  locales: readonly AppLocale[];        // registry, for switch UI
  setLocale(locale: string | null): void; // null = revert to negotiation
}>;
```

`useAppIntl` is the load-bearing wrapper: it reads react-intl's context when
a provider is mounted and otherwise returns a shared default `IntlShape`
(`locale: 'en'`, no messages), so every message renders its
`defaultMessage`. This is what makes fresco-ui's conversion invisible to
unlocalized hosts (invariant 2). Components in shared packages must use
`useAppIntl`, never react-intl's `useIntl` (which throws without a
provider).

`AppI18nProvider` mounts react-intl's provider with the resolved locale and
merged messages, and — unless `manageDocument` is false — keeps
`document.documentElement.lang` and `dir` in sync with the active locale's
tag and direction (invariant 5). `onLocaleChange` is the host's persistence
hook: the provider owns no storage.

`onError` handling: missing-translation warnings are suppressed for override
locales (falling through to `defaultMessage` is their designed behavior) and
surfaced in development for full locales; ICU syntax errors always throw in
development and degrade to the raw string in production.

### 4.5 Locale registry and metadata

```ts
// @codaco/app-i18n/locales
type AppLocale = Readonly<{
  locale: string;            // canonical BCP 47 tag
  label: string;             // autonym, e.g. 'English (UK)'
  direction: 'ltr' | 'rtl';
}>;

function defineAppLocales<const T extends readonly AppLocale[]>(locales: T): T;
```

App UI locales are a **closed, maintainer-curated set** — a locale exists
only when its catalog ships — so metadata is static data reviewed in the
pull request that adds the locale, not runtime `Intl.DisplayNames`
derivation. This sidesteps the display-name runtime-variance and hydration
hazards the protocol design has to engineer around (its locales are
researcher-declared and open-ended; ours are not). The shape is structurally
identical to the protocol design's `LocaleMetadata`
(`{ locale, label, direction }`), so switch UI components can present either.

`labels` are autonyms and are rendered with `lang={option.locale}` in
selectors so screen readers pronounce them correctly.

**The ecosystem locale set** (decision 12) is exported from `./locales` as
`ecosystemLocales`: the ordered list of every locale any in-repo app ships a
UI in, `['en', 'en-GB']` at launch. An app's registry must be a subset
(guarded by a test in the app); a shared package's catalogs (`common.*`,
`frescoUi.*`, later `interview.*`) must satisfy the completeness guard for
every entry in the set. Adding a locale to any app therefore means, in the
same PR: extend `ecosystemLocales`, add the shared packages' catalogs for
it, then add the app's own — the guards enforce the order by failing until
all three exist. This is what makes "share common translations between all
apps" a checked property rather than an aspiration.

**Shared copy layering** (decision 11): `./common` ships descriptors for
universal chrome verbs and boilerplate under `common.*`, plus their
catalogs. Shared packages and apps import these descriptors rather than
defining near-duplicates; extraction only collects `defineMessages` calls in
a workspace's own source, so an imported descriptor is never re-extracted,
and each string exists in exactly one catalog. Merge order at a host is
common → shared packages → app (later wins, though namespacing means
overlap does not occur in practice).

### 4.6 Negotiation

```ts
// @codaco/app-i18n/negotiate
function resolveAppLocale(input: {
  stored?: string | null;               // account preference or device mirror
  requested: readonly string[];         // navigator.languages / parsed header
  locales: readonly AppLocale[];
  defaultLocale: string;
}): Readonly<{ locale: string; source: 'stored' | 'negotiated' | 'default' }>;
```

The chain (decision 6):

1. **Stored preference** — if `stored` is present and best-fits a declared
   locale, it wins outright; browser preferences are not consulted. A stored
   tag that no longer matches any declared locale (a locale was withdrawn)
   is ignored, not an error — resolution falls through to negotiation.
2. **Requested list** — canonicalized, de-duplicated, matched with
   `@formatjs/intl-localematcher` `best fit` against the declared locales
   with `defaultLocale` as the matcher default. Invalid entries are ignored.
3. **Default** — `defaultLocale` when the list is empty or nothing matches.

The result is required to be a declared locale; the helper fails closed to
`defaultLocale` otherwise — the same discipline as
`selectProtocolLocale`. The helper is pure and synchronous; hosts collect
`navigator.languages` (Vite) or parse `Accept-Language` (server hosts, using
`parseAcceptLanguage` from `@codaco/protocol-validation` once it lands — this
package does not duplicate header parsing) at their own boundaries
(invariant 4).

### 4.7 Catalogs: extraction, translation files, compilation

**Extraction.** Each catalog-bearing workspace has an `i18n:extract` script
running FormatJS extraction over its source (configured for this package's
function names) into `src/locales/en.json` — id →
`{ defaultMessage, description }`, sorted by id. The file is committed and a
vitest guard re-runs extraction and diffs, exactly like fresco-ui's
`exportsMap` drift guard, so a stale catalog fails `test`, which runs in
every quality gate. Extraction fails on duplicate ids and missing
descriptions.

**Translation files.** A locale catalog is `src/locales/<tag>.json`, id →
translated string. Two kinds (decision 4):

- **Full locale**: must contain every id in `en.json`, no blank values, and
  per-id token parity (the same `{placeholder}` and `<tag>` tokens as the
  source — the website's `messageTokens` guard, lifted into this package's
  test helpers).
- **Override locale**: declared relative to a base (en-GB over en); its keys
  must be a subset of `en.json` with token parity; missing keys deliberately
  fall through to the base.

Catalogs live under `src/` so the default Turbo task inputs and knip project
globs cover them without per-package overrides; they are imported statically
from a small `src/locales/catalogs.ts` manifest (data wiring, not a barrel).

**Compilation.** The `./vite` integration is one call, `appI18n()`, placed
ahead of the framework plugin. It composes three pieces:

- the `@formatjs/unplugin` transform (`ast: true`) — oxc-based, no babel —
  compiling every `defineMessages` `defaultMessage` in source to pre-parsed
  AST and stripping translator descriptions from bundles;
- a catalog plugin compiling imported `src/locales/*.json` catalogs to AST
  modules (stamping `moduleType: 'js'` so rolldown's JSON plugin does not
  re-parse the emitted JavaScript); and
- a build-only exact-match alias swapping
  `@formatjs/icu-messageformat-parser` for FormatJS's `no-parser` build.

A workspace package that publishes messages of its own — `@codaco/app-i18n`
with `common.*`, `@codaco/fresco-ui` with `frescoUi.*` — runs the same call in
its library build as `appI18n({ build: 'library' })`: the two compiling
plugins, without the alias. Its `dist` therefore carries pre-parsed messages,
while whether a bundle keeps the parser stays the consuming application's
decision. Publishing ICU source instead fails quietly, because a message the
runtime cannot parse falls back to rendering its source verbatim, and source
text with no placeholders is indistinguishable from the formatted result — so
each package guards its own build configuration rather than its output text.

Production bundles therefore carry no ICU parser (verified by asserting the
parser's error identifiers are absent from built assets while react-intl's
are present). The dev server and vitest keep the real parser, so string
messages still work there and parse errors stay readable; AST and string
messages are both accepted by the runtime, so behavior is identical in
every mode. (`babel-plugin-formatjs` was the original design here; it was
replaced before landing because `@vitejs/plugin-react` v6 on the
Vite 8/rolldown toolchain removed its `babel` hosting option, and
`@formatjs/unplugin` provides the same transformation without babel.)

**Pseudo-locale.** Development builds expose `en-XA` (accented, expanded
pseudo-English generated from the extracted AST — the standard FormatJS
pseudo-locale) in the registry so layout expansion (+~⅓, per app-shell §5.6)
and hardcoded-string leaks are visible by eye without any translation. It is
excluded from production registries and never persisted as a preference.

### 4.8 What the package explicitly does not do

No routing integration (the website's `localePrefix` routing is a Next
concern; Studio's locale is not in the URL — see §10.4). No storage (hosts
persist). No `Accept-Language` parsing (protocol-validation owns it). No
translation-memory or interchange tooling (#1312). No locale-aware collation
or search normalization (`canonical-text.ts` in shared-consts remains the
authority on identity-affecting text discipline).

## 5. Studio adoption

### 5.1 Registry and provider placement

Studio declares, in `apps/studio/client/src/i18n/locales.ts`:

```ts
export const studioLocales = defineAppLocales([
  { locale: 'en', label: 'English', direction: 'ltr' },
  { locale: 'en-GB', label: 'English (UK)', direction: 'ltr' },
  // + pseudoLocale in development builds only
]);
export const studioDefaultLocale = 'en';
```

The provider mounts in the **root route's component** (wrapping the outlet in
`router.tsx`), not in `main.tsx` — the root route is shared by
`createAppRouter`, so all eleven route-test suites and the app get identical
wiring for free, and the provider sits above all four shells (site, focused,
app, participant). A Studio-local `useStudioLocale` controller composes:

1. `resolveAppLocale` with `stored` = device mirror (localStorage,
   `studio.locale`, read/written through a guarded adapter), `requested` =
   `navigator.languages`, against the registry — synchronously, before first
   route render (invariant 7).
2. A `LocaleSync` component mounted inside the signed-in app layout that
   watches the shared `me` query: when the server-stored preference differs
   from the active locale, it applies it and updates the mirror. Server
   wins; the mirror exists so the researcher's own device paints correctly
   before identity loads. (This respects the app-shell invariant that
   `AppLayout` itself holds no identity — the sync component is a leaf
   subscriber to the existing query, like `EntityLockup`.)
3. `setLocale(tag | null)` from the account page: updates the provider
   immediately, writes the mirror, and calls `account.updateLocale` when
   signed in. `null` reverts to negotiation ("Automatic").

The mirror is a device-level convenience and survives sign-out (a shared
machine reveals at most a previous language choice; the next sign-in's server
preference overrides it immediately).

`index.html` keeps `lang="en"` as the pre-boot default; the provider takes
over on mount.

### 5.2 Per-user preference: schema, RPC, payload

**Column.** `user.locale text` — nullable, with the house check constraint
(`char_length BETWEEN 2 AND 35`, matching `consent_documents.locale`), added
to the hand-written `auth-schema.ts` **and** declared to better-auth as
`user.additionalFields.locale` (`type: 'string'`, `required: false`,
`input: false` so it is not settable through better-auth's own endpoints —
only through the RPC). Follows the auth-schema convention: fold in without
altering existing physical names or types. Schema change means
`pnpm --filter @codaco/studio-server sync-fingerprint` (fingerprint, ERD,
README section all regenerate) — skipping it fails boot and CI.

**Contract.** `MeSchema` gains `locale: z.string().nullable()`. A new
top-level `account` namespace in `packages/studio-rpc/src/contract.ts`:

```
account.updateLocale({ locale: string | null }) -> { locale: string | null }
```

Server handler uses `requireUser` only (no tenant), validates a non-null
value against Studio's supported registry (client and server ship together,
so the server list is always current; unknown tags are a validation error,
not a silent store), and writes through the plain pool — the same plane as
`team.acceptInvitation`.

The registry holds canonical tags, so what reaches the row is canonical
without the handler doing anything: this contract accepts declared tags
only, and a case variant such as `EN-gb` is refused like any other unknown
spelling. That is deliberate. Widening the input to canonicalize it would
cost the contract its compile-time narrowing — the client could then be
typed to send any string — and buy nothing, because the only caller is the
generated client sending tags from its own registry. **Leniency belongs
where tags are uncontrolled**, which is negotiation: `resolveAppLocale`
canonicalizes both the browser's requested list and the stored preference on
the way back out. **Not an audited command** (decision
7): the audit log is study/team-scoped by design and a personal presentation
preference has no tenant and no research-data significance; this is recorded
here so the exception is deliberate, not an omission.

### 5.3 The `/account/language` page

The placeholder at `router.tsx` (`accountLanguageRoute`) becomes a real
route: heading and explanatory copy (from the catalog — including the
existing sentence distinguishing this choice from protocol languages), a
`LocaleSelect` (fresco-ui, §6.4) offering **Automatic (browser language)**
plus the registry's autonym-labeled locales, current value from
`useStudioLocale`, saves on change via `setLocale`, with saved/error state
surfaced through existing form conventions. The route already exists in
`BOTH_PATHS`, the account sidebar, the account menu, and the everything-bar
manifest — only the fill changes.

### 5.4 String conversion

All user-visible Studio copy moves to descriptors (≈325 strings across ~30
files; the audit that produced this inventory is the implementation
checklist):

- **`navigationManifest.ts`** — `label`, `context`, group headings, and
  `unavailableReason` become `MessageDescriptor`s (the manifest's own type
  docs already require whole translated strings); consumers resolve at
  render via `useAppIntl`.
- **`router.tsx` `areaPlaceholder` calls** — titles and descriptions become
  descriptors; the `Placeholder` component's `It is specified in {issue}`
  concatenation becomes an ICU message with a value.
- **`StudioEverythingBar.tsx` `LABELS`** — becomes catalog lookups, as its
  own comment promises; `resultCount` becomes ICU `plural`, `chordHint`
  becomes list formatting.
- **Route files** (`Editor`, `TeamActivity`, `TeamMembers`, `TeamStudies`,
  `SignIn`, `Marketing`, `AcceptInvitation`, …) — inline JSX text and
  module-level label maps (`CATEGORY_LABELS`, `OUTCOME_LABELS`,
  `PARTICIPATION_MODE_LABELS`, …) become descriptor maps.
- **Dates and numbers** — `TeamActivity`'s module-scope
  `Intl.DateTimeFormat` singleton, `toLocaleDateString()` call sites, and
  `SiteLayout`'s concatenated copyright year all move to intl formatting
  through the provider's locale.
- **`SiteLayout`'s `<SiteNavigation locale="en-US">`** — the app locale is
  mapped to a `SiteLocale` by best-fit against `supportedSiteLocales`
  (en → en-US, en-GB → en-GB), replacing the hardcoded pin.
  `SiteNavigation`'s own self-contained catalog is intentionally untouched
  (§6.5).

Not converted: `everythingBarMockProviders.ts` (scaffolding scheduled for
deletion), developer-facing errors and console output, and locale-neutral
data (names, URLs) per the website spec's rule.

### 5.5 The en-GB catalog

`apps/studio/client/src/locales/en-GB.json` ships with this work: a sparse
override catalog authored as a machine first pass (British spelling and
vocabulary divergences only) and human-reviewed in the PR (decision 8). The
guard enforces subset-plus-token-parity. fresco-ui's catalog participates in
the same merge (`mergeCatalogs(frescoUiEnGb, studioEnGb)`), though its
initial en-GB overrides are expected to be empty or near-empty.

## 6. fresco-ui adoption

### 6.1 Baked-in strings become descriptors

Every hardcoded user-facing string in fresco-ui converts to a
`defineMessages` descriptor rendered via `useAppIntl` (ids under
`frescoUi.*`), covering the audited inventory: `DataTablePagination`,
`SelectAllHeader`, `DataTableFloatingBar`, the DataTable filter components,
`RichTextEditor`'s fourteen toolbar labels, `CollectionFilterInput`,
`CollectionSortSelect`, `CollectionSortButton` (whose concatenated accessible
name becomes an ICU `select` over sort direction), `Toast`,
`DialogProvider`, `useWizardState`, `PasswordField`, `DatePicker`,
`Combobox`, `ArrayField`, `DataTable`, `CloseButton`, `Collection`'s empty
state, `StorageRiskBanner`, `SegmentedToolbar`, `AppUpdateIndicator`, and
the icon components' SVG `<title>` names (fixing `edit.svg`'s wrong
`Edit - Blue` accessible name in passing).

fresco-ui gains `@codaco/app-i18n` as a **peer dependency** (`workspace:^`)
— host and library must share one React context instance — and its own
extraction artifacts under `src/locales/`, exported to hosts via a new
`locales` subpath (added through `sync-exports`; the vitest guard enforces
the map pair). With no provider mounted, every component renders its English
default unchanged (invariant 2), so this is a non-breaking minor for all
current consumers.

### 6.2 Prop defaults and host-supplied copy

Components with English prop defaults (`'Add Item'`, `'Select items…'`,
`'No results.'`, …) keep their prop APIs; the default value becomes the
formatted descriptor, applied when the prop is absent. Host-specific copy
stays host-supplied exactly as designed (`EverythingBarLabels`,
`accessibleName` callbacks, `emptyState` nodes): hosts now build those from
their own catalogs, which is the composition the switcher's
`t('switcher.teamLabel')` doc comment always anticipated.

### 6.3 Validation messages

The form validation copy in `form/validation/functions.ts` (min/max/unique
messages with interpolated values) is generated inside fresco-ui, so its
conversion is internal: validation produces message **descriptors plus
values**, and the field layer formats them at render time through
`useAppIntl`. External validation-rule APIs are unchanged. This also
pre-positions the seam #1313 needs for participant-facing validation.

### 6.4 `LocaleSelect`

A new `form/fields/LocaleSelect` component (per the app-shell rule that
reusable chrome lands in fresco-ui): presents `readonly AppLocale[]` options
with autonym labels rendered under each option's own `lang`, an optional
automatic/system entry, controlled value (`string | null`), built on the
existing native select field for full keyboard and screen-reader behavior.
Storybook stories with interaction tests cover keyboard operation, the
automatic entry, autonym `lang` attributes, and RTL rendering. Studio's
`/account/language` page and, later, other apps' settings consume it.

### 6.5 What does not change

`SiteNavigation.messages.ts` keeps its self-contained hand-rolled catalog:
it serves static sites through the CDN bundle, its `SiteLocale` registry in
shared-consts is a different (site) locale set, and coupling the CDN bundle
to react-intl would be pure cost. `PresentationalText` (protocol design
§7.2) remains the protocol-content hand-off type; app-i18n does not overlap
it. The website's next-intl stack is untouched; moving the matcher to the
workspace catalog updates only where the dependency version is declared.

## 7. RTL and direction

- **Logical properties are the rule** for new and touched layout code
  (`ms-*`/`me-*`/`ps-*`/`pe-*`/`text-start`/`start-*`; Tailwind v4 has them
  built in — no tailwind-config change needed).
- **Studio's five physical-direction utilities convert** now
  (`ml-2` ×2, `pl-5`, `pl-3`, `text-left` ×2 across the client).
- **fresco-ui components Studio consumes convert** in this work (the ~12
  files using physical utilities, prioritized by Studio's 29 imported
  subpaths); the remainder of fresco-ui converts as #1315's per-component
  WCAG verification reaches them, with the Storybook RTL check making
  regressions visible.
- **The fresco-ui Storybook harness gains an RTL global** (a `dir` toolbar
  applied via decorator), and the app-shell-mandated interaction tests for
  `AppFrame`/`NavList`/`NavItem` assert long-label and RTL rendering, per
  app-shell §11.3. These run in the existing `test:storybook` CI job — this
  is the shared infrastructure #1309's issue text points at (#1315), reused,
  not duplicated.
- **Direction application**: the provider writes `<html dir>` from the
  active locale's registry `direction`. Since the initial locales are LTR,
  the pseudo-locale plus Storybook RTL global are what keep the RTL path
  exercised until an RTL locale ships; researcher-authored text inside
  Studio (study names, protocol names) uses `dir="auto"` on leaf elements,
  the convention Architect established.

## 8. Accessibility

- Autonym locale options carry `lang` attributes so screen readers switch
  pronunciation per option.
- `<html lang>` always matches the rendered language, and changes with the
  preference — required for correct screen-reader behavior across the app.
- The language page is a normal form route: single `h1` with
  `data-route-focus-target`, focus moved on navigation, changes announced
  through the existing form status conventions (app-shell §11.2 rules apply
  unchanged).
- Converted fresco-ui strings preserve their roles (aria-labels stay
  aria-labels); the conversion is an opportunity that fixes the one wrong
  accessible name it touches, not a semantics change.
- No locale is expressed only by flag iconography; labels are text
  (autonyms), matching the website selector's precedent.

## 9. Verification

### 9.1 `@codaco/app-i18n` unit tests (node + jsdom)

- `resolveAppLocale`: stored-wins (including regional-variant best fit),
  stored-invalid falls through, malformed requested entries ignored,
  best-fit variants (`en-US` request → `en`), empty list → default,
  fail-closed to a declared locale; property that the result is always
  declared.
- `useAppIntl` without a provider returns a working English intl; with a
  provider returns the active locale; descriptors with plural/select/rich
  tags format correctly in both.
- Provider document management: `lang`/`dir` written on mount and on locale
  change, untouched when `manageDocument` is false. (Assertions capture the
  before/after transition so a no-op provider fails the test.)
- Catalog guards as reusable helpers, each tested able to fail: freshness
  diff, full-locale completeness, override subset, token parity, blank
  detection, duplicate ids.
- Pseudo-locale generation expands and accents without breaking ICU tokens.

### 9.2 fresco-ui

- Extraction freshness guard over `frescoUi.*` descriptors, and
  completeness of its catalogs against `ecosystemLocales` (the same guard
  `@codaco/app-i18n` runs over `common.*`).
- Existing stories for converted components keep passing without any
  provider (proving invariant 2 mechanically — the Storybook harness mounts
  none by default).
- `LocaleSelect` stories with interaction tests: keyboard, automatic entry,
  per-option `lang`, RTL.
- RTL Storybook global wired; `AppFrame`/`NavList`/`NavItem` interaction
  tests assert long-label and RTL rendering.
- `pnpm --filter @codaco/fresco-ui sync-exports` guard covers the new
  `locales` subpath.

### 9.3 Studio

- Server: schema test for the `locale` column and constraint;
  `account.updateLocale` accepts declared tags and `null`, rejects unknown,
  malformed and non-canonically-spelled tags alike, requires a user; `me`
  returns the stored value.
- Client integration (vitest route tests): negotiation applied before first
  paint from mirror/browser; `LocaleSync` applies a differing server
  preference and updates the mirror; the language page renders current
  state, saves through the RPC, updates `<html lang>` live (asserting the
  transition, not the end state); signed-out sign-in route renders under a
  negotiated non-default locale.
- Catalog guards: freshness for `studio.*`; en-GB subset + token parity +
  non-blank.
- The full sweep is proven by extraction plus the lint in §9.5: a literal
  that was never turned into a descriptor is invisible to extraction, and
  `no-literal-string-in-jsx` is what sees it. Pseudo-locale inspection of
  every route and the §5.4 inventory remain the check for what lint cannot
  see — a string assembled outside JSX, or one that is localized but wrong.

### 9.4 Repo gates

Format, lint, typecheck, knip, affected tests, and the package builds
(`pnpm --filter @codaco/app-i18n build`, `--filter @codaco/fresco-ui
build`) — the dts bundler is only exercised by the real build. Changeset
lanes: one normal-lane changeset (`@codaco/app-i18n` added,
`@codaco/fresco-ui` minor), one Studio-lane changeset
(`@codaco/studio-client`, `@codaco/studio-server`, `@codaco/studio-rpc`).
`pnpm check:changesets` enforces the split.

### 9.5 Lint

`eslint-plugin-formatjs` runs inside the repo's existing `oxlint` invocation
through `jsPlugins`, the same mechanism `oxlint-tailwindcss` already uses.
Nothing new runs in CI: `pnpm lint` is unchanged.

Five rules enforce descriptor hygiene wherever descriptors are authored —
`enforce-description`, `enforce-default-message`, `no-invalid-icu`,
`enforce-placeholders`, `no-multiple-whitespaces`. A sixth,
`no-literal-string-in-jsx`, is scoped to the Studio client, which is the only
surface converted end to end and so the only one where a literal is a defect
rather than unfinished work; it is off in tests, stories, mocks and
`__tests__`. Extending it to fresco-ui and to the other apps is what each of
those conversions turns on as it completes.

Two properties of this setup are worth stating because neither is obvious and
both have already caused a silent failure here:

- **A root override cannot reach into a package that owns an `.oxlintrc.json`.**
  An override's `files` are matched against the config that declares them, so
  `packages/fresco-ui/src/**` in the root config matched nothing at all, and
  the rules appeared to be configured while enforcing nothing. fresco-ui
  therefore repeats the five descriptor rules in its own config, and the root
  list names only packages that have no config of their own. The same applies
  to `jsPlugins`, which a nested config **replaces** rather than extends.
- **`enforce-placeholders` only sees descriptors written inline at the call
  site.** It cannot check `formatMessage(messages.x, values)` against a
  descriptor defined elsewhere in the file, which is the shape essentially all
  of this code uses. Placeholder/tag parity across locales is therefore still
  the catalog guards' job (§9.3), and the lint rule is a second net for the
  inline case, not a replacement.

This lint required `oxlint` ≥ 1.81: earlier versions intermittently
`SIGSEGV`ed with `jsPlugins` configured. That upgrade also promoted the React
Compiler rules into `correctness`, reporting ~440 pre-existing sites across
the repo; they are held at `"warn"` in `tooling/oxlint/react.json` with
adoption tracked in #1643.

## 10. Alternatives considered

1. **`next-intl` everywhere** — rejected: Next.js-only; Studio, Architect,
   and Interviewer are Vite SPAs. The website keeps it; both stacks speak
   ICU JSON, so a future convergence remains open without being forced now.
2. **Hand-rolled typed message tables** (extend the
   `SiteNavigation.messages.ts` / `framingTerms.ts` pattern) — rejected: no
   plural/select support (already needed by `resultCount` and sort
   announcements), no extraction or translator workflow, O(locales ×
   components) type maintenance. Those tables were the right local answers
   before shared infrastructure existed; `framingTerms.ts`'s documented
   rules are adopted as invariants instead.
3. **Lingui** — rejected: comparable ICU capability, but macro-based
   extraction adds compiler coupling, and it duplicates what FormatJS
   already provides while the monorepo has FormatJS commitments in two
   accepted designs.
4. **Locale in the URL** (website-style `/en-GB/…` prefixes) — rejected for
   Studio: routes are identity-scoped app state, not indexable documents;
   the preference is per-user, so encoding it per-URL adds redirect
   machinery and breaks shared links' language neutrality.
5. **A generic localization package absorbing protocol locale helpers** —
   rejected: re-litigates the accepted protocol design (§7.1), which keeps
   schema-owned algorithms beside their types. The boundary holds:
   protocol-validation owns protocol locale selection and header parsing;
   app-i18n owns app catalogs; they share conventions, not code.
6. **Runtime `Intl.DisplayNames` for the switcher** — rejected: app locales
   are curated data; static autonyms avoid runtime spelling variance and the
   SSR serialization machinery the protocol design needs for open-ended
   locale sets.
7. **Auditing locale changes** — rejected: the audit log is tenant-scoped by
   design; inventing a userless audit plane for a presentation preference is
   cost without an investigative use case.
8. **CI literal-detection lint for unlocalized strings** — first rejected on
   the belief that oxlint had no formatjs plugin and that a bespoke
   JSX-literal grep would produce too much noise (class names, test ids,
   developer errors). **Adopted instead, on evidence** (see §9.5): oxlint
   runs ESLint-compatible plugins through `jsPlugins`, which this repo
   already relies on for `oxlint-tailwindcss`, so `eslint-plugin-formatjs`
   runs as-is — no bespoke grep, and its `no-literal-string-in-jsx`
   understands JSX well enough that across the whole converted Studio client
   it reported six literals, every one of them a real deliberate exception.

## 11. Delivery plan

One pull request, two changeset lanes, slices ordered for reviewability:

| #   | Slice                    | Contents                                                                                                                                                                                                                                    |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Spec + issue updates     | This document; decision entries on #1309/#1310/#1242; board states.                                                                                                                                                                         |
| 2   | `@codaco/app-i18n`       | Package with all five subpaths, catalog entries for `react-intl`/matcher, tests, first-publication approval entry.                                                                                                                          |
| 3   | fresco-ui conversion     | Descriptor conversion of the §6.1 inventory, validation-message seam, prop defaults, `LocaleSelect`, `locales` subpath + sync-exports, RTL Storybook global + interaction tests, logical-property conversion of Studio-consumed components. |
| 4   | Studio server + contract | `user.locale` column + better-auth field + fingerprint sync; `account.updateLocale`; `MeSchema.locale`.                                                                                                                                     |
| 5   | Studio client wiring     | Registry, provider in root route, negotiation + mirror, `LocaleSync`, language page, SiteNavigation locale mapping, `<html lang/dir>`.                                                                                                      |
| 6   | Studio string sweep      | §5.4 conversion of all ~325 strings; date/number formatting fixes; en-GB catalog; extraction + parity guards.                                                                                                                               |
| 7   | Gates + changesets       | Full gate run; normal-lane and Studio-lane changesets; PR.                                                                                                                                                                                  |

## 12. Open questions

1. **When does `@codaco/interview` adopt?** — The pattern and the
   provider-less default make adoption mechanical, but #1313 owns the
   conversion, its interplay with protocol locale (two providers, two
   scopes), and the bundled-runtime release coupling. Resolution: #1313's
   design references this spec; nothing here blocks on it.
2. **Researcher-facing transactional email language** — `user.locale` is the
   value to read, but rendering localized email belongs to the messaging
   infrastructure (#1305). Resolution: deferred there; recorded so the
   column's second consumer is anticipated.
3. **Studio E2E locale coverage** — Studio has no Playwright suite yet
   (app-shell open question 3). When one exists, a locale-switch journey
   (set en-GB → reload → persisted) belongs in it. Resolution: recorded for
   the suite's initial scope; vitest integration tests carry the behavior
   until then.

## 13. GitHub tracking

This design serves #1309 and #1310 under epic #1308. Both issues receive
dated decision entries (sub-issue convention) pointing here; #1242's decision
log gains a 2026-09-04 group per the tree's convention. On the board, #1310
moves from Needs spec to In progress and #1309 to In progress for the
single-PR implementation; both close when it merges.

Three adoption issues are created under #1308 with this design, one per
remaining app, each consuming the same package, negotiation chain, and
catalog layering: Architect (Vite SPA; researcher chrome), Interviewer
(Vite SPA; administration chrome — participant chrome stays with #1313),
and Fresco (Next.js; researcher chrome plus the server boundary: stored
preference and `Accept-Language` via protocol-validation's parser, with
`createAppIntl` server-side). #1313 additionally receives a decision entry
recording that `@codaco/interview`'s system strings use `interview.*`
descriptors and catalogs shipped with that package, per decision 11. #1308
remains open for #1312, #1313, and the adoption issues.

## 14. Definition of done

It is complete when: `@codaco/app-i18n` publishes from the normal lane with
the documented API and its guards; every fresco-ui baked-in string renders
through it with English intact for provider-less hosts; Studio renders every
researcher-facing surface from catalogs in `en` and `en-GB` with the
pseudo-locale available in development; the preference persists per user,
mirrors per device, and resolves through the §4.6 chain before first paint;
`<html lang>`/`<html dir>` track the active locale; RTL verification runs in
the fresco-ui Storybook CI job; all §9 verification passes; and the two
changeset lanes record the release.
