---
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': patch
'@codaco/architect': patch
---

Network Canvas now writes its built-in wording, such as button labels and the
closing screen, only into a language it has that wording in exactly. Adding
Mexican Spanish to a protocol no longer fills it with Spanish wording on its
own.

- `suppliedTextFor` matches a language exactly. `SUPPLIED_LANGUAGES` lists the
  languages Network Canvas has wording in, and `suppliedBaseLanguage(locale)`
  gives the one a regional variant could start from (es-MX from es, zh-TW from
  zh-Hant).
- A schema 9 protocol may record, in the optional `localization.startFrom`,
  that a language starts from its base language's wording (`{ "es-MX": "es" }`).
  The schema accepts only a declared language and its own base language.
  Every supplier of built-in wording reads it through `suppliedLanguageOf`, so
  stages and features added later get the base language's wording in that
  language too.
- `defaultFinishSessionFields` now takes the localization declaration rather
  than a list of languages.
- When a researcher adds a regional variant of a language Network Canvas has
  wording in, Architect asks whether to start from a copy of the base
  language's wording, which they then adapt before use, and records the
  answer in the protocol. Relabelling a language within its family, such as
  es to es-MX, keeps the wording it already had.
