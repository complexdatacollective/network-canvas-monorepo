---
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': minor
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

Words that several interfaces show in the same way are now worded once for the
whole protocol, as interface text, instead of once per stage.

**Protocols (`@codaco/protocol-validation`)**

- Interface text gains `buttons.save` and `buttons.dontKnow` (Family
  Pedigree), `buttons.pauseLayout` and `buttons.resumeLayout` (Sociogram and
  Narrative with automatic layout), `messages.externalDataError` (name
  generators whose panels or roster read a data file), and a new `search`
  group holding `searchLabel` and `searchNoMatch` (Geospatial and roster
  search). Each is held only while something in the protocol shows it.
- The stage settings they replace are gone: `externalDataError`
  (NameGenerator, NameGeneratorQuickAdd, NameGeneratorRoster), `searchLabel`
  and `searchNoMatch` (Geospatial, NameGeneratorRoster), the Sociogram's
  `tooltips` and the Narrative's `tooltips.pauseLayout` and
  `tooltips.resumeLayout`, and the Family Pedigree's `wording.save`,
  `wording.dontKnow` and `wording.zygosityUnknown`. Geospatial `searchFailed`
  stays on the stage.

**Synthetic protocols (`@codaco/protocol-utilities`)**

- `SyntheticInterview.setInterfaceText(group, key, text)` words one interface
  text the researcher's way.

**Interview runtime (`@codaco/interview`)**

- These words come from the protocol's interface text. The Family Pedigree's twin question uses the same
  Don't know answer as its other questions.

**Architect**

- These words are reworded and translated with the interview's other shared
  words, under Buttons, Messages and a new Search group, rather than in each
  stage's editor. The Sociogram editor no longer has a Words on the canvas
  section.
