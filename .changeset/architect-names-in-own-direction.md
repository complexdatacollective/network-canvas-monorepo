---
'@codaco/fresco-ui': minor
'@codaco/architect': patch
---

Names a researcher gives (stages, attributes, node and edge types, resources and the columns of a data file) now read in their own direction wherever Architect shows them, so a name in Arabic reads correctly in an English interface and an English name keeps its punctuation in place in Arabic. The printable protocol summary now names input controls, attribute types, the One-to-Many Dyad Census removal setting and map selection colours in the interface's language, instead of showing the protocol's internal keys.

In `@codaco/fresco-ui`, `PresentationalText` accepts `{ text, dir: 'auto' }` for text in no recorded language, such as a name someone typed, and `useTokenPillLanguage` gives the interface's `lang` and `dir` for a token pill shown inside text in the protocol's language. `TokenPill` now carries them itself.
