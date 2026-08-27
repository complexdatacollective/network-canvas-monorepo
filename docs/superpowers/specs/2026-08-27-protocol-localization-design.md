# Protocol Localization and Locale Resolution Design

**Status:** Proposed for review (2026-08-27).

**Scope:** Protocol schema 10, protocol-authored participant-facing strings,
locale matching and metadata helpers, Architect authoring and warnings, the
Interview runtime, Interviewer, Fresco, Studio protocol storage, and exported
interview metadata.

## 1. Summary

Protocol schema 10 introduces a required `localization` declaration and a
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
  protocol `description`, or `interviewScript` in schema 10. Stage `label` is
  excluded from this non-goal because the Interview Stages menu and Narrative
  Pedigree snapshot titles render it to participants.
- Supporting schema 10 in Architect Classic or Interviewer Classic. Those apps
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
7. **Protocol versions have one owner.** The accepted Dynamic Rosters design
   and epic (#1449, #1457) already define schema 9 and its v8-to-v9 migration.
   Localization therefore follows it as schema 10; it does not copy schema 8
   into a competing schema-9 tree or redefine that migration.

## 5. Schema 10 contract

Schema 9's `dynamicnetwork` contract is a prerequisite. The versioned portion
of this feature starts after #1451 lands and copies the complete schema-9 tree,
including its asset union, reference refinements, and migration behavior, into
schema 10 before applying localization. The localization migration is v9 to
v10. A schema-8 document reaches localization through the registered
v8-to-v9-to-v10 chain, preserving both feature sets. If Dynamic Rosters is ever
cancelled or renumbered, both accepted designs and their epics must be amended
explicitly before implementation; localization must never silently reclaim
version 9.

### 5.1 Example

```json
{
  "schemaVersion": 10,
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

- `localization` is required in schema 10.
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
  unknown, including automatic v9-to-v10 migration.
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
  protocol: Protocol<10>,
): readonly ProtocolLocalizationWarning[];
```

The analyser emits one warning for each declared locale missing at each
localized path. For that warning it calls `resolveLocalizedString` with the
warning's declared `locale` as `selectedLocale`; `fallbackLocale` is the
resolver's returned source locale. This defines what a participant who
selected that locale will actually see and keeps Architect coverage identical
to Interview runtime fallback. A protocol using `und` also receives an
Architect-level "language not identified" warning and a guided relabel
action.

This separation prevents production hosts from treating normal translation
work-in-progress as invalid while giving Architect enough structured data to
aggregate coverage, navigate to a field, and distinguish a missing default
translation.

### 5.5 Participant-facing field inventory

Schema 10 changes the following fields from `string` to `LocalizedString`, or
adds a localized `label` beside a stable `name`:

| Area                  | Localized fields                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| All stages            | Stage `label`, as rendered in the participant Stages menu and Narrative Pedigree snapshot title                                 |
| Codebook definitions  | New required `label` on every node and edge definition                                                                          |
| Variables             | New required `label`; boolean, ordinal, and categorical option `label`; scalar `minLabel` and `maxLabel`                        |
| Shared prompts        | `text`, Tie Strength `negativeLabel`, Categorical Bin `otherVariablePrompt` and `otherOptionLabel`                              |
| Shared forms          | Field `prompt` and `hint`; Name Generator form `title`                                                                          |
| Shared presentation   | Introduction panel `title` and `text`; panel `title`                                                                            |
| Information           | Stage `title`, text-item `content`, and item `description`; asset-item `description`, while asset `content` remains an asset id |
| Anonymisation         | Explanation `title` and `body`                                                                                                  |
| Family Pedigree       | Intro text-item `content`, intro item `description`, `censusPrompt`, and nomination prompt `text`                               |
| Network Composer      | Form-field `label` and `hint`; Visual Analog Scale override `parameters.minLabel` and `parameters.maxLabel`                     |
| Name Generator Roster | Card-property and sort-property `label`                                                                                         |
| Narrative             | Preset `label`                                                                                                                  |
| Narrative Pedigree    | Disease `label`                                                                                                                 |

Network Composer's Visual Analog Scale endpoint overrides need an explicit
schema-10 branch. Schema 9 deliberately stores most Composer parameters as a
loose `Record<string, unknown>`, and `ProtocolField` discovers these two keys
with runtime type checks, so neither TypeScript nor the generic localization
metadata walker would find a map hidden inside that record. The schema-10
Composer field keeps unknown parameter compatibility but gives `minLabel` and
`maxLabel` typed, metadata-tagged `LocalizedString` schemas when the component
is `VisualAnalogScale`. Migration, Architect, and runtime resolution handle
these stage-level overrides separately from the equivalent codebook-variable
labels.

The following remain plain strings because they are ids, semantics, machine
data, or researcher-facing metadata:

- protocol `name` and `description`;
- `interviewScript`;
- ids, entity type keys, variable names, references, asset ids, asset names,
  URLs, filter operands, and option `value` fields;
- ISO date constraints and other machine parameters;
- interface-owned application copy.

An asset `name` remains researcher/storage metadata only if participant
renderers stop using it as fallback copy. Image, audio, and video items resolve
their localized item `description` for alt text and accessible media names. If
an item omits that optional description, the runtime supplies a generic
application-owned media label (and the image may remain decorative where
appropriate); it never exposes the untranslated asset name to a participant.

The inventory must be confirmed against render call sites during
implementation. If a plain schema string is found to be participant-facing,
it joins this list before schema 10 ships; it must not be patched later as an
unversioned schema-10 correction.

### 5.6 Interface-owned options

Family Pedigree and other interface-owned categorical sets continue to pin
their stable values, order, and semantic flags. Their labels become localized
copy and are no longer compared to one canonical English string. Runtime logic
must branch only on the pinned values.

### 5.7 Locale-dependent uniqueness

Narrative Pedigree disease labels must be unique in what a participant can
actually see. The schema-10 root refinement resolves every disease label for
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

1. If an explicit locale was supplied by a participant or researcher, the
   host passes that raw value as the only requested locale. A valid regional
   variant may best-fit to a declared locale (`es-MX` may select declared
   `es`). If the value is malformed or has no declared best-fit match, the
   protocol default wins; lower-priority browser or header preferences are not
   consulted.
2. Otherwise a Vite host passes `navigator.languages`, falling back to
   `navigator.language`.
3. Otherwise a server host passes the ordered, quality-weighted result of
   `Accept-Language` parsing.
4. If the list is empty or no locale matches, the protocol default wins.

Explicit-value presence is determined before normalization, so even a
malformed explicit value is not silently replaced by a browser preference.
An explicit choice is never concatenated with browser languages. This
prevents a later browser language from overriding the user's stated
preference for a partially translated field.

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
  and `Protocol<10>`;
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
converted to resolve it. A blanket deep transformation back to the
pre-localization schema-9 shape is rejected because it would discard the
actual source locale and make accurate `lang` attributes impossible.

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
- The current bundle's commit-time `updateSession` guard preserves the newest
  stored `locale` alongside `protocolHash` when another tab migrates the row
  during encryption. A tab still running a pre-localization schema-8 or
  schema-9 bundle can write a full row with no locale after migration, so the
  durable protocol-migration heal
  pass also restores missing locale to `und` while repairing superseded hash
  references. This compatibility repair runs on every launch until legacy
  tabs have disappeared.
- Synthetic sessions choose the protocol default unless their builder asks
  for a specific locale.
- The in-interview language control can update the session later.

`languagechange` affects only the default for a newly created session. It does
not silently switch an interview already under way.

### 8.3 Fresco (Next.js)

- Prisma `Protocol` gains a required JSON localization declaration. Protocol
  import persists it, the read/query layer reconstructs it, and deploy-time
  migration reads and writes it with schema version, stages, codebook, and
  hash. Existing schema-8/schema-9 rows are backfilled with the migrated `und`
  declaration before the column becomes required.
- The onboarding route parses `Accept-Language` on the server and selects a
  declared locale before creating the interview.
- An explicit `locale`/`lang` recruitment parameter, if supplied, is the only
  requested locale and outranks the header. A canonical regional variant may
  best-fit to a declared locale (`es-MX` to `es`); malformed values and values
  with no declared best-fit match select `defaultLocale`. The raw parameter is
  never persisted.
- Prisma `Interview` gains a required locale column. The create action reads
  the protocol's localization declaration, validates any explicit choice,
  and stores the selected locale atomically with the new interview.
- `mapInterviewPayload` passes the stored locale to the client. Client code
  does not rerun browser detection, avoiding hydration changes.
- New clients include locale in the typed sync payload, and the sync route
  validates a supplied locale against the interview's stored protocol before
  updating. During a rolling deployment the field remains optional at this
  HTTP boundary so an already-open pre-localization client can continue saving
  network and step changes. When such a legacy payload omits locale, the
  update leaves the database's backfilled `und` value unchanged; absence is
  never interpreted as a request to clear it.

If a future participant-facing preflight page is added, it can use the same
derived options. It is not required for initial delivery because the Shell
language control supplies an explicit participant choice.

#### Fresco deployment cutover

Fresco must not rewrite stored schema-8 or schema-9 protocols to schema 10 from
`setup-database.ts`. The Netlify `build:platform` path runs that script before
`next build` while the previous deployment still serves traffic, and the GHCR
container runs it before starting the new server. Rewriting first would make a
pre-localization server reject the rows in both `createInterview` and
`mapInterviewPayload`; a later build/start failure or rollback could strand an
installation. Releasing an intermediate image is not a sufficient guard
because self-hosted installations may skip any image version.

Activation is intrinsically safe for skipped releases:

1. **Additive storage.** Add the protocol localization and interview locale
   columns with database defaults/backfills, so a still-running older server
   can continue inserting rows. Older Prisma clients ignore the new columns.
2. **Permanent versioned read adapter.** The schema-10 Fresco bundle accepts
   stored schema 8, 9, and 10. It uses the registered migration chain to
   produce schema 10 in memory for execution without mutating the stored row.
   The adapter computes the migrated schema-10 hash for runtime payloads and
   exports, so content and identity agree. Protocol reconstruction,
   `createInterview`, payload mapping, exports, locale selection, and strict
   result extensions all use this one adapter. New imports persist schema 10.
3. **No pre-start version rewrite.** Decouple the stored-protocol migration
   target from Interview's runtime compatibility constant and explicitly
   prevent `setup-database.ts` from advancing protocol rows to schema 10. A
   direct upgrade from a pre-compatibility image can therefore build or start
   the new bundle before any localization rewrite, and a failed activation
   leaves protocol bodies and hashes readable by the old installation.
4. **Post-activation convergence is optional.** Mixed stored versions remain a
   supported state. An authenticated re-import or explicit maintenance command
   may persist the migrated schema-10 shape only after a schema-10 server is
   healthy, with backup and rollback consequences surfaced to the operator.
   Such convergence is not run automatically at build/container startup and
   is not a prerequisite for interviews.

The hosted deployment may still stage compatibility and activation releases
to reduce rollout risk, but correctness never depends on that order. Tests must
cover a direct schema-8/schema-9-to-10 upgrade that skips the intermediate
release, setup followed by a forced build/start failure with stored protocol
rows unchanged, and successful start/resume/sync from every supported stored
version.

### 8.4 Architect preview

Architect persists a preview locale preference in its editor state. Preview
controls show every declared locale using derived metadata, defaulting to the
protocol default. `PreviewPayload` carries the selected locale so the popup
does not detect independently. Preview can therefore reproduce every warning
fallback exactly.

Locale mutations keep that preference valid. Relabeling the selected preview
locale moves the preference to the new canonical tag in the same undoable
operation. Removing the selected preview locale resets it to the surviving
`defaultLocale`. A failed locale mutation rolls back both protocol data and
the preview preference, so Preview never receives an undeclared locale.

### 8.5 Studio protocol storage

Studio's sectioned protocol store treats `localization` as protocol-level
settings. `sectionizeProtocol` writes it into the settings section;
`SettingsSectionSchema` validates it for schema 10; and assembly, structural
diff, draft migration, and publishing round-trip it without projection or
loss. Existing schema-8 or schema-9 manifests still assemble exactly as
fielded, then the canonical migration chain adds the `und` declaration when
producing schema 10.

This is storage and current-schema compatibility, not Studio UI localization.
Studio's own message catalogs remain separate work. Schema 10 must not become
current until the Studio server's section taxonomy, validation, migration,
fixtures, and round-trip tests accept the root declaration.

### 8.6 Language and direction in the DOM

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
the declaration entry and every matching localized-string key. If the old tag
is `defaultLocale`, the same transaction updates `defaultLocale` to the new
tag; otherwise the default remains unchanged. A collision with an existing
locale is rejected rather than merged, and any failure rolls back the
declaration, default, and all string-key changes together. The special v8
migration action changes `und` to a chosen locale under the same rules.

The locale operation also owns Architect's preview preference: relabeling its
selected locale retargets it, while removing its selected locale resets it to
the surviving default. Undo and failure rollback restore the preference with
the protocol mutation.

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

## 10. Schema 9 to schema 10 migration

### 10.1 Automatic, lossless rule

The migration cannot know the language of arbitrary schema-9 text. It must not
guess English from the product's history or the device locale. It therefore:

1. adds `localization: { defaultLocale: "und", locales: ["und"] }`;
2. wraps every participant-facing schema-9 string as `{ "und": oldValue }`;
3. omits an empty optional field where schema 10 treats clearing it as absence,
   but preserves an empty value where the schema-9 field contract treated it
   as data;
4. adds node, edge, and variable `label` from the existing stable `name` as
   `{ "und": name }`;
5. preserves every schema-9 `dynamicnetwork` request, header, placeholder,
   sample source/hash, reference, and validation invariant byte-for-byte;
6. preserves option values, ids, references, stage count/order, codebook keys,
   and collected answer shapes; and
7. records a migration note explaining that Architect must identify the
   language.

This obeys the migration invariants already documented in the migration
chain: stages are not added, removed, or reordered, and collected values do
not change shape.

Known English first-party protocols and templates are converted explicitly to
`en-US` in their canonical sources rather than being committed as `und`.
Third-party and stored documents use the honest automatic migration.

### 10.2 Migration plumbing activated by version 10

- Add schema 10 to `SchemaVersion`, `VersionedProtocolSchema`, the migration
  type map, and the registered chain; set `CURRENT_SCHEMA_VERSION` to 10 only
  after all modern consumers compile against it.
- Fix `migrateProtocol` to post-validate against the requested target schema,
  not always `CurrentProtocolSchema`, as required by the existing deferred
  comment.
- Make `ProtocolMigrator` cache identity include the effective target schema
  version. Reusing one caller `cacheKey` for targets 9 and 10 must produce two
  correctly typed and post-validated results; clearing a caller key clears all
  of its target-version variants.
- Interviewer's launch migration recomputes the hash, repoints sessions, and
  initializes their locale in the same transaction. Its current-writer guard
  preserves the freshest hash and locale, while the durable legacy-write heal
  pass restores both a superseded hash and a missing `und` locale after an old
  PWA tab writes.
- Fresco's additive database migration initializes protocol localization and
  interview locale columns without rewriting stored protocol bodies, hashes,
  or versions. Its permanent read adapter migrates older rows in memory; any
  persistent convergence happens only after the schema-10 server is active and
  is never part of pre-build/container-start setup.
- Studio's draft migration and section round trip add and retain localization
  in the settings section before the current-version switch.
- Architect library-open and import migrations show the new migration note.

## 11. Identity, exports, and compatibility

### 11.1 Protocol hash

For schema 10, `hashProtocol` expands from `{ codebook, stages }` to
`{ localization, codebook, stages }`. A version-discriminated path retains the
legacy input for schema 9 and older stored rows. Localized maps already live
inside the codebook and stages; including the root declaration additionally
makes default-locale changes and locale-order changes identity-bearing.
Protocol name, description, assets, experiments, and last-modified metadata
remain excluded.

### 11.2 Data export

The selected locale is research metadata. `InterviewExportInput` gains
`locale`, and CSV/GraphML session variables gain a stable
`INTERVIEW_LOCALE`/`nc:interviewLocale` value. Export column names and entity
attribute names continue to use stable codebook `name`, never translated
labels, so choosing another interview language does not change analysis
schema.

### 11.3 Compatibility boundary

- Current Architect, Interviewer, Fresco, and Studio move to schema 10 together
  through their existing compatibility constants, storage boundaries, and
  migration mechanisms.
- Schema-9 modern app versions reject schema 10 as forward-incompatible rather
  than interpreting localized objects as strings.
- Classic applications remain schema 7 and cannot open schema-10 protocols.
- There is no downgrade from schema 10 to schema 9.
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
- Host compatibility boundaries distinguish omission from an invalid value:
  an optional locale omitted by a legacy Fresco sync preserves the stored
  value, while a supplied undeclared locale is rejected. Interviewer's launch
  healer restores a missing locale created by a legacy full-row write.
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
- Network Composer Visual Analog Scale endpoint overrides are collected,
  validated, warned, and migrated separately from codebook scalar endpoint
  labels despite the schema-9 loose parameter record.
- Missing translations remain schema-valid, produce exact warning paths, and
  report the fallback produced when the missing warning locale is selected.
- FormatJS best-fit matching, related variants, explicit `es-MX` to declared
  `es`, malformed or unmatched explicit values to protocol default without
  consulting lower-priority preferences, locale-order fallback, invalid
  preferences, and empty preference lists.
- `Accept-Language` quality ordering, stable ties, duplicates, wildcards, and
  malformed values.
- Direction and display-name feature fallbacks.
- Locale-resolved disease label collisions.
- v9-to-v10 migration purity, notes, invariants, and exact target-version
  post-validation.
- A complete schema-9 Dynamic Rosters fixture migrates with every
  `dynamicnetwork` field/reference unchanged and remains executable under
  schema 10.
- Migrator caching separates the same caller key by target version and clears
  every target variant predictably.
- Hash changes for translations, default locale, and locale order, but not
  derived labels or direction.

### 13.2 Interview runtime

- Every localized field family renders selected and fallback translations,
  including stage labels in the participant Stages menu and Narrative
  Pedigree snapshot title.
- Network Composer Visual Analog Scale override endpoints resolve through the
  typed component branch rather than the former string-only runtime checks.
- Information and Family Pedigree media controls use resolved item
  descriptions for alt/accessibility labels and never expose asset metadata
  names as participant fallback copy.
- DOM `lang`/`dir` reflects the actual resolved locale.
- Locale changes re-render without resetting network, prompt position, stage
  position, or form answers and travel through sync.
- Chromium, Firefox, and WebKit interface-matrix scenarios cover an incomplete
  Spanish translation with English fallback and an RTL locale.
- Tests prove semantic comparisons use option values and ids, not labels.

### 13.3 Architect

- Add/reorder/change-default/remove/relabel locale flows, including updating
  `defaultLocale` when its tag is relabeled and atomic rollback of the
  declaration, default, and localized-string keys on invalid edits.
- Relabel/removal keeps the preview locale declared, is undoable with the
  protocol edit, and rolls the preference back on failure.
- Incomplete localized strings save successfully and appear as warnings.
- Undeclared keys and empty localized strings fail loudly.
- Coverage aggregation and exact field navigation.
- `und` migration workflow.
- Preview selected locale and fallback parity with the Interview runtime.

### 13.4 Hosts and exports

- Interviewer browser preference selection, explicit override, encrypted
  session round-trip, resume, synthetic sessions, and `languagechange`
  behavior. Cross-tab migration tests interleave encryption with migration to
  prove the current writer preserves the freshest locale, then simulate a
  schema-9 full-row write and prove the next launch heals missing locale to
  `und` without losing session content.
- Fresco protocol-localization persistence on import/read/migrate, header
  matching, explicit link override, interview database migration, payload
  serialization, sync validation, and hydration parity. A rolling-deployment
  test posts the legacy locale-less sync shape after database backfill and
  proves network/current-step changes save while the stored `und` locale is
  preserved; supplied undeclared locales still fail.
- Fresco rollout tests prove setup leaves schema-8/schema-9 rows and hashes
  untouched, the schema-10 server handles mixed stored versions, and a direct
  upgrade that skips the compatibility image remains safe if build or startup
  fails. No pre-start data transaction may depend on an intermediate release
  having run.
- Studio settings-section validation plus sectionize/assemble/diff/migrate/
  publish round-trip of the root declaration.
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
  protocol-utilities, shared-consts, network-exporters,
  `@codaco/development-protocol`, `@codaco/sample-protocol`, Architect,
  Interviewer, and Fresco as required by the implementation. Shared-consts
  must publish the new session-locale export consumed by the externally
  bundled exporter. Both compatibility packages must be versioned and
  published with their schema-10 `protocol.json` content.
- Add a separate Studio-lane changeset for the affected Studio packages; do
  not mix it with the normal lane. Keep separately gated Documentation work in
  its own release lane as usual.
- Publish a schema-10 migration guide with the `und` behavior, warning/error
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
