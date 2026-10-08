---
'@codaco/protocol-validation': major
---

Adds protocol schema 9, in which attribute (variable) names can use any
script, spaces and punctuation, and every string a participant reads can be
translated into several languages.

**Breaking:**

- `CURRENT_SCHEMA_VERSION` is now `9`, and `CurrentProtocolSchema` and
  `CurrentProtocol` describe schema 9. `migrateProtocol` and
  `protocolMigrator.migrate` called without a target version now produce
  schema 9 documents. A host that stores or runs protocols must accept
  schema 9; the matching `@codaco/interview` major runs it.
- `migrateProtocol(document, targetVersion, dependencies)` accepts only a
  target it can validate (7, 8 or 9), and its return type follows the target:
  `Protocol<V>` for an explicit target, `CurrentProtocol` without one. The
  result is validated against the target version's own schema, so a migration
  to 8 refuses names only schema 9 allows. `ProtocolMigrator`'s `migrate` has
  the same overloads, and it now caches one result per target version for each
  key, so asking for a second version no longer discards the first.
  `clearCache(key)` drops all of them.
- `detectSchemaVersion` throws `VersionMismatchError` for a document newer
  than `CURRENT_SCHEMA_VERSION`, instead of `SchemaVersionDetectionError`, so
  `getProtocolFileErrorKind` reports it as `'newerVersion'`.
- A codebook ID of `__proto__` is refused. `validateProtocol` and
  `migrateProtocol` look for it in the document as it was read, before a
  schema parse can drop the key, so pass them the raw document.
  `validateProtocol` now takes `unknown`.
- Participant-facing text in a schema 9 protocol is a `LocalizedString`, not a
  `string` (see Localization below), so code that reads a stage's `label`, a
  prompt's `text`, an option's `label` and so on must resolve it first, for
  example with `resolveLocalizedString`.
- `hashProtocol` takes the protocol's `schemaVersion`, and from schema 9 its
  `localization` too. A schema 9 hash covers `{ localization, codebook,
stages }`, so a translation change produces a new hash. Languages have no
  order, so `hashProtocol` sorts them before hashing: two protocols that differ
  only in the order they list their languages have the same hash. Hashes of
  schema 8 and earlier protocols are unchanged.

Schema 9:

- The v8 to v9 migration keeps existing names as they are. It records the
  protocol's text as English, since older protocols never recorded a language:
  it adds `localization: { defaultLocale: 'en', locales: ['en'] }` and wraps
  every participant-facing string as `{ en: <text> }`, escaped as an ICU literal
  message. Validation refuses the undetermined language `und` (and `und-*`
  tags) as a declared language, as the default, and as a localized-string key. Codebook node types, edge types and variables get a `label` taken
  from their name, or from their codebook ID when the name is empty: a node
  or edge type's label is wrapped like any other text, and a variable's stays
  plain text. A Narrative preset's `highlight` list of variable IDs becomes a
  list of `{ variable, label }`, each label taken from the variable's name (or
  its ID) and wrapped as `{ en: <text> }`. A form field with no caption, or an
  empty or blank one (a Network Composer field's `label`, or any other form
  field's `prompt`), gets its attribute's name (or its ID) as one, escaped so
  that markdown shows it as written, and wrapped the same way. An empty
  optional text that schema 9 requires to be non-empty is removed, as are
  Network Composer scale end labels that were not strings. Its migration notes
  tell researchers what the new version allows, that the text is recorded as
  English, so they should confirm the default language and change it in
  Architect if the protocol is written in another one, and which empty
  questions were filled in.

- Schema 8 still refuses names outside `a-z`, `A-Z`, digits and `. _ - :`, with
  a message that says so. `VersionlessProtocolSchema`, the version 8 body
  without its `schemaVersion`, is now exported.
- The v3 to v4 migration no longer strips characters outside `[a-zA-Z0-9._:-]`
  from type names, variable names and option values. It turns tabs and line
  breaks into spaces, removes other control characters, trims the result, and
  falls back to the record's ID when nothing is left. Filter, skip logic and
  panel rules that refer to an option value it changed are updated to match.
  A migration to schema 7 or 8 still applies the old rule, which those schemas
  enforce: each migration step now receives the target version as a third
  argument to `migrate`.

Localization:

- A schema 9 protocol declares its languages in a required
  `localization: { defaultLocale, locales }` block of BCP 47 tags. Every string
  a participant reads (stage labels, prompts, panel titles, form captions and
  hints, option labels, Information items, census and pedigree copy) is a
  `LocalizedString`: a record from a declared locale tag to that language's
  text. Markdown fields hold markdown in each language.
- A localized string needs a translation in at least one declared language, not
  in every language and not necessarily in the default one. A missing
  translation, in the default language or any other, is a warning from
  `analyzeProtocolLocalization` and never a validation error. The order of
  `locales` has no meaning, so nothing reads it.
- Each value is an ICU MessageFormat message. For now a message may only be
  literal text: arguments, `plural`, `select`, number and date formats are
  refused, and markup is read as literal text. `escapeMessageText` turns plain
  text into such a message (escaping `{`, `}` and quoting apostrophes) and
  `messageText` turns it back, so an editor can show and save plain text.
- Codebook node types and edge types have a required localized `label`, which
  participants see, beside the `name` that exports and rules use. Codebook
  variables have a required `label` too, a non-empty plain string that is not
  translated.
- A Narrative preset's optional `highlight` is a list of
  `{ variable, label }`, where `label` is the localized text the preset
  switcher shows participants for that attribute.
- A new `LanguageChooser` stage lets the participant choose among the
  protocol's languages.
- Disease labels in a Narrative Pedigree stage must be unique in every
  declared language.
- New exports: the `LocalizedString`, `LocalizedStringFormat`, `LocaleTag`,
  `LocalizationDeclaration`, `LocaleMetadata`, `ResolvedLocalizedString`,
  `ProtocolLocalizationWarning` and `LocalizedStringHit` types;
  `resolveLocalizedString` (takes the participant's languages in order of
  preference, the first being the language shown, and picks the best available
  translation: the first language or its closest related language, then each
  other language in turn, then the protocol's default language, then any
  language that has the text; it reports the language it found and how it found
  it);
  `selectProtocolLocale` and `normalizeLocalePreferences` (choose a protocol
  language from a list of preferences, in order, matching Chinese by script);
  `sortByLanguageName` (sorts any list of languages alphabetically by name,
  collated for the language its reader uses); `canonicalizeLocale`;
  `getLocaleMetadata` (a language's own name and text direction, with CLDR's
  English name and autonym standing in where the JavaScript runtime has no name
  for the language); `analyzeProtocolLocalization` (missing translations);
  `collectLocalizedStrings`; `escapeMessageText` and `messageText`;
  `escapeMarkdownText` (turns plain text into markdown that shows it as
  written).
- A Network Composer form field is now a union on `component`, so its scale
  end labels are localized fields of their own. Its `label`, the caption
  participants read, is required and not blank, since the attribute's own
  label is not translated.
- A form field's `prompt` is held to the same rule: every translation must
  contain text, so a translation of only spaces (or of invisible characters
  such as a zero-width space) is invalid, and one blank translation is an
  error rather than a gap the interview falls back over. A prompt is judged as
  written, so markdown that draws nothing from visible characters, such as
  `**` or `&nbsp;`, is not recognised as blank. New exports: `isBlankText` and
  `isBlankMessage`.

Participant data files (rosters):

- `validateNames` and the new `isUsableExternalAttributeName` accept any name
  the codebook allows once it is in NFC.
- `readRosterCsv(text)` reads a CSV roster the way an interview loads it, and
  keeps a column called `__proto__` or `constructor`, or one whose name
  contains a dot, exactly as written. The package now depends on `csvtojson`.
- `findRosterCharacterProblems(text, format)` finds characters XML 1.0 can't
  carry in a CSV or JSON roster, placed by column, row and cell, node and
  attribute, or line, so a host can refuse the file before it reaches an
  interview. Its types are `RosterCharacterProblem`, `RosterCharacterReport`
  and `RosterFormat`.
