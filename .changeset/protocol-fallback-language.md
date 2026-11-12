---
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': patch
'@codaco/interview': patch
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
- **The interview (`@codaco/interview`).** Text a later update adds to the
  interview, which no protocol holds, is shown as Network Canvas words it. The
  languages are tried in the order a protocol's own text is, as far as the
  default language, and the first one Network Canvas has wording in is shown.
  When there is none, the text is shown in the protocol's fallback language,
  and not in another language of the protocol. No update has added text yet,
  so nothing a participant sees changes. Such a message has an id beginning
  `interview.added.` and a translation in each catalogue under
  `src/locales/added`.
- **Protocols (`@codaco/protocol-validation`).** `localization` gains an
  optional `fallbackLocale`. It must be one of `SUPPLIED_LANGUAGES`, and it is
  refused when the default language is one Network Canvas has wording in.
  A protocol being written may lack the one it needs; one handed over may not
  (`FALLBACK_LANGUAGE_MISSING`). `needsFallbackLanguage`,
  `isFallbackLanguageChoice`, `findMissingFallbackLanguage` and
  `withFallbackLanguage` state the rule for tools that edit a protocol's
  languages. `resolveAddedText` chooses the language text a later update adds
  is shown in. A protocol's hash is unchanged unless it names one.
- **`SyntheticInterview` (`@codaco/protocol-utilities`).** `setLocalization`
  accepts a `fallbackLocale`.
