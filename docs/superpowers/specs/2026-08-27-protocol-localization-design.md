# Protocol Localization and Locale Resolution Design

**Status:** Implemented on `feat/protocol-localization`. This document
reflects the implementation as of 7 October 2026. The design reviewed on
2026-08-27 was revised during implementation; see Revisions.

**Scope:** Protocol schema 9, protocol-authored participant-facing strings,
locale matching and metadata helpers, the Language Chooser stage, Architect
authoring and warnings, the Interview runtime, Interviewer, Fresco, Studio
protocol storage, and exported interview metadata.

## Revisions

The proposal reviewed on 2026-08-27 differs from what was built in the ways
below. Every later section describes the built behaviour. A reason is given
where the repository records one.

1. **A Language Chooser stage replaces the settings-menu language control.**
   The product owner revised the participant control. The proposal put a
   language select in the Interview settings menu and in Interviewer's
   new-session form; the Shell has neither. The protocol language is negotiated
   on every load from the participant's browser languages, and the only
   participant control is a `LanguageChooser` stage (#1621) that the protocol
   author places in the interview (§8.2).
2. **The stored value is a preference, not the locale.** The proposal stored one
   `locale` that decided the language. A session now carries `localePreference`
   (set only by an explicit choice, and the only stored value that decides the
   language), `locale` (the language last shown, recorded for exports) and
   `localeOptions` (never stored). Hosts implement
   `ProtocolLocaleChangeHandler`, `(interviewId, { locale, localePreference })`,
   and pass it as the Shell's `onProtocolLocaleChange`, instead of
   `LocaleChangeHandler(interviewId, locale)`; the Shell also takes
   `requestedLocales` (§8.1). This follows from the first revision: with no
   settings-menu control, the language shown is chosen from the browser unless
   the participant has stated one.
3. **Interviewer keeps the language on the session row.** The separate
   `sessionLocales` table, its revision counter, the heal pass for missing
   records, and orphan cleanup were not built. Two plaintext fields on the
   stored session (Dexie version 4) take their place, and general writes cannot
   overwrite them (§8.4). The proposal's new-session language select was also
   not built.
4. **Fresco has no recruitment language parameter and no deployment-cutover
   machinery.** The onboarding `locale`/`lang` parameter, the permanent read
   adapter for stored schema-7/8 protocols, and the canonical hash aliases were
   not built. The existing deploy-time migration brings stored protocols to
   schema 9 (§8.5). The repository does not record the reason.
5. **The interface language is negotiated separately.** The proposal made the
   built-in interface messages a non-goal. They exist in ten languages, and the
   Shell picks one independently of the protocol locale (§8.3).
6. **Values are ICU MessageFormat literal messages.** The proposal stored raw
   strings. A message is escaped on save, unescaped on load, and formatted at
   runtime with `IntlMessageFormat` (§5.3). The ICU parser therefore stays in
   production builds, because validation and rendering parse messages while the
   app runs.
7. **Preferences are matched one at a time, and Chinese is matched by script.**
   The proposal matched the whole preference list at once. Best fit over a list
   lets a later exact match beat an earlier regional one, so a browser set to
   `es-MX, en` received English although Spanish was declared (§6.2).
8. **Architect keeps no preview locale.** The proposal stored a preview locale
   in editor state and in `PreviewPayload`. A preview now opens in the language
   the author's browser would see and has a "Preview language" menu that lasts
   while the preview window is open (§8.6). The localization page is the
   Languages page, and a shared editing-language menu switches every localized
   field together (§9).
9. **Dynamic Rosters is not part of this schema 9.** The proposal expected to
   share the schema-9 tree and v8-to-v9 migration with Dynamic Rosters (#1449,
   #1457, #1451). Schema 9 here combines localization with unrestricted
   attribute names, and carries no Dynamic Rosters rules or fixtures. The
   repository does not record the reason.
10. **A text item's `description` stays a plain researcher note.** The proposal
    localized every item `description`. Only an asset item's `description`, the
    media's alt text, is localized (§5.5). The schema comment gives the reason:
    a text item's description is never shown to a participant.
11. **A CSV column collision renames the variable.** The proposal allocated a
    `networkCanvasInterviewLocale__session` column for the metadata. The
    metadata column keeps its name and a variable that would print under it is
    written as `networkCanvasInterviewLocale_2`, with a `column-renamed`
    warning (§11.2).
12. **Studio stores new protocols as `und`.** A protocol created in Studio
    declares the undetermined language because Studio does not yet ask which
    language the researcher is writing in (§8.7).
13. **Attribute labels are plain text, and Narrative highlights carry their own
    localized labels.** The proposal gave every codebook variable a localized
    `label`. The product owner revised this: participants never read an
    attribute's label, so it is a plain, non-empty string that is not
    translated. The one place participants did read attribute labels, the
    Narrative preset switcher, now takes its text from the preset: `highlight`
    is a list of `{ variable, label }` whose `label` is localized and edited in
    the Narrative stage editor (§5.5, §9.2, §10.1).
14. **A Network Composer field always carries its own caption.** A field's
    `label` stayed optional, as in schema 8, and the interview captioned a
    field without one with the attribute's label, which revision 13 leaves
    untranslated. The product owner pushed the localization to the interface
    configuration instead: `label` is a required, non-empty localized string,
    the stage editor starts it as the attribute's name when the attribute is
    chosen, and the migration fills a missing or empty one from the
    attribute's name (§5.5, §9.2, §10.1).
15. **A protocol's languages have no order, and each text falls back to the
    best available translation.** The proposal made the order of
    `localization.locales` meaningful: it was the final per-string fallback
    order, part of protocol identity, and editable on the Languages page.
    The product owner removed it. This changes four things:
    - **No language order.** Nothing reads the order of `locales`. Reordering,
      with its move buttons, drag handles and `moveLocale`, is gone, and
      `hashProtocol` sorts the languages before hashing, so a protocol's
      identity does not depend on the order they are stored in (§5.2, §9.1,
      §11.1). Hosts pass `localeOptions` in any order, and the Shell throws
      only if the set of languages differs from the declaration (§6.4).
    - **Alphabetical lists.** Every list of a protocol's languages is shown
      alphabetically, through `sortByLanguageName`: the Language Chooser by
      each language's own name, collated for the interface language, and
      Architect by name in its own interface language (§6.4, §8.2, §9.1).
    - **Best available translation per text.** A text needs a translation in
      at least one declared language, and the default language is not
      required: a translation missing from any language, the default
      included, is a warning and never an error. For each text the participant
      sees the first translation found in the participant's own language (the
      interview language), then in each other language their browser lists, in
      order, then in the default language, then in any language of the
      protocol. Each step matches exactly or by its closest related language.
      The resolver takes the participant's languages in preference order and
      reports how the translation was found (§6.3). Architect shows
      researchers what participants see, including when the participant's
      browser could change it (§9.2, §9.3).
    - **The Language Chooser editor manages languages.** Researchers can add
      and remove languages, make one the default, and change a language from
      the Language Chooser stage's editor, as well as on the Languages page.
      It is the same list, with the same operations and refusals (§8.2, §9.1).

## 1. Summary

Protocol schema 9 introduces a required `localization` declaration and a
`LocalizedString` object for every protocol-authored string rendered to a
participant. A localized string may be incomplete: it must contain at least
one locale entry, in any declared language, and may contain only locales
declared by the protocol, but it does not need to contain every declared
locale, the default included. Each value is an ICU
MessageFormat message that may contain only literal text. Missing
translations are therefore authoring warnings, not protocol-validation
errors.

At interview time, a single protocol locale, the interview language, is
selected from the user's ordered preferences: the language the participant
stated on a Language Chooser stage when there is one, otherwise the browser's
languages. Each preference is tried in turn against the declared locales using
`@formatjs/intl-localematcher` with the `best fit` algorithm, and the first
that fits wins; the protocol default applies when none does. Without a stated
preference the selection is made afresh on every load. Each localized string is
then resolved independently, and shows the first of these that has a
translation: the interview language; each other language the browser lists, in
order; the protocol default; and finally any declared language. Each is matched
exactly or by its closest related language. The declared languages have no
order of their own, so no part of resolution depends on it. This makes
partially translated protocols runnable while keeping fallback deterministic.

The schema, locale primitives, matcher, ICU literal-message helpers, warning
analyser, HTTP-header parser, and locale metadata helpers live in
`@codaco/protocol-validation`. They are framework-free and side-effect-free.
React context and hooks live in `@codaco/interview`. Vite applications read
browser preferences at their host boundary; Fresco reads `Accept-Language` on
the Next.js server for each request. Both pass the ordered list to the Shell
as `requestedLocales`. A participant has one control: a Language Chooser stage
that the protocol author places in the interview. The built-in interface
language is negotiated separately from the protocol language. Shared code
never imports Next.js APIs and never reads browser globals at module
evaluation.

## 2. Goals

- Represent multiple translations of protocol-authored participant copy in a
  schema-valid, portable `.netcanvas` document.
- Allow incomplete translations during development and fieldwork, with clear
  authoring warnings and deterministic runtime fallback.
- Select the protocol locale from the participant's stated choice, browser
  language preferences, or HTTP `Accept-Language`, in that priority order, and
  select again on every load until the participant states a choice.
- Let a participant choose the interview language on a Language Chooser stage,
  switch the whole interview immediately, and persist the choice with the
  session.
- Choose the built-in interface language independently of the protocol's
  languages.
- Derive locale display names and text direction rather than storing mutable
  English labels or an `ltr`/`rtl` flag in the protocol.
- Use one pure resolution implementation in Architect preview, Interviewer,
  Fresco, tests, and server-side code.
- Preserve stable codebook names, option values, entity keys, stage ids, and
  collected answer shapes.
- Record the language last shown in each interview in exported data.

## 3. Non-goals

- Writing the Interview package's own built-in user-interface messages into
  protocols. Navigation labels, validation messages, and dialogs come from
  application message catalogs, which the Interview package supplies in ten
  interface languages and negotiates separately from the protocol language
  (§8.3). They must not be placed in each protocol.
- A language control outside the Language Chooser stage. The Interview
  settings menu has none, and Interviewer's new-session form asks for no
  language.
- Machine translation or translation-memory integration.
- Loading translations from remote files at interview time. All protocol
  translations remain inline so offline interviews are complete and
  reproducible.
- Localizing researcher-facing protocol metadata such as the protocol `name`,
  protocol `description`, or `interviewScript` in schema 9. Stage `label` is
  excluded from this non-goal because the Interview Stages menu and Narrative
  Pedigree snapshot titles render it to participants. The `description` of an
  Information or Family Pedigree text item is a researcher note and also stays
  plain.
- Supporting schema 9 in Architect Classic or Interviewer Classic. Those apps
  remain on their external schema-7 validation dependencies.
- Locale-sensitive formatting of dates, numbers, or plural messages. Values
  are ICU MessageFormat messages but may contain only literal text, so
  arguments, `plural`, `select`, and number or date formats are refused. This
  design localizes strings and supplies locale context; richer formatting can
  use that context later.

## 4. Design principles

1. **Locale identifiers are data; labels are presentation.** Protocols store
   canonical BCP 47 tags only. Autonyms and direction are derived at runtime.
2. **Incomplete is valid; undeclared is invalid.** Missing translations are
   warnings. Unknown locale keys and empty localized objects are validation
   errors.
3. **A stated choice decides; otherwise the browser decides, on every load.**
   Only a participant's explicit choice (`localePreference`) is stored as an
   input to selection. Browser preference lists are matched on each load and
   never stored, which avoids keeping a potentially identifying browser
   language list. The language last shown (`locale`) is recorded for exports
   and never used to choose one. A resumed interview with no stated choice
   therefore follows the device it resumes on.
4. **Fallback is local to a string, and the best available translation
   wins.** A protocol may display a Spanish prompt and fall back to English
   for a missing hint. Each string is resolved through the participant's
   languages (the interview language, then the browser's other languages),
   then the default, then any language, so a participant sees a language they
   have said they read before one they have not. The declared languages have
   no order to fall back through. Resolution reports the actual source locale
   and how it was found, so the DOM can carry an accurate `lang` attribute and
   Architect can tell researchers what participants see.
5. **Semantic values never depend on translated copy.** Runtime branches,
   filtering, exports, and migration use ids, keys, and option values, never
   localized labels.
6. **The schema remains the inventory.** Localizable schema nodes carry Zod
   metadata. Validation and warning collection walk that metadata so adding a
   field cannot silently omit it from coverage reporting.
7. **Schema 9 carries all pending schema work.** Schema 8 is the last
   published contract. Localization shares the unreleased schema-9 tree and
   the single v8-to-v9 migration with the unrestricted attribute-name change.
   It does not create a second schema-9 tree, a second migration edge, or a
   schema-10 follow-up for another incomplete feature.

## 5. Schema 9 contract

Schema 9 is a coordinated, unreleased contract. It carries two changes:
attribute (variable) names may use any script, and every participant-facing
string is localized. Both live in one version-isolated tree and one registered
v8-to-v9 migration. A schema-8 document traverses that one edge and receives
both changes together. The schema-9 packages and applications must not be
published until the combined contract is complete.

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
copy. The same separation is introduced for node and edge definitions.
Variables gain a `label` too, but it is plain text and not localized (§5.5).

### 5.2 Localization declaration

```ts
type LocalizationDeclaration = Readonly<{
  defaultLocale: LocaleTag;
  locales: readonly LocaleTag[];
}>;
```

Validation requirements:

- `localization` is required in schema 9.
- `locales` contains at least one locale and is unique after canonicalization.
  Its order carries no meaning (see the last requirement).
- `defaultLocale` must be an exact member of `locales`.
- Every locale is a well-formed, canonical BCP 47 tag as accepted by
  `Intl.getCanonicalLocales`.
- Noncanonical aliases or casing such as `EN_us` or `iw` are rejected with a
  suggested canonical value. Architect canonicalizes before it writes.
- Both language-only tags (`es`) and language-region tags (`es-MX`) are valid
  and may coexist.
- `und` is valid and reserved for content whose source language is genuinely
  unknown, including automatic migration of schema-8 strings to schema 9.
- The order of `locales` is not significant. It is not a fallback order, no
  interface lists the languages in it, and `hashProtocol` sorts the locales
  before hashing, so two protocols that differ only in that order have the
  same identity. Every list of the protocol's languages is alphabetical (§8.2,
  §9.1).

The schema deliberately does not store locale names, flags, or direction.

### 5.3 LocalizedString

```ts
type LocalizedString = Readonly<Record<LocaleTag, string>>;
```

Each value is an ICU MessageFormat message that may contain only literal text:

- Placeholders and formatting (`{name}`, `plural`, `select`, number and date
  formats) are refused, and so is a message that does not parse.
- Tags are not markup. The parser runs with `ignoreTag`, so `<br>` and similar
  in a markdown field stay literal text.
- `{`, `}`, and an apostrophe that ICU would read as quote syntax must be
  escaped. `escapeMessageText(text)` turns plain text into a message whose only
  element is that text, and `messageText(message)` turns a message back into
  plain text, so `messageText(escapeMessageText(text)) === text` for every
  string. `messageText` returns a message it cannot read as literal text
  unchanged, so an editor can still show what the protocol holds.
- Editors show and save plain text and escape on save, migration escapes the
  text it wraps, and the runtime formats each message with `IntlMessageFormat`
  in the locale the message is written in.
- The ICU parser is therefore a production dependency of validation and of the
  runtime, and the `appI18n()` build plugin keeps it in application bundles.

Each localized site also carries its render format in schema metadata,
`'plain'` or `'markdown'`, which `collectLocalizedStrings` reports with every
string. A markdown field formats the message first and renders the result as
markdown; a plain field renders the formatted text.

A localized string has these blocking validation rules:

- It is an object with at least one own key.
- Every key is a canonical BCP 47 locale tag.
- Every key is present in the enclosing protocol's `localization.locales`. The
  protocol-level refinement checks this, because only it can see the
  declaration.
- Every defined translation is a literal-only ICU message that satisfies the
  content rule of its owning field. A field that was `string().min(1)` in
  schema 8 applies that rule to every supplied translation; a field that
  previously accepted an empty string does not become stricter merely because
  it is localized. The editors normalize a cleared translation by removing that
  locale key and, when no keys remain, omitting an optional field; a required
  field reports an error.

It explicitly does **not** require:

- all locales declared by the protocol;
- the protocol's `defaultLocale`; or
- the same set of locales as another localized string.

The first two omissions produce authoring warnings. They never make the
protocol invalid. The only requirement is a translation in at least one
declared language, whichever it is: a text missing from the default language
is no more than a warning.

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
localized path, except that a string with no translation in any declared
locale is a validation error and produces no warning. For each warning it
calls `resolveLocalizedString` for a participant whose only language is the
warning's declared `locale`; `fallbackLocale` is the resolver's returned source
locale, and the resolver's report of how it found that translation tells
Architect whether the participant's browser could change the result (§9.2).
This defines what a participant who uses that locale will actually see, unless
their browser also lists a language that has the text, and keeps Architect
coverage identical to Interview runtime fallback.

This separation prevents production hosts from treating normal translation
work-in-progress as invalid while giving Architect enough structured data to
aggregate coverage, navigate to a field, and distinguish a missing default
translation.

### 5.5 Participant-facing field inventory

Schema 9 changes the following fields from `string` to `LocalizedString`, adds
a localized `label` beside a stable `name`, or adds a localized field:

| Area                  | Localized fields                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| All stages            | Stage `label`, as rendered in the participant Stages menu and Narrative Pedigree snapshot title             |
| Codebook definitions  | New required `label` on every node and edge definition                                                      |
| Variables             | Boolean, ordinal, and categorical option `label`; scalar `minLabel` and `maxLabel`                          |
| Shared prompts        | `text`, Tie Strength `negativeLabel`, Categorical Bin `otherVariablePrompt` and `otherOptionLabel`          |
| Shared forms          | Field `prompt` and `hint`; Name Generator form `title`                                                      |
| Shared presentation   | Introduction panel `title` and `text`; panel `title`                                                        |
| Information           | Stage `title`, text-item `content`, and asset-item `description`; asset `content` remains an asset id       |
| Anonymisation         | Explanation `title` and `body`                                                                              |
| Family Pedigree       | Intro text-item `content` and asset-item `description`, `censusPrompt`, and nomination prompt `text`        |
| Network Composer      | Form-field `label` and `hint`; Visual Analog Scale override `parameters.minLabel` and `parameters.maxLabel` |
| Name Generator Roster | Card-property and sort-property `label`                                                                     |
| Narrative             | Preset `label`; the `label` of each `highlight` entry                                                       |
| Narrative Pedigree    | Disease `label`                                                                                             |

A text item's `description`, in an Information stage or a Family Pedigree intro
screen, is never shown to a participant, so it stays a plain researcher note.
Only an asset item's `description`, the media's alt text, is localized.

A Narrative preset's `highlight` is a list of `{ variable, label }` entries
rather than a list of variable ids. The preset switcher lists the highlighted
attributes for the participant to choose among, so each entry carries its own
localized `label`. The stage editor starts a newly ticked attribute's label as
the attribute's name in the default language, and requires one.

A variable's `label` is a required, non-empty plain string, not a
`LocalizedString`. It is a readable name for researchers, is not translated,
and is not shown to participants.

A Network Composer form field's `label`, the caption participants read above
its control, is a required, non-empty markdown `LocalizedString`, so every
field carries text that can be translated rather than borrowing the
attribute's label.

A Network Composer form field is a union on `component`. The Visual Analog
Scale branch gives `parameters.minLabel` and `parameters.maxLabel` typed,
metadata-tagged `LocalizedString` schemas while the parameter record stays
loose for any other key. Every other control keeps `parameters` as a loose
`Record<string, unknown>`. Schema 8 typed no end label there, and the
interview only ever rendered string end labels, so migration drops an end
label that is not a string. The typed branch is what lets the generic
localization metadata walker find these two keys, which a loose record would
hide. Runtime resolution handles these stage-level overrides separately from
the equivalent codebook-variable labels.

Name Generator Roster card details must not use resolved label text as data
identity. Two distinct properties may legitimately resolve to the same label
in a locale, so uniqueness validation would incorrectly reject valid
translations. Runtime card data is instead an ordered collection of
`{ id, label, value }` entries: `id` combines the stable stage/card-property
schema path (including its array index) with the resolved variable/column
identity, never the label; `label` retains the full resolution result and
source locale; and `value` is the corresponding attribute. `DataCard` keys and
preserves entries by `id`; duplicate rendered labels remain separate rows, as
do repeated references to the same roster column.

The following remain plain strings because they are ids, semantics, machine
data, or researcher-facing metadata:

- protocol `name` and `description`;
- `interviewScript`;
- the `description` of an Information or Family Pedigree text item;
- a codebook variable's `label`;
- ids, entity type keys, variable names, references, asset ids, asset names,
  URLs, filter operands, and option `value` fields;
- ISO date constraints and other machine parameters;
- interface-owned application copy.

An asset `name` remains researcher/storage metadata only if participant
renderers stop using it as fallback copy. Image, audio, and video items resolve
their localized item `description` for alt text and accessible media names. If
an item omits that optional description, or it is blank, the runtime supplies a
generic application-owned media label (and the image may remain decorative
where appropriate); it never exposes the untranslated asset name to a
participant.

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
  localization: LocalizationDeclaration,
): LocaleTag;

type LocaleMetadata = Readonly<{
  locale: LocaleTag;
  label: string;
  direction: 'ltr' | 'rtl';
}>;

function getLocaleMetadata(
  locale: string,
  displayLocale?: string,
): LocaleMetadata;

function sortByLanguageName<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  displayLocale: string,
): T[];

function escapeMessageText(text: string): string;

function messageText(message: string): string;
```

`resolveLocalizedString` and its result type `ResolvedLocalizedString` (§6.3),
`analyzeProtocolLocalization` (§5.4) and `collectLocalizedStrings` complete the
set. `resolveLocalizedString` returns the message as stored; the formatted text
is produced in the Interview runtime (§7.2). `getLocaleMetadata` throws a
`RangeError` for a tag that is not well formed. `sortByLanguageName` orders any
list of languages alphabetically by the names its reader sees, collated for the
reader's language. A protocol's languages carry no order of their own, so the
Language Chooser, the protocol builder and Architect all list them through it
(§6.4).

Invalid preference entries are ignored. Invalid protocol data is not silently
normalized by these helpers; it must be validated first.

### 6.2 Initial protocol locale

`selectProtocolLocale` canonicalizes and de-duplicates the ordered request
list, then tries the preferences one at a time, in order, and returns the
first that fits a declared locale. For each preference, `matchLocalePreference`
(internal to the package, and shared with per-string resolution) does this:

1. A preference that is declared exactly is used as it is. Any other preference
   goes through `toScriptMatchingTag` from `@codaco/shared-consts`, which turns
   a Chinese tag into `zh-<likely script>`: `zh-TW` and `zh-Hant-TW` reach a
   declared `zh-Hant`, and `zh` and `zh-SG` reach `zh-Hans`. Best fit weighs
   region as well as script, so without this a Hong Kong browser (`zh-HK, zh`)
   would reach `zh-Hans`.
2. The result is matched with FormatJS `best fit`, through
   `match([matchingTag], declared, NO_FIT, { algorithm: 'best fit' })`. The
   default is a sentinel that is never a declared tag, so a miss stays
   distinguishable from a real fit.
3. A fit counts only when it is one of the declared locales verbatim. Best fit
   can return a tag that is not in the list, such as `he` for a declared `iw`.

If no preference fits, or the list is empty, the protocol `defaultLocale` wins.

Preferences are matched one at a time because best fit over the whole list
lets a later exact match beat an earlier regional one: `['es-MX', 'en']` would
select `en` when `es` is declared. The built-in interface language uses the
same rule (§8.3).

Priority is established before the call. What the host passes is:

1. If the participant stated a language (`localePreference`), that value is the
   only requested locale. A valid regional variant may best-fit to a declared
   locale (`es-MX` may select declared `es`). If the value no longer matches a
   declared locale, for example because the author removed that language, the
   protocol default wins; lower-priority browser preferences are not
   consulted.
2. Otherwise the host's `requestedLocales`: a Vite host passes
   `navigator.languages`, falling back to `navigator.language`, and Fresco
   passes the ordered, quality-weighted result of `Accept-Language` parsing,
   read on the server for each request.
3. If the list is empty or no locale matches, the protocol default wins.

Whether a language was stated is determined from the stored
`localePreference` before normalization, so even a malformed stated value is
not silently replaced by a browser preference. A stated language alone decides
the interview language: it is never merged into the browser's list for that
choice, so a later browser language cannot override it. The browser's other
languages still count as fallbacks for a text the interview language lacks,
because per-string resolution (§6.3) takes the interview language first and
then the languages in `requestedLocales`.

### 6.3 Per-string resolution

`resolveLocalizedString` takes the participant's languages in preference order.
The first is the language shown, the interview language of §6.2. The others are
the languages in `requestedLocales`, in the order the browser lists them. For a
localized string, the resolver tries these steps in order and returns the
translation of the first that has one:

1. The first language, the language shown.
2. Each of the other languages, in order.
3. The protocol's `defaultLocale`.
4. Any language the string has a translation in.

Steps 1 to 3 match a language against the locales the string has, with the same
one-preference matcher as §6.2 (FormatJS `best fit`, Chinese by script), so a
language matches exactly or by its closest related language. The related
languages come from CLDR's language-matching data: `pt-PT` reaches `pt-BR`,
`es-MX` reaches `es`, `zh-TW` reaches `zh-Hant`, and a language that CLDR treats
as an acceptable substitute reaches its substitute, such as Swiss German (`gsw`)
for `de`. A language with no fit among the string's locales is skipped, and so
is a malformed preference. Step 4 applies only when nothing before it found a
translation. The declared languages have no order to choose by, so it takes the
first of the string's locales by tag, compared character by character, which
keeps the result the same in every runtime. Neither the order of
`localization.locales` nor the insertion order of the string's keys plays a part
in any step: the matcher is given the locales sorted by tag, so two equally
close languages resolve the same way whatever order they were declared in.

The schema guarantees the string has a translation; the resolver throws for a
value with no translation in any declared locale, so validate first.

```ts
function resolveLocalizedString(
  value: Readonly<Record<LocaleTag, string>>,
  localization: LocalizationDeclaration,
  requestedLocales: readonly [string, ...string[]],
): ResolvedLocalizedString;

type ResolvedLocalizedString = Readonly<{
  text: string;
  locale: LocaleTag; // the language of the translation shown
  selectedLocale: LocaleTag; // requestedLocales[0], canonicalized
  usedFallback: boolean; // false only for the selected language's own text
  matchedBy: 'selected' | 'requested' | 'default' | 'any';
}>;
```

`matchedBy` names the step that found the translation: the first language or
one related to it, another of the participant's languages, the protocol
default, or any language. It replaces the earlier `usedDefaultLocale` flag.
Callers do not reimplement this logic: the Interview adapters use `locale` for
the `lang` and `dir` of the text (§8.8), and Architect and the protocol builder
use `matchedBy` to tell researchers what participants see (§9.2). An editor
knows only the language being edited, so it resolves with that one language: a
`matchedBy` of `selected` is certain, and `default` or `any` could still be
changed by a language the participant's browser lists, which the note says.

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
- `und` has no name of its own: `Intl.DisplayNames` calls it "root", which
  means nothing to a participant. The Interview provider replaces that label
  with "Unspecified language" in the interface language, and Studio's editor
  (protocol-builder) does the same wherever it names a language.

Display-name spelling is presentation-only and may vary with the JavaScript
runtime. It is never validated, persisted, or hashed. Direction fallback is
deterministic and has explicit Arabic, Hebrew, Persian, Urdu, and mixed-script
tests.

That permitted display-name variation must not cross an SSR hydration
boundary. `SessionPayload` carries a `localeOptions` array containing one
`LocaleMetadata` entry for every declared protocol locale, in any order. The
host derives it with `getLocaleMetadata`: Interviewer and Architect immediately
before launching the Interview, and Fresco once on the server in
`mapInterviewPayload`, which serializes the exact array into the client
payload. The localization provider uses these serialized labels and
directions for the initial render and the Language Chooser rather than calling
`Intl.DisplayNames` again during hydration. It sorts the options alphabetically
by label, collated for the interface language, so the Language Chooser lists
them the same way whatever order the host passed them in. It throws only if
the set of option locales differs from the declaration, and it replaces only
the `und` label. Locale-option metadata is ephemeral presentation data: it is
neither stored with the interview nor included in protocol identity.

Architect lists a protocol's languages the same way, alphabetically by their
names in Architect's own interface language, through `sortByLanguageName`.

## 7. Package and module architecture

### 7.1 Chosen owner: `@codaco/protocol-validation`

The existing package is the right owner because:

- the helpers operate directly on `LocalizationDeclaration`, `LocalizedString`,
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
exports; it does not add a barrel file. `@formatjs/intl-localematcher` and
`@formatjs/icu-messageformat-parser` are workspace-catalog dependencies of
protocol-validation. The one helper that lives elsewhere is
`toScriptMatchingTag`, which `@codaco/shared-consts` already shares with the
website's locale matching; protocol-validation depends on shared-consts for it.
The website's existing direct use adopts the catalog version but does not need
to import protocol-validation.

### 7.2 React owner: `@codaco/interview`

The Interview package adds a `ProtocolLocalizationProvider` around rendered
interfaces and exposes:

```ts
function useProtocolLocale(): Readonly<{
  locale: LocaleTag;
  metadata: LocaleMetadata;
  options: readonly LocaleMetadata[];
  setLocale(locale: LocaleTag): void;
}>;

function useResolveLocalizedString(): (
  value: LocalizedString,
) => ResolvedLocalizedString;

function useLocalizedString(value: LocalizedString): ResolvedLocalizedString;

function useResolvePresentationalText(): (
  value: LocalizedString,
) => PresentationalText;

function usePresentationalText(value: LocalizedString): PresentationalText;
```

The provider takes the protocol's declaration, the host-supplied
`localeOptions`, `requestedLocales`, the stored `localePreference`, and the
`locale` last recorded. It derives the locale as
`selectProtocolLocale(localePreference === null ? requestedLocales : [localePreference], localization)`,
so the browser decides until a preference is stated and a stated one is the
only request. `setLocale` validates the tag against the declaration and
dispatches a session-state action that records the preference, which renders
immediately. After render, the provider also reports the locale shown when it
differs from the recorded one. The session middleware (§8.1) turns both into
`onProtocolLocaleChange` calls. The resolver hooks give the pure resolver the
participant's languages in preference order: the locale shown first, then the
languages in `requestedLocales`. A text the shown locale lacks therefore falls
back to another of the participant's languages before the protocol default (§6.3).
Non-React selectors and utilities call the pure resolver with the same list
passed explicitly.

The resolver hooks return the formatted message: `IntlMessageFormat` formats
each message in the locale it is written in, with `ignoreTag`, and caches the
result per locale and message. `LocalizedText` and `LocalizedMarkdown` render a
resolved string with its `lang` and `dir`.

Fresco UI remains protocol-agnostic but must be able to retain resolved locale
metadata. It adds a small presentation value, exported from
`@codaco/fresco-ui/PresentationalText` with the helpers `isPresentationalText`,
`presentationalTextValue`, and `presentationalTextProps`, accepted alongside its
existing plain-string APIs:

```ts
type PresentationalText =
  | string
  | Readonly<{
      text: string;
      lang: string;
      dir: 'ltr' | 'rtl';
    }>;
```

Interview adapters convert `ResolvedLocalizedString` to this shape for field
labels, hints, option labels, scalar endpoints, Network Composer endpoints,
and roster details. Text resolved in `und` stays a plain string, so it keeps
the surrounding language as protocol text always has, rather than telling
assistive technology that its language is unknown. Fresco UI components unwrap
`text` wherever a primitive string is operationally required, while the nearest
visible text element or native option receives `lang` and `dir`.
Markdown-capable labels retain their current rendering behavior inside that
attributed wrapper. Existing application-owned strings remain valid without
locale metadata. A ReactNode escape hatch alone is insufficient because
select/filter/ARIA code paths also need a stable primitive value and explicit
locale attributes.

The protocol schema's type change is intentionally used as a compiler-driven
inventory: every participant renderer that expects a plain string must be
converted to resolve it. A blanket deep transformation back to the
pre-localization schema-8 shape is rejected because it would discard the
actual source locale and make accurate `lang` attributes impossible.

### 7.3 Universal and SSR constraints

- No shared module reads `window`, `navigator`, `document`, cookies, or Next
  request APIs at module scope.
- Pure helpers accept strings and readonly arrays and produce serializable
  values.
- Browser and HTTP preference collection happens in host adapters, which pass
  the Shell `requestedLocales`.
- Fresco parses `Accept-Language` on the server for each request and passes the
  resulting list to the client Shell, together with the complete
  `localeOptions` metadata in `InterviewPayload`. The server render and the
  hydration therefore choose the same locale from the same list and show the
  same display names. The list is not stored.
- Tests exercise the helpers under Node without DOM shims and under Vite
  browser tests.

## 8. Runtime and host behavior

### 8.1 Session contract

`SessionSnapshot` is the session as the engine holds it and hands it to
`SyncHandler`. It gains two nullable fields:

- `localePreference: LocaleTag | null` is the language the participant chose on
  a Language Chooser stage. It is the only stored value that decides which
  protocol translation is shown, and it is `null` until a choice is made.
- `locale: LocaleTag | null` is the protocol translation last shown. It is
  recorded for exports and is never used to choose a translation. It is `null`
  until the engine first reports it.

`SessionPayload` is what a host passes to start or resume an interview: a
`SessionSnapshot` plus the `localeOptions` presentation metadata described in
§6.4: one entry for each declared language, in any order. `localeOptions` is
never persisted or synchronized. Sessions
stored before protocols declared languages hold `null` in both fields; the
interview records `locale` the next time it runs.

The browser or HTTP preference list is never stored. The Shell takes it as
`requestedLocales`: `navigator.languages` in a browser host, the parsed
`Accept-Language` header in a server-rendered host, which serializes it to the
client so that both choose alike. The package reads no browser or storage
globals itself. Until the participant states a preference, `requestedLocales`
chooses both the protocol translation (§7.2) and the interface language (§8.3).
Whether or not a preference is stated, the browser's languages also supply the
fallback for a text that the language shown lacks: such a text is shown in
another language the browser lists, when the protocol has the text in it,
before the protocol default is used (§6.3).

The public host contract replaces the proposed `LocaleChangeHandler` with a
required `ProtocolLocaleChangeHandler`, passed to the Shell as
`onProtocolLocaleChange` alongside `SyncHandler`:

```ts
type ProtocolLocaleChange = Readonly<{
  locale: LocaleTag;
  localePreference: LocaleTag | null;
}>;

type ProtocolLocaleChangeHandler = (
  interviewId: string,
  change: ProtocolLocaleChange,
) => Promise<void>;
```

The engine behaves as follows:

- `setLocalePreference` sets `localePreference` and `locale` to the chosen
  locale in one state change. After render, when the locale shown differs from
  `locale`, `recordLocale` updates `locale` alone. Neither action changes
  `lastUpdated`, because neither is interview data.
- The locale-change middleware calls the handler once for each change to either
  field, one call at a time and in order. A failed call is logged and does not
  stop later calls. It makes no call while `locale` is `null`. A flush of the
  session waits for the queued locale writes as well as the session write.
- `syncMiddleware` excludes `locale` and `localePreference` from its change
  detector, so a change to them alone never triggers `SyncHandler`. A
  `SyncHandler` call may still receive a complete `SessionSnapshot`, and a host
  must not write the locale fields from it.
- A resumed interview with a stated preference keeps it. Without one, it follows
  the browser languages of the device it resumes on, and the handler is called
  when the language shown differs from the stored `locale`.

Hosts serialize calls for one interview: Interviewer through its per-session
mutation chain and Fresco through a client queue (§8.4, §8.5), so the last
change the participant made is the one stored. A delayed general sync cannot
disturb that order because it never writes the locale fields.

### 8.2 Language Chooser stage

The Interview settings menu has no language control, and neither has
Interviewer's new-session form. The only participant control is the
`LanguageChooser` stage, which the protocol author places in the stage list.
It can appear anywhere, more than once.

- The schema is the base stage, including its localized `label`, and nothing
  more.
- The stage shows a built-in heading, then a `RichSelectGroup` single-selection
  list of every declared language, taken from `useProtocolLocale().options`. The
  list is alphabetical by the languages' own names, collated for the language of
  the interview's built-in interface (§8.3); the protocol's stored order has no
  effect on it. Each option is labeled with the language's own name and carries
  its own `lang` and `dir`; the `und` option is labeled "Unspecified language" in
  the interface language. The language currently shown is selected. Arrow keys move focus
  through the list, and Enter or Space chooses the focused language.
- Choosing another language calls `setLocale`. The protocol text and the
  built-in interface text switch at once, the network, prompt position, and form
  answers are untouched, and the choice is stored through the locale-change
  handler (§8.1). Leaving the preselected language unchanged states nothing, so
  the browser continues to decide.
- Architect adds the stage from the New Stage menu. Its editor lists the
  languages participants are offered, which is every declared language,
  alphabetically by name in Architect's interface language. The editor also
  manages them, with the same list and rules as the Languages page (§9.1):
  adding languages, making one the default, changing a language, and removing
  one. The default language cannot be removed until another is the default, and
  a language that holds the only translation of some text cannot be removed until
  that text is translated elsewhere. Removing a language deletes its
  translations.

### 8.3 Interface language

The built-in interface language is negotiated separately from the protocol
language:

- The Interview package supplies built-in messages in ten interface languages:
  `en`, `en-GB`, `es`, `zh-Hans`, `zh-Hant`, `de`, `nl`, `pt-BR`, `it`, and `fr`.
  The default is `en`.
- `InterviewI18nProvider` calls `resolveAppLocale` with the participant's stated
  `localePreference` as the stored choice and `requestedLocales` as the browser
  languages. A stated preference decides only when the interface has that
  language. Otherwise the first requested language the interface has wins, and
  `en` applies when none does. A stated `und` is skipped, because best fit reads
  `und` as English.
- Preferences are matched one at a time with best fit, and Chinese is matched by
  script, as in §6.2.
- The result is never stored. Each Shell owns its formatter, so one interview's
  language cannot leak into another on the same page.
- Protocol text carries the `lang` of the translation it is written in; the
  Shell root carries the interface `lang` and `dir`.

### 8.4 Interviewer (Vite SPA)

- `routes/Interview.tsx` reads the browser languages once per page load and
  passes them as `requestedLocales`. It derives `localeOptions` with
  `getLocaleMetadata` for every declared locale of the session's protocol
  immediately before launching the Shell, and passes the stored
  `localePreference` and `locale`.
- `NewSessionForm` asks for no language. A new session starts with both fields
  `null`.
- The two fields are plaintext fields of the `sessions` row. Dexie version 4
  sets both to `null` on every existing session. Field-level encryption still
  covers only the session's network and stage metadata, so the language is
  written without the vault key.
- `setSessionLocale` is the only writer. It joins the per-session mutation chain
  that `updateSession` and `markSessionFinished` use, so language changes land in
  order, and it updates the row in place so a deleted session is not recreated.
- General writes cannot overwrite the fields. `StoredSessionPatch` omits both,
  and `updateSession` re-reads the freshest row inside its write transaction and
  keeps the stored values, because another tab may have just changed them. The
  `onSync` snapshot's locale fields are never persisted.
- A read-only (review) interview discards locale changes.
- Export reads the stored `locale` into `InterviewExportInput.locale` (§11.2).

The proposal's separate `sessionLocales` table, with its revision counter, a
heal pass that creates missing records, and orphan cleanup, was not built. The
fields on the session row, and the in-transaction re-read, protect them from a
tab that replaces the whole row.

### 8.5 Fresco (Next.js)

- Prisma `Protocol` gains a required JSON `localization` column that defaults to
  `{"defaultLocale":"und","locales":["und"]}`, the declaration every migrated
  protocol carries. Protocol import persists `protocol.localization`, and the
  read layer parses it with the schema's localization schema. The additive
  migration `20261005120000_add_protocol_localization_and_interview_locale`
  adds the column and does not rewrite any stored protocol.
- Prisma `Interview` gains nullable `localePreference` and `locale` text columns.
- The interview page reads `Accept-Language` on the server with
  `getRequestedLocales` (cached per request, parsed by `parseAcceptLanguage`)
  and passes the list to the client Shell. The server render and the hydration
  therefore choose the same locale from the same list. The list is not stored.
- `mapInterviewPayload` passes the stored fields and the `localeOptions` it
  derived on the server with `getLocaleMetadata`. Client code does not derive
  display names again during hydration.
- The client persists language changes through `createProtocolLocaleChangeHandler`,
  which posts `{ locale, localePreference }` to `POST /interview/[interviewId]/locale`.
  Writes wait for the previous one to settle. The route is authorized as the sync
  route is, by the interview id, and it rejects a language the interview's
  protocol does not declare, because the endpoint is unauthenticated and the
  stored value reaches every export. It writes nothing for a finished interview
  when the deployment freezes completed interviews.
- The ordinary sync request never carries or writes the locale fields.
- Onboarding takes no language parameter. A new interview starts with both
  columns `null`.
- Export reads the stored `locale` into `InterviewExportInput.locale` (§11.2).

#### Deploy-time protocol migration

Fresco brings stored protocols up to the schema version its embedded Interview
runtime can execute, with the existing `scripts/migrate-protocols.ts`, which
`setup-database.ts` runs before the server starts. For a stored schema-7 or
schema-8 protocol this migrates to schema 9 and writes the migrated stages,
codebook, `localization`, schema version, and hash together. A row that cannot
be migrated is left in place, and its interviews refuse to start until the
protocol is repaired in Architect and uploaded again.

The proposal's cutover design was not built: there is no permanent read adapter
that runs stored schema-7/8 protocols in memory, no canonical hash alias table,
and no decoupling of the stored-protocol migration target from the runtime's
compatibility constant. A deployment therefore rewrites protocols at setup, as
it did before localization.

### 8.6 Architect preview

`PreviewPayload` carries no locale, and Architect stores no preview locale in
editor state. The preview window starts the interview with
`localePreference: null` and the author's browser languages as
`requestedLocales`, so it opens in the language a participant with that browser
would see, not in Architect's own interface language.

A "Preview language" menu above the preview lists every declared language by
its own name, alphabetically, and switches the interview to it. The choice lasts while the
preview window is open and is never saved. It passes the chosen language as the
first requested language, so the Shell keeps the step, the answers, and unsaved
input. A language stated on a Language Chooser stage moves the menu. A stored
preference outranks requested languages, so when the running interview holds
one, or the author picks `und`, the preview re-creates the interview from the
session so far with the new preference. A new payload, such as a restart,
resets the choice. Because the preview runs the Interview runtime's own
resolver, it reproduces every fallback that a warning reports. The preview
also shows what a participant with the author's own browser languages would see,
which a warning cannot, since a warning assumes a participant whose only
language is the missing one (§5.4).

Architect derives `localeOptions` for the preview with `getLocaleMetadata`, as
the other hosts do.

### 8.7 Studio protocol storage

Studio's sectioned protocol store treats `localization` as protocol-level
settings. `sectionizeProtocol` writes it into the settings section;
`SettingsSectionSchema` validates it for schema 9; and assembly, structural
diff, draft migration, and publishing round-trip it without projection or loss.
A protocol created in Studio declares `{ defaultLocale: "und", locales: ["und"] }`,
as one migrated from schema 8 does, because Studio does not yet ask which
language the researcher is writing in.

- The structural diff names an added or removed stage by its label in the
  default language, falling back to another declared language that has text
  when the default has none, and reports a localization change as a settings
  change. The order in which a protocol declares its languages decides nothing
  here.
- An audited Information stage is added with its placeholder title in every
  declared language.
- A draft branched from a version stored under an older schema is migrated to
  the current one first, because write-time validation admits only
  current-schema sections.
- The editor uses the shared editing-language provider and localized field
  controls from `@codaco/protocol-builder` (§9.2). A stage with no name in the
  editing language is listed under the name a participant would be shown
  instead, and a stage with no name in any language by its position.
- The shipped seed and demo scripts parse their sample protocol instead of
  casting it, declare US English, and edit a prompt in every declared language.
  The demo's edit, diff, and publish sequence runs under schema 9.

This is storage and current-schema compatibility, not Studio UI localization.
Studio's own message catalogs are separate work.

### 8.8 Language and direction in the DOM

- Every rendered protocol-authored string is associated with the actual
  locale returned by the resolver.
- The nearest practical text container receives `lang` and `dir`; when a
  string falls back, those attributes describe the fallback language, not the
  selected protocol locale. Text resolved in `und` carries neither, so it keeps
  the surrounding language.
- The stage container takes the direction of the translation shown. The Shell
  root keeps the interface language and direction, because built-in text is in
  the interface language and protocol text carries its own `lang`.
- The host owns the document-level `<html lang>`. The Interview package does
  not rewrite it because surrounding host chrome may remain in another
  language.
- Existing physical left/right styles and directional icons in participant
  interfaces receive an RTL audit. Only intentionally directional semantics
  mirror; graph coordinates and collected layout values do not.

## 9. Architect authoring experience

### 9.1 Languages page

Architect adds a Languages page, linked from the project navigation at
`/protocol/localization`. It supports:

- adding a language by canonical tag, chosen from a list of language names;
- choosing the default language;
- viewing each language's derived name and direction, in a list that is
  alphabetical by name in Architect's interface language (`sortByLanguageName`);
- translation coverage by language, as translated and missing counts with a
  progress bar;
- a list of missing translations that can be filtered by language; and
- relabelling the default language, which is how a protocol migrated from
  schema 8, taken to be English, is marked as the language it is written in.

Languages have no order, so the page has no way to reorder them. The default
language matters because it is the starting language when the browser lists none
of the protocol's languages and the fallback after the participant's own
languages (§6.3); no other language ranks above another. Every list of
languages is alphabetical, and the order in which the file happens to store them
has no effect on what participants see.

A new protocol asks which language it is written in and declares exactly that
language. A protocol migrated from schema 8 declares English (`en`). Architect
has no mode for `und`: a protocol made in Studio declares it, but stays in
Studio.

The Language Chooser stage editor (§8.2) shows the same list of languages and
manages them with the same operations and refusals as this page: adding,
making one the default, relabelling the default, and removing one.

Adding a language writes only the declaration. It deliberately does not clone
default strings, so the protocol remains valid and warnings appear immediately.

Removing a language is an atomic destructive edit. Architect shows how many
translations will be removed, asks for confirmation, removes that key from every
localized string, and updates the declaration. It is refused for the default
until another default is chosen, and refused if it would leave any localized
string with no translation.

Relabelling the default language canonicalizes the new tag and atomically
moves the default's declaration entry, `defaultLocale` and every matching
localized-string key (found with `collectLocalizedStrings`) to it. A collision
with an existing language is refused rather than merged, since a text
translated into both would lose a translation; choosing another existing
language as the default is `setDefaultLocale`'s job.

Every language operation (`addLocales`, `removeLocale`, `setDefaultLocale`,
`relabelDefaultLocale`) is a single draft edit: one undo step, and nothing
is written when any part is refused. A refusal names its reason: `invalid-tag`,
`already-declared`, `not-declared`, `default-locale`, or `would-empty`.

### 9.2 Localized fields

`@codaco/protocol-builder` provides the localized fields, so Architect's stage
editors and Studio's editor share them. A `LocalizedStringField` shows one
language at a time, preserves the full translation map on edits, and marks a
missing translation without making the form invalid.

- The researcher reads and types plain text. The field stores it as the literal
  message the schema holds (§5.3), so message syntax is never shown.
- Blank text, empty or only whitespace, removes that translation. Removing the
  last one leaves the field absent, which a required field then refuses.
  Optional fields can therefore be removed entirely.
- One editing language is shared by every localized field and preview in the
  editor, so a researcher translating a stage works through it in one language.
  It starts at the default language, and falls back to the default if its
  language is removed while selected.
- Each field draws a language menu with its control. A protocol with one
  language draws nothing. The menu marks the languages the field still lacks,
  and a note below the control tells the researcher what a participant sees
  instead: "Not translated into {language} yet. Participants using {language}
  will see the {fallback} text", with ", unless their browser also lists a
  language that has it" added when another browser language could change the
  result. The note reads the resolver's report of how the translation was found
  (§6.3), so it matches what the Interview shows. The language menu itself lists
  the protocol's languages alphabetically by name in Architect's interface
  language.
- The control is drawn inside the translation's own `lang` and `dir`, and
  remounted per language, so an editor holding one language's document never
  writes it into another's.

Node type and edge type labels are edited with Architect's `LabelField` on the
Codebook page. The field opens in the default language and requires text in at
least one language; the default language and every other language may be left
untranslated, with a warning. An attribute's label is edited on
the same page as plain text, with no language menu, and never counts as a
missing translation. The label of each attribute a Narrative preset highlights
is a localized field in the preset dialog of the Narrative stage editor.

A Network Composer field's caption is a required localized field in the
field dialog of the Network Composer stage editor. Choosing the field's
attribute fills the caption with the attribute's name in the default language,
escaped so that markdown shows it as written. A later choice replaces a caption
that is still empty or still the previous attribute's name, and keeps one the
researcher has written.

Coverage warnings are owned by the actual field when editing that field. Global
aggregation is added to `selectors/issues.ts`, whose existing contract already
represents valid-but-probably-unintended protocol issues
(`getLocalizationCoverage`, `getMissingTranslationGroups`,
`getHasMissingTranslations`, and `getHasUnspecifiedLanguage`). The Languages
page and project navigation summarize warnings, and they do not duplicate
field-owned validation errors.

### 9.3 Warning UX

Warnings are grouped to avoid presenting thousands of flat messages:

- language summary: translated count, missing count, and a progress bar;
- grouping: missing translations are grouped by the stage or codebook entry that
  holds them, with the protocol and the ego as further groups, each linking to
  where it is edited;
- field detail: the path within the group and each missing language, opening a
  translation dialog that lists the languages and shows what participants see
  for each. For a language with no translation the note reads "Not translated
  yet. Shown in {language}." when the text is shown in a closely related
  language, which no other browser language can change, and otherwise adds
  "unless the participant's browser also lists a language that has it"; and
- unspecified language: when the protocol still declares `und`, the Languages
  page and an alert ask the researcher to identify the language, and the project
  navigation tab carries a warning for screen readers.

Download/export remains allowed with warnings. Architect should require only
normal schema validity, not complete translation coverage.

### 9.4 Printed summary

The printable protocol summary has a "Summary language" menu, shown when the
protocol declares more than one language. It prints the protocol's text in the
chosen language, and falls back to the default if the chosen language is removed.

## 10. Schema 8 to schema 9 migration

### 10.1 Automatic, lossless rule

The migration cannot know the language of arbitrary schema-8 text. It must not
guess English from the product's history or the device locale. It therefore:

1. adds `localization: { defaultLocale: "und", locales: ["und"] }`;
2. wraps every participant-facing schema-8 string as `{ "und": message }`, where
   `message` is the old text escaped as an ICU literal message;
3. leaves out an empty optional field where schema 9 requires non-empty text,
   preserves an empty value where the schema-8 field accepted it as data, and
   wraps an empty required field so that validation reports what schema 8
   already rejected;
4. adds a `label` to every node type and edge type from the existing stable
   `name` as `{ "und": name }`, and to every variable, including ego variables,
   as the plain `name`, using the codebook key when the name is missing or
   empty;
5. turns each id in a Narrative preset's `highlight` list into
   `{ variable, label }`, the label being `{ "und": name }` from the variable's
   name on the stage subject's node type, or the id when that name is missing
   or empty, since schema 8 showed the name in the preset switcher;
6. gives a Network Composer form field with a missing or empty `label` one
   taken from its attribute's name on the stage's node type or the edge's
   type, or the variable id when that name is missing or empty, escaped as
   markdown that shows it as written and wrapped as `{ "und": message }`, since
   schema 8 showed the attribute's name there;
7. drops a Network Composer scale end label that is not a string, because the
   interview only ever rendered string labels there;
8. keeps existing attribute names exactly as they are, because schema 9 also
   allows names in any script;
9. preserves option values, ids, references, stage count and order, codebook
   keys, and collected answer shapes; and
10. records two migration notes: what the new version allows in attribute
    names, and that the text was taken to be English, so the researcher
    should check the default language and relabel it in Architect if needed.

This obeys the migration invariants already documented in the migration
chain: stages are not added, removed, or reordered, and collected values do
not change shape.

The migration finds participant-facing strings by walking the schema-9 Zod
metadata, so it shares one inventory with validation and the warning analyser.

Known English first-party protocols and templates are authored directly as
schema 9 in their canonical sources with `en-US`, rather than being committed as
`und`: the bundled templates, the sample protocol, the development protocol, and
the end-to-end protocols. The development protocol is also translated into
Spanish (`es`) and opens with a Language Chooser stage. The documentation
downloads are not converted; they keep their original schema versions and
migrate on open. Third-party and stored schema-8 documents use the honest
automatic migration.

### 10.2 Migration plumbing activated by version 9

- Schema 9 has its own version-isolated tree. `CURRENT_SCHEMA_VERSION` is `9`,
  and a single registered v8-to-v9 migration carries both the localization and
  the unrestricted attribute-name changes.
- `migrateProtocol` post-validates against the requested target schema, not
  always `CurrentProtocolSchema`, and checks that the result's `schemaVersion`
  equals the target. It accepts only a target it can validate (7, 8, or 9).
- `ProtocolMigrator` keeps one cached result per target version for each
  caller `cacheKey`, so reusing one key for targets 8 and 9 produces two
  correctly typed and post-validated results. `clearCache(key)` clears every
  target-version variant of that key.
- `detectSchemaVersion` throws `VersionMismatchError` for a document newer than
  `CURRENT_SCHEMA_VERSION`, so a host reports a newer protocol as such.
- Interviewer's launch migration recomputes the hash and repoints sessions as it
  did before. Language lives on the session row (§8.4), so the migration has no
  language record to create.
- Fresco's additive database migration initializes the protocol `localization`
  column to the `und` declaration, and its deploy-time protocol migration
  rewrites stored schema-7/8 protocols to schema 9 (§8.5).
- Studio's draft migration and section round trip add and retain localization
  in the settings section (§8.7).
- Architect library-open and import migrations show the new migration notes.

## 11. Identity, exports, and compatibility

### 11.1 Protocol hash

`hashProtocol` takes the protocol's `schemaVersion`. For schema 9 and later it
hashes `{ localization, codebook, stages }`; for schema 8 and earlier it hashes
`{ codebook, stages }`, so stored hashes of older protocols are unchanged. The
version decides the path, not the presence of a `localization` property, which a
loosely validated older document could carry without meaning anything. Localized
maps already live inside the codebook and stages; including the root declaration
additionally makes default-locale changes identity-bearing. Languages have no
order, so `hashProtocol` sorts the declared languages before hashing: two
protocols that differ only in the order they list their languages share a
hash. Protocol name, description, assets, experiments,
and last-modified metadata remain excluded.

### 11.2 Data export

The language last shown is research metadata. `InterviewExportInput` gains
`locale: string | null`, a BCP 47 tag (`und` for a protocol whose language is
unspecified), or `null` when the host has not recorded one. Both hosts pass the
session's stored `locale`.

- `@codaco/shared-consts` names the session field `interviewLocale` and the
  printed CSV column `networkCanvasInterviewLocale`.
- The CSV ego file prints `networkCanvasInterviewLocale`, with an empty cell for
  `null`. GraphML writes `nc:interviewLocale` as graph (session) metadata,
  outside entity-variable keys, and leaves it out for `null`.
- The CSV ego-list formatter keeps session metadata and ego attributes in
  separate records, and never merges the locale into the ego attribute object.
  Only the printed name is reserved: a schema-8 protocol's variable named
  `interviewLocale` is exported unchanged.
- `networkCanvasInterviewLocale` is a reserved CSV ego column, like the other
  session columns. A variable whose column would print under a reserved name
  keeps its answers and is written as `<name>_2`, or the first of `_3`, `_4`,
  and so on that no other column has, with a `column-renamed` export warning. The
  built-in column keeps its name. This is the one general allocator for every
  reserved CSV column. At authoring time `findExportColumnConflicts` refuses a
  new variable name that would collide.

Other export column names and entity attribute names continue to use stable
codebook `name`, never translated labels, so choosing another interview
language does not change analysis schema.

### 11.3 Compatibility boundary

- Current Architect, Interviewer, Fresco, and Studio move to schema 9 together
  through their existing compatibility constants, storage boundaries, and
  migration mechanisms.
- Schema-8 modern app versions reject schema 9 as forward-incompatible rather
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
- Locale maps are read only after schema validation, with own-property checks.
  Invalid keys such as object-prototype names are not canonical locale tags and
  are rejected. A codebook id of `__proto__` is refused by `migrateProtocol` at
  every schema version, before any schema parses the document, because a Zod
  record would otherwise drop that entry unseen.
- A message that does not parse as ICU, or that contains a placeholder or
  formatting, is a validation error, so the runtime only formats literal text.
- Locale removal and relabelling the default language are atomic protocol
  edits with collision checks.
- Language changes are validated where they could otherwise corrupt data. The
  Shell refuses a language the protocol does not declare, and Fresco's
  unauthenticated locale endpoint rejects one before it can enter persistence or
  exports.
- Host compatibility boundaries distinguish session sync from language-change
  intent: general sync never writes the locale fields. Interviewer's write
  re-reads the freshest row inside its transaction and keeps the stored locale
  fields, so a general write from another tab cannot reset a selection.
- A Fresco protocol that cannot be migrated at deploy time is left in place, and
  its interviews refuse to start rather than run incorrectly.
- Roster details and CSV export metadata retain stable identities instead of
  using translated or potentially colliding display labels as object keys.
- The runtime never fetches translations and cannot fail because a network
  translation service is unavailable.
- The warning analyser is deterministic and memoizable; it performs no I/O.

## 13. Verification requirements

### 13.1 Protocol-validation

- Canonical and invalid locale tags, aliases, casing, duplicates, `und`, and
  language/region coexistence.
- Localization declaration default membership. The order of `locales` is not
  checked and decides nothing.
- Empty maps, required-field empty translations, undeclared keys, and
  at-least-one-key enforcement at every tagged schema site.
- ICU literal-only messages: placeholders, plural and select, and unparsable
  text are refused; `escapeMessageText` and `messageText` round-trip every
  string, including braces and apostrophes; markup stays literal.
- Network Composer Visual Analog Scale endpoint overrides are collected,
  validated, warned, and migrated separately from codebook scalar endpoint
  labels despite the loose parameter record.
- Missing translations, in the default language or any other, remain
  schema-valid, produce exact warning paths, and report the fallback produced
  when the missing warning locale is the participant's only language. A string
  with a translation in any one language is valid without the default's.
- FormatJS best-fit matching, related variants, preferences matched one at a
  time (`es-MX, en` selects declared `es`), Chinese matched by script, a stated
  value that is malformed or unmatched selecting the protocol default without
  consulting lower-priority preferences, invalid preferences, and empty
  preference lists.
- Per-string resolution through the participant's languages: the first language
  (exactly or by a related language, including `pt-PT` to `pt-BR`, `es-MX` to
  `es`, `zh-TW` to `zh-Hant` and Swiss German to `de`), each later language in
  order, the protocol default, then any language with the text; the report of
  how the translation was found for each step; and a result that does not depend
  on the order of `localization.locales` or of a string's keys.
- `sortByLanguageName` orders names with the collation of the display language,
  and gives the same order whatever order the input arrives in.
- `Accept-Language` quality ordering, stable ties, duplicates, wildcards, and
  malformed values.
- Direction and display-name feature fallbacks.
- Locale-resolved disease label collisions.
- v8-to-v9 migration purity, notes, invariants, and exact target-version
  post-validation.
- Migration gives variables a plain label and turns each Narrative highlight
  id into `{ variable, label }`, labelled from the variable's name or its id.
- Migrator caching separates the same caller key by target version and clears
  every target variant predictably.
- Hash changes for translations and default locale, but not for the order of
  the declared languages, derived labels, or direction, and a schema-8 hash is
  unchanged.

### 13.2 Interview runtime

- Every localized field family renders selected and fallback translations,
  including stage labels in the participant Stages menu and Narrative
  Pedigree snapshot title.
- Network Composer Visual Analog Scale override endpoints resolve through the
  typed component branch rather than the former string-only runtime checks.
- Fresco UI form labels, hints, option labels, and endpoint labels receive the
  resolved `PresentationalText`; string extraction cannot discard source
  `lang`/`dir` on the visible leaf or native option.
- Name Generator Roster renders two distinct detail rows when stable
  properties resolve to the same translated label, retaining each value and
  each label's actual source locale.
- Information and Family Pedigree media controls use resolved item
  descriptions for alt/accessibility labels and never expose asset metadata
  names as participant fallback copy.
- DOM `lang`/`dir` reflects the actual resolved locale, and the stage takes the
  direction of the translation shown while the Shell keeps the interface
  language.
- The Language Chooser lists every declared language by its own name,
  alphabetically for the interface language and whatever order the host passed
  `localeOptions` in, selects the current one, switches the whole interview on a
  choice, and states nothing when the preselected language is left unchanged.
  The Shell throws when the set of `localeOptions` languages differs from the
  declaration, but not when only their order does.
- A text the language shown lacks appears in another of the browser's languages
  that has it, before the protocol default, and in any language that has it
  when neither applies.
- Locale changes re-render without resetting network, prompt position, stage
  position, or form answers, and reach the host through the locale-change
  handler once per change and in order, never through general sync.
- Interface language negotiation: a stated preference decides only when the
  interface has it, a stated `und` is skipped, and preferences are matched one
  at a time.
- Chromium, Firefox, and WebKit interface-matrix scenarios cover the built-in
  language following the browser's languages, an incomplete translation with
  fallback, and an RTL locale.
- Tests prove semantic comparisons use option values and ids, not labels.
- The Narrative preset switcher lists each highlighted attribute by its
  highlight's resolved label.

### 13.3 Architect and the protocol builder

- Add, change-default, remove, and change-language flows, from the Languages
  page and from the Language Chooser stage editor, including updating
  `defaultLocale` when its tag is changed and atomic refusal, with nothing
  written, on invalid edits. No control reorders languages, and every list of
  languages is alphabetical.
- The field notes and the translation dialog state what participants see:
  the fallback language, and the "unless the participant's browser also lists a
  language that has it" wording only when the browser could change the result.
- Each language operation is a single undo step.
- Incomplete localized strings save successfully and appear as warnings.
- Undeclared keys and empty localized strings fail loudly.
- Coverage aggregation, grouping, language filter, and navigation to the field.
- Relabelling the default language.
- A blank translation removes that translation; a required field refuses a
  string with none.
- The shared editing language moves every localized field together and falls
  back to the default when its language is removed.
- Preview opens in the browser's language, the Preview language menu switches the
  running interview without resetting it, and the choice is not saved.
- The printed summary renders in each declared language.
- An attribute label saves as plain text and is never listed as a missing
  translation. A newly highlighted Narrative attribute starts with its name as
  its label, and an empty highlight label is refused.

### 13.4 Hosts and exports

- Interviewer: browser-language selection, the stated preference, the Dexie
  version-4 upgrade, `setSessionLocale` ordering through the per-session chain,
  and a general write from another tab that cannot reset the stored fields.
- Fresco: protocol localization persistence on import and read, the
  `Accept-Language` list passed to the Shell, payload serialization with
  `localeOptions`, the locale route (undeclared values rejected, frozen
  interviews unchanged), a sync request that never carries the locale fields,
  and hydration parity. A server/client test supplies different mocked
  `Intl.DisplayNames` results and proves the serialized server `localeOptions`
  keep initial markup identical.
- Fresco's deploy-time migration brings stored schema-7/8 protocols to schema 9
  with the `und` declaration and the new hash, and leaves a row it cannot
  migrate in place.
- Studio settings-section validation plus sectionize, assemble, diff, migrate,
  and publish round-trip of the root declaration, plus a successful schema-9
  `protocol-demo` edit, diff, and publish run.
- Exported locale in CSV and GraphML while stable field names remain unchanged,
  an empty CSV cell and no GraphML attribute for `null`, and a CSV fixture
  containing ego variables named `interviewLocale` and
  `networkCanvasInterviewLocale` that retains every answer and emits the locale
  metadata under its own header.
- Full migration and validation of bundled protocols, public documentation
  protocols, E2E fixtures, and the private compatibility corpus. The
  documentation downloads, which span schema versions 1 through 7, continue to
  exercise the full migration chain.

### 13.5 Visual and accessibility review

- Locale selectors, warning states, long translations, and RTL protocol
  content receive Storybook/Chromatic and affected Playwright coverage.
- Every intentional PNG baseline change is generated and inspected under the
  repository's pinned workflow before adoption.
- Keyboard operation, screen-reader names, focus order, zoom, and text
  expansion are checked for the new field and language controls.

## 14. Release and documentation

- The active documentation downloads are not converted to schema 9. They stay
  byte-for-byte as researchers downloaded them, and
  `documentation-corpus-migration.test.ts` reads them from
  `packages/protocols/documentation/protocols` and migrates each to the current
  schema. They remain the repository's only token-free corpus of real
  schema-1-through-7 documents.
- `CurrentProtocol`'s string-to-map changes are a breaking protocol-validation
  release.
- Normal-lane changesets cover the coordinated release:
  `protocol-validation-schema-9`, `protocol-localization` (Interview, Architect,
  Interviewer, and Fresco), `fresco-ui-presentational-text`,
  `protocol-utilities-localization`, `shared-consts-interview-locale-column`,
  `network-exporters-interview-locale`, and `bundled-protocols-schema-9`
  (`@codaco/development-protocol` and `@codaco/sample-protocol`). Shared-consts
  must publish the new session-locale export consumed by the externally bundled
  exporter. Both compatibility packages must be versioned and published with
  their schema-9 `protocol.json` content.
- A separate Studio-lane changeset, `studio-protocol-localization`, covers the
  affected Studio packages and is not mixed with the normal lane. Separately
  gated Documentation work has its own changeset,
  `documentation-protocol-localization`, in its own release lane.
- The documentation lane covers translated protocols, the Language Chooser,
  the schema-9 migration notes, the new interview-language export column, and
  how an interview's language follows the participant's browser.
- Document that the built-in Interview interface is available in ten languages
  that are chosen independently of the protocol's languages.
- Update protocol authoring documentation and generated schema/API references.

## 15. Standards and implementation references

- Browser language preference ordering: [MDN `navigator.languages`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/languages)
- ECMA-402 internationalization algorithms: [ECMAScript Internationalization API](https://tc39.es/ecma402/)
- Selected matcher implementation: [FormatJS `intl-localematcher`](https://formatjs.github.io/docs/polyfills/intl-localematcher/)
- Literal message syntax and formatting: [FormatJS ICU message syntax](https://formatjs.github.io/docs/core-concepts/icu-syntax/)
- Derived locale names: [MDN `Intl.DisplayNames`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames)
- Derived text direction: [MDN `Intl.Locale.prototype.getTextInfo()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/getTextInfo)
- DOM direction semantics: [MDN `dir` global attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/dir)
