# @codaco/development-protocol

## 3.0.0

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

### Minor Changes

- 2729855: The Family Pedigree is redesigned, and schema 9 carries the new stage. Schema 8
  keeps the Family Pedigree stage that has already been released, unchanged.

  **In the interview**, participants build their family on a pan-and-zoom canvas.
  Selecting a person opens a side panel for their details. Hovering a person, or
  focusing them from the keyboard, offers to add a parent, partner, sibling or
  child. The participant is shown as "You" and is never asked their name. People
  the participant leaves unnamed are shown by a kinship word in the stage's
  wording: gendered (mother, brother), gamete-based (egg parent, sperm parent),
  or the participant's own choice. When gender identity is asked, those words
  follow each person's gender identity; otherwise they follow sex assigned at
  birth. Gender identity may be left unanswered, because a participant may not
  know a relative's gender identity; an unanswered biological parent is then
  named from their sex assigned at birth.

  - Names the participant types follow the name attribute's validation in the
    codebook. Encrypted name attributes work, using the usual passphrase prompt.
  - When the participant leaves the stage, each unnamed person is given a
    distinct label as their name, so later stages can tell people apart, for
    example "Sister (partner of Tom)". The stage records who holds a generated
    label in its stage metadata as a fingerprint, not as text. On a return visit
    the labels follow the family as it changes, and a name typed on a later
    stage is kept. The `@codaco/shared-consts` stage metadata schema accepts this
    `generatedLabels` record and no longer requires a `framing`.
  - The stage draws only the participant's family: the participant and everyone
    connected to them through the stage's relationships. People of the same
    type added by other stages are never drawn, labelled, counted towards
    completeness or offered to nomination prompts. Removing someone also
    removes anyone connected to the participant only through them, after
    naming those people. A connection that is someone's only link to the family
    can't be removed.
  - Completeness settings can require, or recommend, that a minimum part of the
    family is recorded, along with every required detail about each person,
    before the participant continues. From the parents, siblings and children
    scope upwards, each of the participant's biological children needs their
    other biological parent; an unnamed parent counts, and that parent's own
    family is not required.
  - Which gamete each genetic parent gave is never asked. One shared rule
    derives it from sex assigned at birth (by elimination where one parent is
    neither female nor male), and the kinship words and the genetics engine
    both read it.
  - No addition gives anyone more than two genetic parents, or two of one sex
    assigned at birth: a placeholder parent is biological only while a genetic
    place is open, and "also parent of" links carry the anchor link's kind and
    carrier. Full siblings need the same parents.
  - A stage can record each person's relationship to the participant (parent,
    half sibling, cousin and so on) so later stages can filter on it. It is
    worked out from the family drawn every time the participant leaves the
    stage, given to everyone connected to the participant but never the
    participant, and cleared from anyone no longer connected.
  - The stage is not left forwards until the participant has chosen its
    wording, when the stage lets them choose.
  - The panel for someone new asks its questions a group at a time: who the
    person is, how they are related, then the study's own questions. It opens
    with the cursor in the name field. A question answered with a single
    choice brings the next unanswered one in its group into view, and
    answering a group's last required question moves on to the next group.
    A group whose remaining questions are optional can be skipped, and Back
    returns to the group before with its answers kept. Moving on slides the
    group out to the left and the next in from the right, and Back the other
    way round, unless the device asks for reduced motion. Changing someone
    already in the family still shows all their details at once.
  - Nomination prompts ask the participant to select the relatives a question
    applies to, and can leave out people recorded with one sex assigned at
    birth.
  - The layout keeps couples side by side when partnerships form chains,
    draws every child below each of its parents (including when a parent is
    one of the child's own descendants), and joins a step-parent to a child
    with a dashed line. Children adopted into a family share one solid sibship
    line with their parents' other children, whether or not the parents are
    recorded as partners, and only the line up to each adopted child is dashed.

  **The Narrative Pedigree** reads the redesigned Family Pedigree. It draws the
  same family on the same canvas, labels people as the Family Pedigree does,
  and can be operated from the keyboard: arrow keys move between people, Enter
  or Space focuses on someone, and + and − zoom. Its toolbar offers the
  conditions in a menu, each beside its colour, with a first choice that shows
  all conditions, and a key to the symbols appears once a condition is chosen. Sex-linked inheritance reads sex
  assigned at birth. An intersex person is treated as uncertain, and a parent
  whose sex isn't known is placed by the gamete their co-parent's sex implies.
  Arrow keys no longer start a drag of either pedigree's canvas.

  **The schema 9 Family Pedigree stage** names its people by its `subject` and
  has:

  - `prompt`, the translatable task instructions.
  - `nodeConfiguration`: `nameAttribute` (text), `sexAssignedAtBirthAttribute`
    (categorical, with the fixed `PEDIGREE_SEX_ASSIGNED_AT_BIRTH` options),
    `egoAttribute` (boolean), and optionally `genderIdentity`
    (`{ attribute, terms }`). Its `terms` give the kinship words
    (`PEDIGREE_GENDER_WORDS`) that each gender identity option takes. The
    options of a gender identity attribute that a pedigree binds can be edited
    only from that stage, though any stage may still record answers to it, and
    only one stage may manage them: two stages binding the same gender identity
    attribute are refused. `relationshipToParticipantAttribute` (optional) is a
    categorical attribute with the fixed `PEDIGREE_RELATIONSHIPS_TO_PARTICIPANT`
    values, which only the pedigree may write.
  - `edgeConfiguration`: the family edge type, with `kindAttribute`
    (categorical, with the fixed `PEDIGREE_RELATIONSHIP_KINDS` options), and
    `gestationalCarrierAttribute` and `currentPartnerAttribute` (both boolean).
  - `framing` (optional): `gendered`, `gamete` or `participantPreference`.
  - `completeness` (optional): `scope`, `enforcement`, and the categorical
    `relativesNotRecordedAttribute` with the fixed
    `PEDIGREE_RELATIVES_NOT_RECORDED` options.
  - `form` (optional): extra person fields, asked after the interface's own.
  - `nominationPrompts` (optional): each has a translatable `text`, a boolean
    `attribute`, and optionally `onlyForSexAssignedAtBirth`. The id `pedigree` is
    reserved.

  The labels of the fixed option sets are translatable, and fixed options are
  validated by their values only. A Narrative Pedigree disease names its
  boolean person attribute as `attribute` (it was `variable`).
  `NarrativeDiseaseEntry` in `@codaco/protocol-utilities` takes `attribute`, and
  `SyntheticInterview` writes Family Pedigree stages in the new shape.

  **The v8 to v9 migration** converts a schema 8 Family Pedigree. The old
  attributes map to their new places, `censusPrompt` becomes `prompt`, and the
  framing carries over. Every converted stage gets a `completeness` setting,
  since schema 8 always required both of the participant's parents: the
  parents scope, required, or the grandparents scope at the `requireGrandparents`
  boundary's enforcement. A recommended grandparents boundary therefore makes
  the parents a recommendation too, and the migration notes say so. Each
  person type a converted stage uses gets a new `relativesNotRecorded`
  attribute, whose name ends in a number when the type already uses that name.
  An `introScreen` becomes an Information stage titled "Introduction", the
  heading schema 8 showed above it, inserted just before the pedigree. That
  stage takes the pedigree's skip logic, and skips that jumped to the pedigree
  now jump to it. Where a host migrates the interviews recorded against a
  migrated protocol, each stage's metadata and the resume
  position follow their stage, so an interview in progress resumes where its
  participant left it. Interviewer never migrates protocols or interviews:
  schema 8 ones stay in Interviewer 8. A schema 8 pedigree's stage metadata becomes the new shape,
  keeping the participant's framing and "no children" answer, and writing to the network any people and
  relationships that were only held in it. Parent relationships lose the
  `isActive` flag schema 8 wrote on them, which schema 9 reads as "current
  partner", and carry the gestational carrier flag as true or false, as the
  redesigned stage writes them. A person with no sex at birth recorded who gave
  an egg or a sperm, by schema 8's gamete role, is recorded as female or male.
  `requireChildrenContributors`, `relationshipVariable` and
  `gameteRoleVariable` are dropped; their attributes stay in the codebook. The
  old relationship attribute held English text, so a converted stage records no
  relationship to the participant until a categorical attribute is chosen for
  it. Node
  form fields collecting the name or sex at birth attribute are left out, since
  the stage asks both itself. A pedigree whose answers share an attribute (two
  nomination prompts, a nomination prompt and a node form field, or the name
  and another answer) is not converted: the migrated protocol fails validation,
  naming the attribute. The migration notes describe all of this to researchers.

  **In Architect**, the stage editor configures the new stage. It has a
  setting that gives person symbols a shape for each sex assigned at birth or
  gender identity, and edits a gender identity attribute's options together
  with their kinship words. The gender identity picker rules out an attribute
  whose options another stage manages. Recording each person's relationship to
  the participant is switched on in the person attributes, which creates an
  attribute with the fixed values labelled in the researcher's language, and
  the protocol summary lists it. Architect offers and summarises the Narrative
  Pedigree again, and won't let a Family Pedigree's person type change while a
  Narrative Pedigree reads it. The Colored Eco-Genetic Relationship Map template
  marks the people named in "People in your life" with a `non_kin` attribute,
  instead of treating anyone without a gender identity as non-kin.

### Patch Changes

- 0aee4be: An Anonymisation stage's explanation is now one text. Its title, which was a
  separate field, is the explanation's first line, written as a heading, so the
  stage has one text to edit and translate. Architect shows a single
  Explanation field in the Task explanation section, with Heading 1 in its
  toolbar for the title, and the title no longer has a length limit.
  Participants see the same screen as before.

  Upgrading a protocol from schema 8 moves each Anonymisation title to the
  start of its explanation as a heading, escaped so it shows exactly as it was
  written. The migration notes describe this in every supported language.

  For developers: the schema 9 Anonymisation stage's `explanationText` is a
  localized markdown string rather than `{ title, body }`, and
  `SyntheticInterview` takes it as one string.

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

- 7fa80c2: The Language Chooser stage's heading is now part of the protocol. A new stage
  starts with "Choose a language" in each of the protocol's languages that
  Network Canvas has wording for, and the researcher can reword and translate it
  in the stage's Participant wording section in Architect. The interview shows
  the stage's heading, in the language the participant has chosen.
- e31a3c9: In the Family Pedigree, more answers saved by mistake can now be corrected without deleting anyone. The newest answer wins:

  - Recording, when adding a parent or connecting two people, that someone carried the pregnancy (a Surrogate included) is no longer unavailable when another parent is recorded as having carried it. That parent is left with nothing recorded about carrying.
  - Choosing a biological parent or donor while a biological parent with the same sex at birth is recorded is no longer unavailable. The form asks how the participant would define that parent's relationship instead.
  - Answering that two twins are identical gives both of them the same biological parents and donors, where that is possible.

  A hint under the answer says what choosing it will change, and Undo reverses it once saved. The question about a parent's kind now reads "How would you define “Julie”’s relationship to you?" instead of "Julie is your…". The stage wording gains `carrierReplaced`, `geneticParentReplaced` and `identicalTwinSharesParents`.

- ab9a884: In the Family Pedigree, a sex at birth saved by mistake can now be corrected from the person's own panel. Previously a parent recorded as having carried the pregnancy could not be changed to male, and a genetic parent could not be given the same sex at birth as the other genetic parent, so swapping two parents' answers meant changing a relationship first. Now the newest answer wins: every sex at birth stays available, and saving one that contradicts another record clears that record so it can be answered again. The record that the person carried a pregnancy is removed, and the other genetic parent's sex at birth is cleared. The hint under the field says what saving will change before the participant saves, and Undo reverses it. Only a surrogate still cannot be recorded as male. The stage wording `unavailableSameSexAsCoParent` is replaced by `sexChangeClearsCoParentSex` and `sexChangeEndsCarrying`, and `unavailableCarried` now applies only to surrogates.
- 6cc9d9d: The Family Pedigree's add-person steps no longer pre-select any answer: the kind of parent, child or sibling, the other parent, whether two people are still together, shared parents and twins all start unanswered. A step's button reads "Skip" only while nothing on it is answered, and "Continue" once anything is. The "Some details are missing" notice is removed, along with its `missingDetailsList` wording. When participants add their own child, the step-child, donor and surrogate options now say "you" ("A child you carried as a surrogate"), through a new `isYou` argument on the `childKindSocial`, `childKindDonor` and `childKindSurrogate` wording.
- 72b189a: In the Family Pedigree, twins share one carrier: answering who carried one twin answers it for the other, and the add-child and add-sibling forms now require "Who carried the pregnancy?" to be answered. Continue on a step with a required question left unanswered now shows the same error Save does, instead of doing nothing visible. When participants add a partner, "Are they still together?" names the person ("Are they still together with “Dina”?"). Two people recorded as female and male at birth are not offered as identical twins. Questions no longer put a possessive after a quoted name ("Are they a twin of “Cara”?" instead of "Are they “Cara”’s twin?"). A new sibling who would not share the person who carried someone cannot be their twin. When editing someone's twins, a twin recorded with a different sex at birth from another twin already answered identical cannot be identical too, since all of them would then be identical. Editing someone no longer offers as their twin a sibling someone else carried, and adding a sibling checks "Yes, identical twins" against the sex at birth of every twin identical to the person. Whoever is recorded as carrying one twin counts as having carried them all, so adding or connecting a parent cannot record someone else as carrying another twin. When someone recorded as male at birth cannot be a surrogate, the hint gives only that reason, not also who else carried the pregnancy. Adding a parent asks whether they carried the pregnancy only once their kind of parent is chosen. `validateField` in `@codaco/fresco-ui`'s form store takes a `showErrors` option that marks the field touched so its error shows.
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

## 2.0.8

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

## 2.0.7

### Patch Changes

- f217425: Rotate the shared Mapbox testing token carried by the development protocol's Geospatial stage. The new token is URL-restricted to networkcanvas.com, networkcanvas.dev and localhost, so the map only renders on those hosts.

## 2.0.6

### Patch Changes

- c599dac: This release improves the reliability, accessibility, and recovery of protocol editing in Architect.

  - Stage edits are now transactional: cancelling restores Codebook changes, incomplete settings remain open with actionable errors, and Information blocks retain their drafts while switching media types.
  - Forms, rule builders, the Codebook, timeline, dialogs, and resource library now provide accurate labels, keyboard operation, focus restoration, and layouts that work on smaller screens. Undo and Redo operate one change at a time without recording no-op edits.
  - A second tab now shows a read-only protocol instead of accepting changes it cannot save. Closing the editing tab restores editing from the saved copy, and deleting a protocol clears its history and releases associated resources.
  - Protocol names, resource cards, variable identifiers, and stage editors are bounded on narrow screens. Duplicate resource filenames are distinguishable without changing the names stored in the protocol.
  - Invalid imports, blocked edits, migration conflicts, preview completion, and deleted protocol routes now explain what happened and provide a safe recovery path.
  - Recent protocols in the library now show their description, and starter templates show their stage, node type, and edge type counts.
  - The CEGRM starter template now uses an available color for its Narrative Pedigree condition. Protocol colors are constrained to typed node, edge, ordinal, or categorical palette references; Narrative Pedigree and Geospatial resolve those references through the active theme. A protocol created from the previous release's CEGRM template will report a validation error on its condition color — open the stage editor and select one of the available colors to fix it. A downloaded protocol file with this problem must be corrected before it can be imported again. Neutral dialog actions remain distinct from white dialog surfaces.

## 2.0.5

### Patch Changes

- c49e702: Synchronize the packaged development protocol after removing Network Composer
  form fields that conflict with its unvalidated group-membership writer.

## 2.0.4

### Patch Changes

- eb0df29: Add examples of the four previously-missing stage types (Network Composer, Geospatial, Family Pedigree, and Narrative Pedigree) so the development protocol now contains a working example of every stage type.

## 2.0.3

### Patch Changes

- a171f96: Unify the Sociogram and Narrative stage behaviours into a single shared schema, and flatten the `automaticLayout` behaviour to a plain boolean (was `{ enabled }`). The Narrative interface gains a configurable `automaticLayout` behaviour (a force-directed layout that positions nodes). It is only active when explicitly enabled, so existing protocols keep their hand-authored static layouts; new Narrative stages created in Architect enable it by default. The v7->v8 migration flattens any existing Sociogram `automaticLayout` value.

## 2.0.2

### Patch Changes

- d96450e: Bring the bundled protocols into conformance with the current schema 8 so they open in Architect without a "Protocol Validation Failed" dialog. These protocols are tagged schema version 8, so the open path skips migration and stale legacy keys are never stripped.
  - Sample Protocol: removed `size` from Information **text** items (schema 8 only allows `size` on asset items).
  - Development Protocol: removed `size` from text items, dropped the no-longer-supported `form.title` on the ego/alter/alter-edge forms, removed the unused `loop` flag on the `withSound` asset, dropped the no-longer-supported `highlight` block from the Sociogram prompt that also created edges (the two are mutually exclusive), and renamed the venue node type's `name_variable` to `venue_name_variable` so variable record keys are unique across entity types.

## 2.0.1

### Patch Changes

- f1dbd8d: Add node shape support with variable-to-shape mapping. NodeDefinition now includes a required `shape` field with a default shape (circle, square, or diamond) and optional dynamic mapping that maps variable values to shapes. Supports discrete mappings for categorical/ordinal/boolean variables and breakpoint mappings for number/scalar variables. Renames `iconVariant` to `icon` on node definitions.

## 2.0.0

### Major Changes

- 84d09e3: Implement validation of variable ID uniqueness across entities. Replaces broken implementation.
