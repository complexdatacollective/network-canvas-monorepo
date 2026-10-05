---
'@codaco/protocol-utilities': major
---

`SyntheticInterview` builds localized schema 9 protocols.

- A built protocol declares `localization: { defaultLocale: 'en-US', locales:
['en-US'] }`. Call `setLocalization({ defaultLocale, locales })` to declare
  other languages.
- Every builder option that holds participant-facing text (stage labels,
  prompts, form prompts and hints, option labels, Information items, panel
  titles and so on, including a family pedigree stage's `nodeConfig.form`) takes
  a `TextInput`: a plain string, which is escaped into an ICU literal message
  in the default language, or a `LocalizedString` locale map, which is used as
  written.
- Codebook node types, edge types and variables get a `label`, taken from
  their name unless you pass one.
- `addStage('LanguageChooser', { introduction })` adds a language chooser
  stage, with an optional introduction.

**Breaking:** the text in a built protocol is a `LocalizedString`, not a
`string`, so code that reads a built stage's `label`, a prompt's `text` or an
option's `label` must read the locale it wants, for example
`label['en-US']`.
