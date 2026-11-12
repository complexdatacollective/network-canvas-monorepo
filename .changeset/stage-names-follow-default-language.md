---
'@codaco/protocol-validation': minor
'@codaco/architect': minor
---

Architect now proposes a new stage's name in the protocol's default language
when Network Canvas supplies wording for it: English, German, Spanish, French,
Italian, Dutch, Brazilian Portuguese, and Simplified and Traditional Chinese.
The name follows the protocol's default language, not the language Architect is
shown in. When the default language is any other one, Architect proposes no
name: the name field starts empty, nothing is filled in for you, and you name
each stage yourself. English protocols, and protocols that declare no
languages, are named as before. `@codaco/protocol-validation` now exports
`SUPPLIED_LANGUAGES`, `stageNameWordingFor` and the types that describe the
stage-name wording.
