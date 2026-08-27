# Protocol Localization and Locale Resolution Design

**Status:** Proposed for review (2026-08-27).

**Scope:** Protocol schema 9, protocol-authored participant-facing strings,
locale matching and metadata helpers, Architect authoring and warnings, the
Interview runtime, Interviewer, Fresco, and exported interview metadata.

## 1. Summary

Protocol schema 9 introduces a required `localization` declaration and a
`LocalizedString` object for every protocol-authored string rendered to a
participant. A localized string may be incomplete: it must contain at least
one locale entry and may contain only locales declared by the protocol, but it
does not need to contain every declared locale. Missing
translations are therefore authoring warnings, not protocol-validation
errors.

At interview time, a single protocol locale is selected from the user's
ordered preferences using `@formatjs/intl-localematcher` with the `best fit`
algorithm. Each localized string is then resolved independently. If that
string does not contain the selected locale or a best-fit variant, resolution
uses the protocol default when available and finally the first available key
in the protocol's declared locale order. This makes partially translated
protocols runnable while keeping fallback deterministic.

The schema, locale primitives, matcher, warning analyser, HTTP-header parser,
and locale metadata helpers live in `@codaco/protocol-validation`. They are
framework-free and side-effect-free. React context and hooks live in
`@codaco/interview`. Vite applications read browser preferences at their host
boundary; Fresco reads `Accept-Language` on the Next.js server and passes the
selected locale to the client. Shared code never imports Next.js APIs and
never reads browser globals at module evaluation.

## 2. Goals

- Represent multiple translations of protocol-authored participant copy in a
  schema-valid, portable `.netcanvas` document.
- Allow incomplete translations during development and fieldwork, with clear
  authoring warnings and deterministic runtime fallback.
- Select an initial interview locale from explicit choice, browser language
  preferences, or HTTP `Accept-Language`, in that priority order.
- Let a participant or interviewer change the selected locale during an
  interview and persist the choice with the session.
- Derive locale display names and text direction rather than storing mutable
  English labels or an `ltr`/`rtl` flag in the protocol.
- Use one pure resolution implementation in Architect preview, Interviewer,
  Fresco, tests, and server-side code.
- Preserve stable codebook names, option values, entity keys, stage ids, and
  collected answer shapes.
- Record the selected interview locale in exported data.

## 3. Non-goals

- Translating Architect, Interviewer, Fresco, or the Interview package's own
  built-in user-interface messages. Navigation labels, validation messages,
  dialogs, and Family Pedigree's built-in terminology need a separate
  application-message-catalog project. They must not be placed in each
  protocol.
- Machine translation or translation-memory integration.
- Loading translations from remote files at interview time. All protocol
  translations remain inline so offline interviews are complete and
  reproducible.
- Localizing researcher-facing protocol metadata such as the protocol `name`,
  protocol `description`, stage `label`, or `interviewScript` in schema 9.
- Supporting schema 9 in Architect Classic or Interviewer Classic. Those apps
  remain on their external schema-7 validation dependencies.
- Locale-sensitive formatting of dates, numbers, or plural messages. This
  design localizes strings and supplies locale context; richer formatting can
  use that context later.

## 4. Design principles

1. **Locale identifiers are data; labels are presentation.** Protocols store
   canonical BCP 47 tags only. Autonyms and direction are derived at runtime.
2. **Incomplete is valid; undeclared is invalid.** Missing translations are
   warnings. Unknown locale keys and empty localized objects are validation
   errors.
3. **One session has one selected locale.** Browser preference lists choose a
   declared protocol locale once. Persisting only that locale avoids storing a
   potentially identifying browser language list and makes resume behavior
   deterministic.
4. **Fallback is local to a string.** A protocol may display a Spanish prompt
   and fall back to English for a missing hint. Resolution reports the actual
   source locale so the DOM can carry an accurate `lang` attribute.
5. **Semantic values never depend on translated copy.** Runtime branches,
   filtering, exports, and migration use ids, keys, and option values, never
   localized labels.
6. **The schema remains the inventory.** Localizable schema nodes carry Zod
   metadata. Validation and warning collection walk that metadata so adding a
   field cannot silently omit it from coverage reporting.

## 5. Schema 9 contract

### 5.1 Example

```json
{
  "schemaVersion": 9,
  "name": "Youth networks",
  "localization": {
    "defaultLocale": "en-US",
    "locales": ["en-US", "es"]
  },
  "codebook": {
    "node": {
      "person": {
        "name": "person",
        "label": {
          "en-US": "Person",
          "es": "Persona"
        },
        "color": "node-color-seq-1",
        "shape": { "default": "circle" }
      }
    },
    "edge": {},
    "ego": {}
  },
  "stages": []
}
```

`name` remains stable researcher/export metadata. `label` is participant
copy. The same separation is introduced for node definitions, edge
definitions, and variables.

### 5.2 Localization declaration

```ts
type ProtocolLocalization = Readonly<{
  defaultLocale: LocaleTag;
  locales: readonly [LocaleTag, ...LocaleTag[]];
}>;
```

Validation requirements:

- `localization` is required in schema 9.
- `locales` contains at least one locale, is unique after canonicalization,
  and preserves author-declared order.
- `defaultLocale` must be an exact member of `locales`.
- Every locale is a well-formed, canonical BCP 47 tag as accepted by
  `Intl.getCanonicalLocales`.
- Noncanonical aliases or casing such as `EN_us` or `iw` are rejected with a
  suggested canonical value. Architect canonicalizes before it writes.
- Both language-only tags (`es`) and language-region tags (`es-MX`) are valid
  and may coexist.
- `und` is valid and reserved for content whose source language is genuinely
  unknown, including automatic v8-to-v9 migration.
- The order of `locales` is significant: it is the final per-string fallback
  order and is therefore included in protocol identity.

The schema deliberately does not store locale names, flags, or direction.

### 5.3 LocalizedString

```ts
type LocalizedString = Readonly<Record<LocaleTag, string>>;
```

A localized string has these blocking validation rules:

- It is an object with at least one own key.
- Every key is a canonical BCP 47 locale tag.
- Every key is present in the enclosing protocol's `localization.locales`.
- Every defined translation satisfies the content rule of its owning field.
  A field that was `string().min(1)` in schema 8 applies that rule to every
  supplied translation; a field that previously accepted an empty string does
  not become stricter merely because it is localized. Architect normalizes a
  cleared optional value by removing that locale key and, when no keys remain,
  omitting the optional field.
- No additional object keys are allowed.

It explicitly does **not** require:

- all locales declared by the protocol;
- the protocol's `defaultLocale`; or
- the same set of locales as another localized string.

The first two omissions produce authoring warnings. They never make the
protocol invalid.

### 5.4 Errors and warnings

`validateProtocol` keeps its current blocking success/error contract. Schema
issues continue to mean the document cannot be safely interpreted.
Localization coverage is exposed separately:

```ts
type ProtocolLocalizationWarning = Readonly<{
  code: 'missing-translation';
  path: readonly (string | number)[];
  locale: LocaleTag;
  isDefaultLocale: boolean;
  fallbackLocale: LocaleTag;
}>;

function analyzeProtocolLocalization(
  protocol: Protocol<9>,
): readonly ProtocolLocalizationWarning[];
```

The analyser emits one warning for each declared locale missing at each
localized path. `fallbackLocale` is computed by the same resolver used by the
interview, so Architect can say what a participant will actually see. A
protocol using `und` also receives an Architect-level "language not
identified" warning and a guided relabel action.

This separation prevents production hosts from treating normal translation
work-in-progress as invalid while giving Architect enough structured data to
aggregate coverage, navigate to a field, and distinguish a missing default
translation.

### 5.5 Participant-facing field inventory

Schema 9 changes the following fields from `string` to `LocalizedString`, or
adds a localized `label` beside a stable `name`:

| Area                  | Localized fields                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Codebook definitions  | New required `label` on every node and edge definition                                                                          |
| Variables             | New required `label`; boolean, ordinal, and categorical option `label`; scalar `minLabel` and `maxLabel`                        |
| Shared prompts        | `text`, Tie Strength `negativeLabel`, Categorical Bin `otherVariablePrompt` and `otherOptionLabel`                              |
| Shared forms          | Field `prompt` and `hint`; Name Generator form `title`                                                                          |
| Shared presentation   | Introduction panel `title` and `text`; panel `title`                                                                            |
| Information           | Stage `title`, text-item `content`, and item `description`; asset-item `description`, while asset `content` remains an asset id |
| Anonymisation         | Explanation `title` and `body`                                                                                                  |
| Family Pedigree       | Intro text-item `content`, intro item `description`, `censusPrompt`, and nomination prompt `text`                               |
| Network Composer      | Form-field `label` and `hint`                                                                                                   |
| Name Generator Roster | Card-property and sort-property `label`                                                                                         |
| Narrative             | Preset `label`                                                                                                                  |
| Narrative Pedigree    | Disease `label`                                                                                                                 |

The following remain plain strings because they are ids, semantics, machine
data, or researcher-facing metadata:

- protocol `name` and `description`;
- stage `label` and `interviewScript`;
- ids, entity type keys, variable names, references, asset ids, asset names,
  URLs, filter operands, and option `value` fields;
- ISO date constraints and other machine parameters;
- interface-owned application copy.

The inventory must be confirmed against render call sites during
implementation. If a plain schema string is found to be participant-facing,
it joins this list before schema 9 ships; it must not be patched later as an
unversioned schema-9 correction.

### 5.6 Interface-owned options

Family Pedigree and other interface-owned categorical sets continue to pin
their stable values, order, and semantic flags. Their labels become localized
copy and are no longer compared to one canonical English string. Runtime logic
must branch only on the pinned values.

### 5.7 Locale-dependent uniqueness

Narrative Pedigree disease labels must be unique in what a participant can
actually see. The schema-9 root refinement resolves every disease label for
each declared protocol locale, normalizes it using the existing comparison
rules, and rejects collisions at the duplicate label's path. Checking only
raw keys would miss a collision introduced by fallback.

## 6. Locale selection and string resolution

### 6.1 Public framework-free API

The public helpers in `@codaco/protocol-validation` are:

```ts
function canonicalizeLocale(value: string): LocaleTag | undefined;

function normalizeLocalePreferences(
  values: readonly string[],
): readonly LocaleTag[];

function parseAcceptLanguage(header: string | null): readonly LocaleTag[];

function selectProtocolLocale(
  requestedLocales: readonly string[],
  localization: ProtocolLocalization,
): LocaleTag;

type ResolvedLocalizedString = Readonly<{
  text: string;
  locale: LocaleTag;
  selectedLocale: LocaleTag;
  usedFallback: boolean;
  usedDefaultLocale: boolean;
}>;

function resolveLocalizedString(
  value: LocalizedString,
  localization: ProtocolLocalization,
  selectedLocale: string,
): ResolvedLocalizedString;

type LocaleMetadata = Readonly<{
  locale: LocaleTag;
  label: string;
  direction: 'ltr' | 'rtl';
}>;

function getLocaleMetadata(
  locale: string,
  displayLocale?: string,
): LocaleMetadata;
```

Invalid preference entries are ignored. Invalid protocol data is not silently
normalized by these helpers; it must be validated first.

### 6.2 Initial protocol locale

`selectProtocolLocale` canonicalizes and de-duplicates the ordered request
list, then calls:

```ts
match(requested, localization.locales, localization.defaultLocale, {
  algorithm: 'best fit',
});
```

The returned value is required to be one of the declared locales; otherwise
the helper fails closed to `defaultLocale`. Priority is established before the
call:

1. An explicit locale chosen by the participant or researcher is passed as
   the only requested locale.
2. Otherwise a Vite host passes `navigator.languages`, falling back to
   `navigator.language`.
3. Otherwise a server host passes the ordered, quality-weighted result of
   `Accept-Language` parsing.
4. If the list is empty or no locale matches, the protocol default wins.

An explicit choice is not concatenated with browser languages. This prevents
a later browser language from overriding the user's stated preference for a
partially translated field.

### 6.3 Per-string resolution

For a localized string:

1. Build `available` by filtering `localization.locales` to keys present in
   the string. This preserves protocol order and ignores object insertion
   order.
2. Choose the matcher default: the protocol `defaultLocale` if the string has
   it; otherwise `available[0]`.
3. Match `[selectedLocale]` against `available` with FormatJS `best fit`.
4. Return the text and the actual matched locale.

The schema guarantees `available` is nonempty. A related variant may match
before fallback (`es-MX` to `es`, for example). If there is no best-fit match,
the protocol default wins when present, followed by the first translated
locale in declared protocol order.

`usedFallback` is true when the resolved locale differs from the selected
protocol locale. `usedDefaultLocale` is true when that fallback is the
protocol default. Callers do not reimplement this logic.

### 6.4 Locale names and direction

`getLocaleMetadata` derives presentation data:

- Canonical tag: `Intl.getCanonicalLocales`.
- Display name: `Intl.DisplayNames`, using the locale itself as the default
  display locale so language selectors show autonyms. If unavailable, display
  the canonical tag.
- Direction: feature-detect `Intl.Locale.prototype.getTextInfo()`, then the
  older `textInfo` accessor, then maximize the locale and use a small tested
  set of Unicode right-to-left script codes. Unknowns fall back to `ltr` for
  layout and `dir="auto"` may be used on leaf text.

Display-name spelling is presentation-only and may vary with the JavaScript
runtime. It is never validated, persisted, or hashed. Direction fallback is
deterministic and has explicit Arabic, Hebrew, Persian, Urdu, and mixed-script
tests.

## 7. Package and module architecture

### 7.1 Chosen owner: `@codaco/protocol-validation`

The existing package is the right owner because:

- the helpers operate directly on `ProtocolLocalization`, `LocalizedString`,
  and `Protocol<9>`;
- all modern protocol hosts already depend on it;
- schema validation, migration, hashing, and authoring diagnostics stay on one
  side of the dependency graph;
- `@codaco/interview` already has it as a peer dependency and already imports
  runtime values from it; and
- its published build is deliberately self-contained for browser, Node,
  worker, and CLI use.

A new generic localization package is rejected for this feature: it would
split schema-owned types from their algorithms and add another public package
without removing a dependency from any protocol consumer. `shared-consts` is
also rejected because locale matching is not a low-level network constant and
would add FormatJS to unrelated consumers. `protocol-utilities` is rejected
because it owns synthetic interview construction and already depends on
protocol-validation, producing the wrong dependency direction.

Implementation uses focused files under `src/localization/` and explicit root
exports; it does not add a barrel file. `@formatjs/intl-localematcher` moves to
the workspace catalog. It is a runtime-only bundled dependency of
protocol-validation under the package's existing self-contained build policy.
The website's existing direct use adopts the catalog version but does not need
to import protocol-validation.

### 7.2 React owner: `@codaco/interview`

The Interview package adds a `ProtocolLocalizationProvider` around rendered
interfaces and exposes:

```ts
function useProtocolLocale(): Readonly<{
  locale: LocaleTag;
  metadata: LocaleMetadata;
  setLocale(locale: LocaleTag): void;
}>;

function useLocalizedString(
  value: LocalizedString,
): ResolvedLocalizedString;
```

The provider reads the validated protocol localization and the persisted
session locale. Changing locale dispatches a normal session update so the
existing sync middleware persists it. Non-React selectors and utilities call
the pure resolver with explicit locale arguments.

The protocol schema's type change is intentionally used as a compiler-driven
inventory: every participant renderer that expects a plain string must be
converted to resolve it. A blanket deep transformation back to the schema-8
shape is rejected because it would discard the actual source locale and make
accurate `lang` attributes impossible.

### 7.3 Universal and SSR constraints

- No shared module reads `window`, `navigator`, `document`, cookies, or Next
  request APIs at module scope.
- Pure helpers accept strings and readonly arrays and produce serializable
  values.
- Browser and HTTP preference collection happens in host adapters.
- Fresco computes the initial locale before rendering the client Shell and
  serializes it in `InterviewPayload`, preventing server/client hydration
  disagreement.
- Tests exercise the helpers under Node without DOM shims and under Vite
  browser tests.

## 8. Runtime and host behavior

### 8.1 Session contract

`SessionPayload` and both persistent session models gain a required canonical
`locale`. It is one of the protocol's declared locales when a session starts.
Legacy rows migrated from schema 8 use `und` until an explicit language is
chosen.

Only the selected locale is persisted. The full browser or HTTP preference
list is discarded after matching.

The Interview settings menu shows a language control when a protocol declares
more than one locale or declares only `und`. Options use derived autonyms and
direction. Selection takes effect immediately and persists through the normal
sync path. A resumed interview therefore keeps its recorded selection even if
the device language changes.

### 8.2 Interviewer (Vite SPA)

- `NewSessionForm` derives its initial selection from `navigator.languages`
  at interaction time, not at module load.
- When more than one locale is declared, the form exposes an Interview
  Language select prefilled with that best match. This lets a researcher
  choose before handing over the device.
- `StoredSession.locale` is included in encryption-independent session
  metadata and hydrated into `SessionPayload`.
- Synthetic sessions choose the protocol default unless their builder asks
  for a specific locale.
- The in-interview language control can update the session later.

`languagechange` affects only the default for a newly created session. It does
not silently switch an interview already under way.

### 8.3 Fresco (Next.js)

- The onboarding route parses `Accept-Language` on the server and selects a
  declared locale before creating the interview.
- A valid explicit `locale`/`lang` recruitment parameter, if supplied, is the
  only requested locale and outranks the header. Invalid or undeclared values
  fall back safely and are not persisted.
- Prisma `Interview` gains a required locale column. The create action reads
  the protocol's localization declaration, validates any explicit choice,
  and stores the selected locale atomically with the new interview.
- `mapInterviewPayload` passes the stored locale to the client. Client code
  does not rerun browser detection, avoiding hydration changes.
- Sync accepts locale only through the typed session payload and validates it
  against the interview's stored protocol before updating.

If a future participant-facing preflight page is added, it can use the same
derived options. It is not required for initial delivery because the Shell
language control supplies an explicit participant choice.

### 8.4 Architect preview

Architect persists a preview locale preference in its editor state. Preview
controls show every declared locale using derived metadata, defaulting to the
protocol default. `PreviewPayload` carries the selected locale so the popup
does not detect independently. Preview can therefore reproduce every warning
fallback exactly.

### 8.5 Language and direction in the DOM

- Every rendered protocol-authored string is associated with the actual
  locale returned by the resolver.
- The nearest practical text container receives `lang` and `dir`; when a
  string falls back, those attributes describe the fallback language, not the
  selected session locale.
- Protocol content regions use the selected locale's direction for layout,
  then leaf fallback direction can override it.
- The host owns the document-level `<html lang>`. The Interview package does
  not rewrite it because surrounding host chrome may remain in another
  language.
- Existing physical left/right styles and directional icons in participant
  interfaces receive an RTL audit. Only intentionally directional semantics
  mirror; graph coordinates and collected layout values do not.

## 9. Architect authoring experience

### 9.1 Protocol locale management

Architect adds a Localization page linked from the project navigation. It
supports:

- adding a canonical locale;
- choosing the default locale;
- reordering locales to set final fallback priority;
- viewing derived autonym and direction;
- translation coverage by locale and by protocol area;
- filtering to missing translations; and
- previewing in any declared locale.

Adding a locale writes only the declaration. It deliberately does not clone
default strings, so the protocol remains valid and warnings appear
immediately.

Removing a locale is an atomic destructive edit: Architect shows how many
translations will be removed, asks for confirmation, removes that key from
every localized string, and updates the declaration. It is disabled for the
default until another default is chosen and disabled if it would leave any
localized string empty.

Renaming/relabeling a locale canonicalizes the new tag and atomically moves
every matching key. A collision with an existing locale is rejected rather
than merged. The special v8 migration action changes `und` to a chosen locale
across the declaration and all localized strings in one transaction.

### 9.2 Localized fields

A protocol-specific `LocalizedStringField` in Architect adapts the existing
field/form infrastructure. It shows one locale at a time, preserves the full
map on edits, marks missing values without making the form invalid, and makes
the default locale obvious. Optional fields can be removed entirely; clearing
the last value of a required field is a form error.

Coverage warnings are owned by the actual field when editing that field.
Global aggregation is added to `selectors/issues.ts`, whose existing contract
already represents valid-but-probably-unintended protocol issues. The global
Localization page and project navigation may summarize warnings, but they do
not duplicate field-owned validation errors.

### 9.3 Warning UX

Warnings are grouped to avoid presenting thousands of flat messages:

- locale summary: translated count, missing count, percentage;
- area summary: codebook, stage, form, option, or prompt;
- field detail: exact path, missing locale, and fallback locale; and
- migration summary: source language is `und` and needs identification.

Download/export remains allowed with warnings. Architect should require only
normal schema validity, not complete translation coverage.

## 10. Schema 8 to schema 9 migration

### 10.1 Automatic, lossless rule

The migration cannot know the language of arbitrary schema-8 text. It must not
guess English from the product's history or the device locale. It therefore:

1. adds `localization: { defaultLocale: "und", locales: ["und"] }`;
2. wraps every participant-facing schema-8 string as `{ "und": oldValue }`;
3. omits an empty optional field where schema 9 treats clearing it as absence,
   but preserves an empty value where the schema-8 field contract treated it
   as data;
4. adds node, edge, and variable `label` from the existing stable `name` as
   `{ "und": name }`;
5. preserves option values, ids, references, stage count/order, codebook keys,
   and collected answer shapes; and
6. records a migration note explaining that Architect must identify the
   language.

This obeys the migration invariants already documented in the migration
chain: stages are not added, removed, or reordered, and collected values do
not change shape.

Known English first-party protocols and templates are converted explicitly to
`en-US` in their canonical sources rather than being committed as `und`.
Third-party and stored documents use the honest automatic migration.

### 10.2 Migration plumbing activated by version 9

- Add schema 9 to `SchemaVersion`, `VersionedProtocolSchema`, the migration
  type map, and the registered chain; set `CURRENT_SCHEMA_VERSION` to 9 only
  after all modern consumers compile against it.
- Fix `migrateProtocol` to post-validate against the requested target schema,
  not always `CurrentProtocolSchema`, as required by the existing deferred
  comment.
- Interviewer's launch migration recomputes the hash, repoints sessions, and
  initializes their locale in the same transaction.
- Fresco's deploy-time migration updates stored protocols and initializes
  interview locale in the coordinated database migration.
- Architect library-open and import migrations show the new migration note.

## 11. Identity, exports, and compatibility

### 11.1 Protocol hash

`hashProtocol` expands from `{ codebook, stages }` to
`{ localization, codebook, stages }`. Localized maps already live inside the
codebook and stages; including the root declaration additionally makes
default-locale changes and locale-order changes identity-bearing. Protocol
name, description, assets, experiments, and last-modified metadata remain
excluded.

### 11.2 Data export

The selected locale is research metadata. `InterviewExportInput` gains
`locale`, and CSV/GraphML session variables gain a stable
`INTERVIEW_LOCALE`/`nc:interviewLocale` value. Export column names and entity
attribute names continue to use stable codebook `name`, never translated
labels, so choosing another interview language does not change analysis
schema.

### 11.3 Compatibility boundary

- Current Architect, Interviewer, and Fresco move to schema 9 together through
  their existing compatibility constants and migration mechanisms.
- Older modern app versions reject schema 9 as forward-incompatible rather
  than interpreting localized objects as strings.
- Classic applications remain schema 7 and cannot open schema-9 protocols.
- There is no downgrade from schema 9 to schema 8.
- Network Canvas protocol consumers outside this repository must treat the
  schema bump and string-to-map type changes as breaking.

## 12. Failure handling and safeguards

- Invalid browser preferences and malformed `Accept-Language` entries are
  ignored; a protocol default always remains.
- `*` in `Accept-Language` means no specific preference and falls through to
  the default.
- Locale maps are read only after schema validation. Invalid keys such as
  object-prototype names are not well-formed locale tags and are rejected.
- Locale removal and `und` relabeling are atomic protocol edits with collision
  checks.
- Session locale updates are validated against the stored protocol to prevent
  an arbitrary string from entering persistence or exports.
- The runtime never fetches translations and cannot fail because a network
  translation service is unavailable.
- The warning analyser is deterministic and memoizable; it performs no I/O.

## 13. Verification requirements

### 13.1 Protocol-validation

- Canonical and invalid locale tags, aliases, casing, duplicates, `und`, and
  language/region coexistence.
- Localization declaration default membership and ordering.
- Empty maps, required-field empty translations, undeclared keys, and
  at-least-one-key enforcement at every tagged schema site.
- Missing translations remain schema-valid and produce exact warning paths.
- FormatJS best-fit matching, related variants, default fallback, locale-order
  fallback, invalid preferences, and empty preference lists.
- `Accept-Language` quality ordering, stable ties, duplicates, wildcards, and
  malformed values.
- Direction and display-name feature fallbacks.
- Locale-resolved disease label collisions.
- v8-to-v9 migration purity, notes, invariants, and exact target-version
  post-validation.
- Hash changes for translations, default locale, and locale order, but not
  derived labels or direction.

### 13.2 Interview runtime

- Every localized field family renders selected and fallback translations.
- DOM `lang`/`dir` reflects the actual resolved locale.
- Locale changes re-render without resetting network, prompt position, stage
  position, or form answers and travel through sync.
- Chromium, Firefox, and WebKit interface-matrix scenarios cover an incomplete
  Spanish translation with English fallback and an RTL locale.
- Tests prove semantic comparisons use option values and ids, not labels.

### 13.3 Architect

- Add/reorder/change-default/remove/relabel locale flows, including atomic
  rollback on invalid edits.
- Incomplete localized strings save successfully and appear as warnings.
- Undeclared keys and empty localized strings fail loudly.
- Coverage aggregation and exact field navigation.
- `und` migration workflow.
- Preview selected locale and fallback parity with the Interview runtime.

### 13.4 Hosts and exports

- Interviewer browser preference selection, explicit override, encrypted
  session round-trip, resume, synthetic sessions, and `languagechange`
  behavior.
- Fresco header matching, explicit link override, database migration, payload
  serialization, sync validation, and hydration parity.
- Exported locale in CSV and GraphML while stable field names remain unchanged.
- Full migration and validation of bundled protocols, public documentation
  protocols, E2E fixtures, and the private compatibility corpus.

### 13.5 Visual and accessibility review

- Locale selectors, warning states, long translations, and RTL protocol
  content receive Storybook/Chromatic and affected Playwright coverage.
- Every intentional PNG baseline change is generated and inspected under the
  repository's pinned workflow before adoption.
- Keyboard operation, screen-reader names, focus order, zoom, and text
  expansion are checked for the new field and language controls.

## 14. Release and documentation

- Treat `CurrentProtocol`'s string-to-map changes as a breaking
  protocol-validation release.
- Add coordinated normal-lane changesets for protocol-validation, Interview,
  protocol-utilities, network-exporters, Architect, Interviewer, and Fresco as
  required by the implementation.
- Publish a schema-9 migration guide with the `und` behavior, warning/error
  distinction, fallback order, compatibility boundary, and JSON examples.
- Document that protocol localization does not yet translate built-in
  Interview UI copy.
- Update protocol authoring documentation and generated schema/API references.

## 15. Standards and implementation references

- Browser language preference ordering: [MDN `navigator.languages`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/languages)
- ECMA-402 internationalization algorithms: [ECMAScript Internationalization API](https://tc39.es/ecma402/)
- Selected matcher implementation: [FormatJS `intl-localematcher`](https://formatjs.github.io/docs/polyfills/intl-localematcher/)
- Derived locale names: [MDN `Intl.DisplayNames`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames)
- Derived text direction: [MDN `Intl.Locale.prototype.getTextInfo()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/getTextInfo)
- DOM direction semantics: [MDN `dir` global attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/dir)
