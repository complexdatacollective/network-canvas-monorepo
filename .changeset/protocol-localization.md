---
'@codaco/interview': major
'@codaco/architect': major
'@codaco/interviewer': major
'fresco': major
---

Protocols can now be translated. A schema 9 protocol declares the languages
its text is written in, and participants see each interview in the language
that suits them best.

How an interview picks its language:

- An interview shows the protocol in the first of the participant's browser
  languages that the protocol offers, or in the protocol's default language
  when it offers none of them. This is checked again each time the interview
  opens, until the participant chooses a language.
- A new Language Chooser stage lets participants choose one of the protocol's
  languages. Each language is shown by its own name, the current one is
  selected, and choosing another switches the whole interview at once. The
  choice is saved with the interview. The stage can appear anywhere, more than
  once.
- Buttons, menus and other text that Network Canvas provides follow the
  participant's chosen language when it is one of Network Canvas's own
  languages, and otherwise their browser's languages. The language setting in
  the interview's settings menu has been removed.
- Text that is missing in the chosen language is shown in another of the
  protocol's languages, marked so that screen readers pronounce it correctly.
- Participants see a node or edge type's label, which can be translated,
  rather than its name. A Narrative preset switcher lists highlighted
  attributes by the translated labels the preset gives them, and a Network
  Composer field shows its own translated caption rather than the attribute's
  label.

In Architect:

- A new Languages page lists the protocol's languages, lets you add and remove
  languages and choose the default one, and shows which text is still missing
  a translation. A language can't be removed while it is the default, or while
  some text would be left with no translation at all.
- A new protocol asks which languages participants can take it in, and,
  when you choose more than one, which of them is the default. A protocol
  upgraded from an earlier version is marked as written in "Unspecified
  language", and the project navigation suggests you set its real language.
- Once a protocol has more than one language, each text field in the stage
  editors has a language menu that shows which languages its text still needs.
  All the menus switch together, so you can work through a stage in one
  language. Node type and edge type labels can be translated too. An
  attribute's label is plain text and is not translated.
- Each attribute a Narrative preset highlights has a label of its own, which
  participants see in the preset switcher. You write and translate it in the
  Narrative stage editor; it starts as the attribute's name.
- Each Network Composer form field needs a caption, which can be translated.
  Choosing the field's attribute fills in its name as the caption, until you
  write one of your own.
- The printable protocol summary can be printed in any of the protocol's
  languages.
- The New Stage menu has a new Utilities capability, which lists the
  Information interface and the Language Chooser. The Language Chooser's
  editor lists the languages participants will be offered: every language
  the protocol is written in.
- A preview opens in the language a participant with your browser would see,
  rather than in Architect's own language. A "Preview language" menu above it
  switches the interview to any of the protocol's languages while the preview
  window is open.

In Interviewer and Fresco:

- Each interview records the language the participant chose and the language
  they last saw. Exported ego data has a `networkCanvasInterviewLocale` column
  (CSV) and an `nc:interviewLocale` attribute (GraphML) holding the language
  last shown, or `und` for a protocol whose language is unspecified.
- Interviewer's new interview form no longer asks for a language, and the
  confirmation at the end of an interview follows the interview's language.
- Fresco reads the participant's browser languages from their request, so the
  server and the browser agree on the interview's language.

**Breaking for hosts of `@codaco/interview`.** The Shell no longer takes
`localePreference`, `onLocaleChange`, `allowLanguageSelection` or
`requestedLocale`. Pass `requestedLocales`, the participant's browser languages
in order (`navigator.languages`, or a parsed `Accept-Language` header on a
server), and `onProtocolLocaleChange(interviewId, { locale, localePreference })`,
which the interview calls when the participant chooses a language and when the
language it shows differs from the stored one. Store both values and run the
calls for one interview in order. `SessionPayload` now requires
`localePreference` and `locale` (each a `LocaleTag` or `null`) and
`localeOptions`, the `LocaleMetadata` of every language the protocol declares
(from `getLocaleMetadata` in `@codaco/protocol-validation`), which is never
stored. The `onSync` snapshot is typed `SessionSnapshot`; never store its
locale fields from there. Components used outside the Shell that show protocol
text need a `ProtocolLocalizationProvider`. The package README describes the
whole contract.
