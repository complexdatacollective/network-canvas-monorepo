---
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': minor
'@codaco/app-i18n': minor
'@codaco/fresco-ui': minor
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
'@codaco/development-protocol': patch
'@codaco/sample-protocol': patch
---

The words a participant reads in an interview now come from the protocol,
in the protocol's language, wherever the protocol can hold them, and the
interview shows less text of its own.

**Stage settings.** Text a participant sees on one kind of stage is now a
setting of that stage, which researchers can change and translate. Network
Canvas fills each one with its starting wording in every protocol language it
has wording for (English, German, Spanish, French, Italian, Dutch, Brazilian
Portuguese, and Simplified and Traditional Chinese):

- Finish screen: the finish button, its confirmation question, the finished
  notice and the message shown if finishing fails.
- Name generators: the minimum and maximum notices, the quick-add hint, the
  message for an external list that could not load, the roster's "nothing
  left to add" notice, and its search label and no-match text.
- Geospatial: the offline notice, the message for a map that cannot be shown,
  the label for a place outside the selectable areas, and the search label,
  no-match and search-failed texts.
- Network Composer, Narrative, Sociogram and Narrative Pedigree: the name box
  placeholder, panel headings, the tools' tooltips, and the Narrative
  Pedigree's condition key and snapshot headings.
- Family Pedigree: every word of drawing, connecting and adding to the family,
  as the stage's `wording`, including the name question and the checklist of
  family members still needed.

A setting shown only under some configuration, such as the layout tooltips
while automatic layout is on, is held only while that configuration is on:
Architect fills it in with the starting wording when the configuration is
switched on and removes it when it is switched off, so a protocol never asks
for text its participants cannot see to be translated. Upgrading a protocol
from schema 8 gives each stage the wording it has always shown. Several
settings read differently when they are about the participant and when they
are about someone else, or show a name or a number; Architect's stage editor,
translation table and protocol summary show each version separately, named,
with placeholders as named chips.

**Interface text.** The text several stages share — Back, Continue, Cancel,
Done and Delete; the passphrase prompt; form words; and one message for each
answer check, held only for the checks the protocol uses — is the protocol's
`interfaceText`, translated in the translation table like the rest of the
protocol. The interview shows it in the protocol's language; its own words,
such as navigation and the language chooser, still follow the participant's
browser.

**Less built-in text.** Headings, labels and messages that repeated what the
screen already showed were removed: for example the pedigree checklist's
heading, the condition key's "What the symbols mean", the dyad censuses'
"Select all that apply", and the separate passphrase confirmations, now one.
Canvas tools are icon buttons with tooltips, and drawer toggles show the
number of people still to place.

For developers: `@codaco/app-i18n` adds `AppIntlOverlay`, which lays a set of
messages over a catalog in a chosen locale; `@codaco/fresco-ui`'s rich text
editor takes a `tokens` prop to insert placeholders, and a dialog's busy
confirm button is announced through a status region;
`@codaco/protocol-validation` adds `missingSuppliedStageText`,
`inapplicableStageSettings`, `suppliedStageSettingApplies`,
`messageVariants`, `composeMessage` and `findMessageArgumentProblem`; and
`SyntheticInterview.addStage` takes a stage's own `wording`.
