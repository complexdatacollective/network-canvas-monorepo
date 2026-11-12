---
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': patch
'@codaco/architect': minor
'@codaco/interviewer': patch
'fresco': patch
---

A protocol whose default language is one Network Canvas has no wording of its
own in, such as Swahili or Mexican Spanish, now names a fallback language: the
language participants see text in when a later update adds that text to the
interview and the protocol has no translation of it.

- **Architect.** The Languages page shows a Fallback language list while the
  default language needs one. It offers every language Network Canvas has
  wording in, whether or not the protocol uses it. Nothing is chosen for you,
  and the protocol can't be downloaded until you choose. Making a language
  Network Canvas has wording in the default removes the choice.
- **Interviewer and Fresco.** A protocol that needs a fallback language and
  names none is refused on import, with a message saying so.
- **Protocols (`@codaco/protocol-validation`).** `localization` gains an
  optional `fallbackLocale`. It must be one of `SUPPLIED_LANGUAGES`, and it is
  refused when the default language is one Network Canvas has wording in.
  A protocol being written may lack the one it needs; one handed over may not
  (`FALLBACK_LANGUAGE_MISSING`). `needsFallbackLanguage`,
  `isFallbackLanguageChoice`, `findMissingFallbackLanguage` and
  `withFallbackLanguage` state the rule for tools that edit a protocol's
  languages. A protocol's hash is unchanged unless it names one.
- **`SyntheticInterview` (`@codaco/protocol-utilities`).** `setLocalization`
  accepts a `fallbackLocale`.
