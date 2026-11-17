---
'@codaco/interview': minor
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': patch
'@codaco/app-i18n': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

The wording Network Canvas supplies for a schema 9 protocol is now the
interview's own. Each text a protocol may reword is one of the interview's
messages, written in English in the interview's source, with one catalogue
per language, English included, in `packages/interview/src/locales/wording`.
Nothing a participant reads changes.

For developers:

- `@codaco/interview/supplied-wording` is where a tool reads that wording. It
  gives the functions that show, compare or remove it, bound to the
  interview's catalogues: `stageWordingShown`, `stageWithSuppliedText`,
  `stageWithoutSuppliedText`, `suppliedStageText`, `interfaceTextShown`,
  `interfaceTextShownBy`, `interfaceTextAsShown`, `suppliedInterfaceText`,
  `withInterfaceText`, `interfaceTextWithUpdates`, `withSuppliedWording`,
  `withoutSuppliedWording`, `suppliedWordingIn` and
  `familyPedigreeWordingIn`. It also exports the catalogues themselves
  (`SUPPLIED_WORDING`). The module loads in Node as it is.
- `@codaco/protocol-validation` no longer holds any of the wording. It keeps
  what the schema fixes: which texts Network Canvas words (`SUPPLIED_TEXTS`,
  each naming the interview message that words it), the arguments each must
  show, when a protocol shows each one, and the languages
  (`SUPPLIED_LANGUAGES`). `suppliedWordingFrom(catalogues)` gives the
  functions above for a set of catalogues. Validation needs no catalogue: it
  asks only whether a text has words in a language, which the schema version
  decides.
- Without a catalogue, `withoutUnshownWording(protocol)`,
  `withoutUnshownInterfaceText(protocol)` and
  `stageWithoutUnshownWording(stage)` remove the wording a protocol holds for
  text it does not show. The schema 8 migration uses the first: it still
  writes none of Network Canvas's wording, and a document that already holds
  a copy of it keeps the copy until a tool with the interview's catalogue next
  stores the protocol.
- `SyntheticInterview` writes a stand-in naming each text, in place of
  Network Canvas's English, for a fixture whose default language Network
  Canvas has no wording in.
- `stampTranslationSources` in `@codaco/app-i18n/catalog-guards` takes the
  path of the extracted English, for a package that keeps its translations in
  another folder.
