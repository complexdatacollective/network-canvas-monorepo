---
'@codaco/architect': minor
'@codaco/fresco-ui': minor
'@codaco/protocol-validation': minor
---

Architect can now add a language that is not in its list of languages, and change a language to one that is not in the list. Type the language's code into the search box of the language list in either dialog, such as `haw` for Hawaiian, `yue` for Cantonese or `fr-CA` for Canadian French, and the language is offered after the names that match. It is stored in its standard form (`ES-419` becomes `es-419`), and a code that names no language, or a language the protocol already has, is not offered. In `@codaco/fresco-ui`, `ComboboxField` accepts `optionFromSearch`, which offers an option made from the text typed into its search box, and `single`, which chooses one option instead of several. `@codaco/protocol-validation` exports `describableLocale`, which returns the standard form of a language code that a protocol can declare and that can be named, and `undefined` for any other text.
