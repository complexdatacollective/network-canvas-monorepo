# @codaco/sample-protocol

## 2.0.0

### Major Changes

- 151e511: The development protocol and the sample protocol are now schema 9 protocols.
  Their text is declared as US English (`en-US`). The development protocol is also translated into
  Spanish (`es`) and opens with a language chooser stage. Their `experiments`
  setting is now empty, because schema 9 needs no experiment to encrypt an
  attribute marked as encrypted: the development protocol's encrypted attribute
  is still encrypted. Its stage filters and skip logic no longer have rules
  comparing that attribute's answers, which schema 9 refuses: they only ever
  compared its encrypted text, so its stages behave as they did. Reading them
  needs a version of `@codaco/protocol-validation` that knows schema 9, because
  earlier versions can't read a schema 9 protocol.

### Patch Changes

- c97571a: The prompt tips of the Dyad Census, One-to-Many Dyad Census and Tie-Strength
  Census editors no longer ask researchers to refer to "these two people". Each
  tip now says which nodes the participant sees, and how to show their labels in
  the question with the syringe button's "First node: label", "Second node:
  label" or "Node label" entries. The Tie-Strength Census tip also asks for a
  prompt that every point of the scale, and the decline response, answers
  sensibly, in place of a yes-or-no question. The tips are translated into every
  Architect language.

  The sample protocol now uses piped text: its University Per Alter Form names
  the university in both questions, and its Classmates Dyad Census names the two
  classmates in its prompt.

- 43ffe6f: The words a participant reads in an interview now come from the protocol,
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
    Pedigree's key, its condition menu's "Select a condition" choice, snapshot
    button and snapshot headings.
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
  with placeholders as named pills. A translation must show each placeholder
  in the versions where Network Canvas's English shows it, so a translation
  cannot drop a person's name or a count by accident. A version for a plural
  form that only one number takes, such as English "one", may leave the number
  out. Architect marks the placeholders a version still needs, and names the
  missing placeholder and its version in the error.

  **Interface text.** The text several stages share is the protocol's
  `interfaceText`, translated in the translation table like the rest of the
  protocol, in six groups: interview navigation (Back, Continue, Exit interview
  and its explanation); buttons (Cancel, Done and Delete, and Yes and No when a
  stage shows a form); messages (the screen and item errors, and one error
  message that also stands in for a form that could not be submitted); the
  passphrase prompt; the discard-changes question and explanation, held with
  forms; and validation messages, one for each answer check, held only for the
  checks the protocol uses. The Yes answer is also the discard dialog's confirm
  button. The interview shows this text in the protocol's language; its own
  words, such as the language chooser, still follow the participant's browser.

  **Less built-in text.** Headings, labels and messages that repeated what the
  screen already showed were removed: for example the pedigree checklist's
  heading, the condition key's "What the symbols mean", the dyad censuses'
  "Select all that apply", and the separate passphrase confirmations, now one.
  Canvas tools are icon buttons with tooltips, and drawer toggles show the
  number of people still to place.

  For developers: `@codaco/app-i18n` adds `AppIntlOverlay`, which lays a set of
  messages over a catalog in a chosen locale; `@codaco/fresco-ui`'s rich text
  editor takes a `tokens` prop to insert placeholders, each of which may be
  marked `required`, the new `TokenPill` subpath draws a placeholder the same
  way in text that is only read (`TokenPill`, `TokenizedText`), `Table` takes a
  `scrollerClassName` for its scrolling element, and a dialog's busy
  confirm button is announced through a status region;
  `@codaco/protocol-validation` adds `missingSuppliedStageText`,
  `inapplicableStageSettings`, `suppliedStageSettingApplies`,
  `messageVariants`, `composeMessage`, `findMessageArgumentProblem`,
  `findMissingPlacement` and `requiredArgumentsOf`, and a declared `text` or
  `plural` argument may list the versions it is `required` in; and
  `SyntheticInterview.addStage` takes a stage's own `wording`.

- 43acfe0: Per Alter Form, Per Alter Edge Form, Dyad Census and Tie-Strength Census
  stages no longer have an introduction panel. Instructions for participants
  before these stages now live in Information stages, so they are written,
  translated and skipped in one place. An Ego Form keeps its introduction, a
  title and optional text shown above its questions.

  Per Alter Form, Per Alter Edge Form, Dyad Census and Tie-Strength Census
  stages now open straight on their first question or pair, and Back from
  there leaves the stage. When one of these stages has no one to ask about (no
  person or relationship of its type, or fewer than two people for a census),
  the interview passes over it going forwards and backwards, and the stages
  menu shows it as hidden by the answers given so far. Architect no longer offers an introduction section
  for these stages.

  Upgrading a protocol from schema 8 turns each introduction panel into an
  Information stage just before its stage, with the panel's title and text.
  The new stage copies the original stage's skip logic, and skip logic that
  jumped to the original stage now jumps to the new one. An Ego Form keeps its
  panel. The migration notes describe this in every supported language.

  For developers: only the schema 9 Ego Form has an `introductionPanel`, and
  `SyntheticInterview` takes introduction panel options for Ego Forms only.

- 7bc3d43: A Name Generator for Roster Data stage now has a required panel title, the
  heading above the people a participant can add, which the interview used to
  show as built-in "Available to add" text. Researchers can change and translate
  it like any other protocol text, in a new **Roster panel** section of the stage
  editor, and Architect's protocol summary lists it. A new roster stage starts
  with "Available to add" in each of the protocol's languages that Network Canvas
  has wording for, and in English in a default language it has none for, and
  Architect fills it into a language added later, or a language the protocol's
  text is corrected to, while the researcher has not changed it in the default
  language. Upgrading a protocol from schema 8 gives each roster stage the
  heading the interview has always shown, and the bundled sample and development
  protocols carry it.
- 9fdb4ff: When an interview task cannot be displayed, the error screen's copy button now reads "Copy" and changes to "Copied" for a moment once the debug information has been copied, which screen readers also announce. The message above it is now set out as a heading and short paragraphs instead of one block of text, in every language the interview ships. New protocols get the new wording; a protocol that already holds its own wording for this message keeps it.

  In Architect, the Languages page now offers the translation table even when a protocol has only one language, since that is where the protocol's own words for the interview, such as this error message, are edited.

## 1.0.4

### Patch Changes

- cd75518: Require an answer in the bundled protocols' quick-add and "other" fields

  Quick-add name generators and the follow-up question behind a categorical bin's
  "other" option used to require an answer on their own. They now follow the
  validation set on the attribute they write to, and upgrading a protocol to
  schema 8 adds `required` to those attributes so nothing changes for existing
  studies. The protocols bundled with Architect and Interviewer were never
  upgraded that way, so participants could leave these fields blank. The sample
  protocol, the development protocol and the Colored Eco-Genetic Relationship Map
  (CEGRM) template now require an answer in those fields again.

## 1.0.3

### Patch Changes

- b467615: Add forward skip destinations to schema 8, shared skip evaluation, synthetic
  network generation, and the interview runtime. Hidden stages can now continue
  at a later stage or route to the interview finish screen, with live route
  recalculation, safe Back navigation, and confirmed one-screen overrides for
  unavailable stages.

  Also keep shared Select fields correctly labelled and contained when option
  labels are long. The bundled sample protocol now ends the interview when a
  participant declines consent.

## 1.0.2

### Patch Changes

- 4c994ec: Re-encode the bundled video stimulus assets (H.264, CRF 24) to cut their size by
  ~88% (~16.5 MB -> ~2 MB) with no visible quality change (SSIM ~0.998). Same
  filenames, container, and codec, so consumers need no changes.

## 1.0.1

### Patch Changes

- d96450e: Bring the bundled protocols into conformance with the current schema 8 so they open in Architect without a "Protocol Validation Failed" dialog. These protocols are tagged schema version 8, so the open path skips migration and stale legacy keys are never stripped.
  - Sample Protocol: removed `size` from Information **text** items (schema 8 only allows `size` on asset items).
  - Development Protocol: removed `size` from text items, dropped the no-longer-supported `form.title` on the ego/alter/alter-edge forms, removed the unused `loop` flag on the `withSound` asset, dropped the `highlight` block from the Sociogram prompt that also created edges (the two are mutually exclusive), and renamed the venue node type's `name_variable` to `venue_name_variable` so variable record keys are unique across entity types.
