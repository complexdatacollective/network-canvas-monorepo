---
'@codaco/studio-web': minor
'@codaco/studio-api': minor
'@codaco/studio-sync': patch
---

Studio now keeps protocols that are written in more than one language. A
protocol declares the languages its text is written in, and every screen name,
prompt and label in it is stored as one translation for each of those
languages.

- The protocol editor names each screen in the language you are editing in. A
  screen with no name in that language is listed under the name a participant
  would be shown instead, and a screen with no name in any language is listed
  by its position, such as "Screen 3". A protocol with more than one language
  has a language menu beside each text field, and choosing a language there
  switches the whole editor.
- A screen added from the outline starts as "Untitled screen" in every language
  the protocol declares.
- Comparing two versions names each screen that was added, removed or changed
  by its name in the protocol's default language, or in another language that
  has text when the default has none. Versions saved before protocols could be
  translated are still described by their plain names.
- Editing a version that was saved in an older protocol format now starts a
  draft that has been upgraded to the current format, with its text written in
  English. Before, the draft kept the old format and could not be edited.
- A protocol created in Studio is written in the unspecified language (`und`),
  because Studio does not yet ask which language you are writing in. A
  protocol upgraded from an earlier version is written in English (`en`). The
  sample protocol, the demo protocol and the protocols a new instance seeds
  declare their language, US English.
- A protocol's language declaration is saved with its settings, so a draft that
  declares languages passes the check made before each save.
