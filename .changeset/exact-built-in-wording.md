---
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': patch
'@codaco/interview': patch
'@codaco/interviewer': patch
fresco: patch
'@codaco/architect': patch
'@codaco/development-protocol': patch
---

Network Canvas now writes its built-in wording, such as button labels and the
closing screen, only into a language it has that wording in. Adding
Mexican Spanish to a protocol no longer fills it with Spanish wording, and a
default language Network Canvas has no wording in no longer gets English
wording recorded as that language.

- `suppliedTextFor` matches the same language only. `SUPPLIED_LANGUAGES` lists
  the languages Network Canvas has wording in, and each is written for the
  region CLDR assumes for it (its English is American English, its Spanish is
  Spain's, its Traditional Chinese is Taiwan's), so `en-US`, `es-ES`, `zh-TW`
  and `pt` count as `en`, `es`, `zh-Hant` and `pt-BR`.
  `hasSuppliedWording(locale)` says whether a language is one of them, and
  `suppliedBaseLanguage(locale)` gives the one a variant for another region
  belongs to (es-MX to es, en-GB to en, zh-HK to zh-Hant).
- Built-in wording may hold no text while a protocol is being written. A
  protocol leaving its editor (`validateProtocol` without `draft`) must have
  words in its default language for every built-in text it shows, counting
  Network Canvas's own wording for that language: each text without them is a
  `BUILT_IN_WORDING_MISSING` issue (`findBuiltInWordingProblems`). The check
  that a text has at least one translation now runs over the whole protocol and
  leaves built-in wording out.
- `defaultFinishSessionFields` takes the localization declaration rather than
  a list of languages.
- The interview no longer formats a language without built-in wording with
  English plural rules, and shows the catalog wording for interface text that
  holds no translation at all.
- When a researcher adds a regional variant of a language Network Canvas has
  wording in, or creates a protocol in one, Architect asks whether to also add
  that language. It holds Network Canvas's wording, which participants using
  the variant then see wherever it has no text of its own; it is never made the
  default. While the default language has no built-in wording, the stage list
  says so, links to the wording to translate, and the protocol can't be
  downloaded.
- While the default language has no built-in wording, a stage editor's
  "Customize built-in wording" section is always shown, with no switch:
  there is no Network Canvas wording to put back, and the researcher writes
  it.
- The Sample Protocol, the templates and the development protocol are tagged
  English (`en`) rather than American English (`en-US`).
