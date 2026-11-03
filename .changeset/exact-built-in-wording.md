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
closing screen, only into a language it has that wording in exactly. Adding
Mexican Spanish to a protocol no longer fills it with Spanish wording, and a
default language Network Canvas has no wording in no longer gets English
wording recorded as that language.

- `suppliedTextFor` matches a language exactly. `SUPPLIED_LANGUAGES` lists the
  languages Network Canvas has wording in, `hasSuppliedWording(locale)` says
  whether a language is one of them, and `suppliedBaseLanguage(locale)` gives
  the one a regional variant belongs to (es-MX to es, zh-TW to zh-Hant).
- Built-in wording may hold no text while a protocol is being written. A
  protocol leaving its editor (`validateProtocol` without `draft`) must hold it
  in its default language: each text without it is a
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
- The Sample Protocol, the templates and the development protocol are written
  in English (`en`) rather than American English, so stages added to them
  start with Network Canvas's wording.
