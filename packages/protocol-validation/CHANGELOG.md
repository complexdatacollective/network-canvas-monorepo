# @codaco/protocol-validation

## 16.0.0

### Major Changes

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

- 151e511: Adds protocol schema 9, in which attribute (variable) names can use any
  script, spaces and punctuation, every string a participant reads can be
  translated into several languages, and encrypted attributes are no longer
  experimental.

  **Breaking:**

  - `CURRENT_SCHEMA_VERSION` is now `9`, and `CurrentProtocolSchema` and
    `CurrentProtocol` describe schema 9. `migrateProtocol` and
    `protocolMigrator.migrate` called without a target version now produce
    schema 9 documents. A host that stores or runs protocols must accept
    schema 9; the matching `@codaco/interview` major runs it.
  - `migrateProtocol(document, targetVersion, dependencies)` accepts only a
    target it can validate (7, 8 or 9), and its return type follows the target:
    `Protocol<V>` for an explicit target, `CurrentProtocol` without one. The
    result is validated against the target version's own schema, so a migration
    to 8 refuses names only schema 9 allows. `ProtocolMigrator`'s `migrate` has
    the same overloads, and it now caches one result per target version for each
    key, so asking for a second version no longer discards the first.
    `clearCache(key)` drops all of them.
  - `detectSchemaVersion` throws `VersionMismatchError` for a document newer
    than `CURRENT_SCHEMA_VERSION`, instead of `SchemaVersionDetectionError`, so
    `getProtocolFileErrorKind` reports it as `'newerVersion'`.
  - A codebook ID of `__proto__` is refused. `validateProtocol` and
    `migrateProtocol` look for it in the document as it was read, before a
    schema parse can drop the key, so pass them the raw document.
    `validateProtocol` now takes `unknown`.
  - Participant-facing text in a schema 9 protocol is a `LocalizedString`, not a
    `string` (see Localization below), so code that reads a stage's `label`, a
    prompt's `text`, an option's `label` and so on must resolve it first, for
    example with `resolveLocalizedString`.
  - `hashProtocol` takes the protocol's `schemaVersion`, and from schema 9 its
    `localization` too. A schema 9 hash covers `{ localization, codebook,
    stages }`, so a translation change produces a new hash. Languages have no
    order, so `hashProtocol` sorts them before hashing: two protocols that differ
    only in the order they list their languages have the same hash. Hashes of
    schema 8 and earlier protocols are unchanged.

  Schema 9:

  - The v8 to v9 migration keeps existing names as they are. It records the
    protocol's text as English, since older protocols never recorded a language:
    it adds `localization: { defaultLocale: 'en', locales: ['en'] }` and wraps
    every participant-facing string as `{ en: <text> }`, escaped as an ICU literal
    message. Validation refuses the undetermined language `und` (and `und-*`
    tags) as a declared language, as the default, and as a localized-string key. A Narrative preset's `highlight` list of variable IDs becomes a list of
    `{ variable, label }`, and its `edges.display` list of edge type IDs becomes
    a list of `{ type, label }`, each label taken from the variable's or edge
    type's name (or its ID) and wrapped as `{ en: <text> }`. Each Network
    Composer edge entry gets a `label` taken from its edge type's name (or its
    ID) and wrapped the same way. Codebook node types, edge types and variables
    have no `label`: participants never see a codebook name. A form field with no caption, or an
    empty or blank one (a Network Composer field's `label`, or any other form
    field's `prompt`), gets its attribute's name (or its ID) as one, escaped so
    that markdown shows it as written, and wrapped the same way. An empty
    optional text that schema 9 requires to be non-empty is removed, as are
    Network Composer scale end labels that were not strings. Its migration notes
    tell researchers what the new version allows, that the text is recorded as
    English, so they should confirm the default language and change it in
    Architect if the protocol is written in another one, and which empty
    questions were filled in.
  - Schema 9 keeps the optional `experiments` property, for features released
    within a schema version, but `encryptedVariables` is no longer one of them:
    an attribute marked `encrypted` is always encrypted. `ExperimentsSchema` and
    the `Experiments` type now describe schema 9's experiments, and none is
    defined yet, so schema 9 refuses `encryptedVariables` or any other key in
    `experiments`. Schema 8 still accepts `experiments.encryptedVariables`.
  - The v8 to v9 migration keeps `experiments` but removes `encryptedVariables`
    from it, and leaves a protocol without `experiments` without it. If
    `experiments.encryptedVariables` was not `true`, it also removes `encrypted`
    from every node attribute, because schema 8 interviews stored those
    attributes without encryption. A host that stores `experiments` apart from
    the rest of the protocol must put it back into the document it migrates, or
    an encrypted protocol loses its encryption. The v7 to v8 migration now keeps
    an `experiments` object the document already carries, rather than replacing
    it with an empty one, so this holds for a document migrated from schema 7
    too.
  - Schema 9 refuses an Anonymisation stage whose minimum passphrase length is
    longer than its maximum, since no participant could choose a passphrase.
    The v8 to v9 migration removes both lengths from such a stage, so the
    interview's default minimum applies, and its migration notes say so.
  - Schema 9 refuses a skip logic, stage filter or panel filter rule that
    compares the answers to an encrypted node attribute. Rules are checked
    without the participant's passphrase, so such a rule only ever compared the
    encrypted text. A rule that only checks whether the attribute is answered
    (`EXISTS` or `NOT_EXISTS`) still works, so schema 9 accepts it. A panel over
    an external data file may still compare one, because that file's rows are
    not encrypted. When `experiments.encryptedVariables` was on, the v8 to v9
    migration removes the comparing rules and keeps the others. A filter that
    this leaves with no rules is removed, and so is skip logic left with none,
    so that stage is always shown; a stage shown only when a removed rule
    matched may never have appeared before. A filter or skip logic that already
    had no rules is left alone, and schema 9 still refuses it. Its migration
    notes tell researchers to check those stages: rules joined with `AND` that
    lose one match at least as often as before, and rules joined with `OR`
    match at most as often.
  - Schema 9 refuses two options of one ordinal or categorical attribute with
    the same value, compared as text (so `1` and `"1"` are the same value) but
    without folding case. The v8 to v9 migration keeps the first option with
    each value and removes the later ones; answers, filters and skip logic keep
    the value they use. Where that leaves a `minSelected` above the options
    left, it is removed. An attribute left with one option is still refused.
  - An introduction panel's `text` is optional in schema 9, and when present,
    like its `title`, every translation must contain text. The v8 to v9
    migration removes text that is blank in every language, so the panel shows
    only its title, and gives a blank title the stage's label. A Categorical Bin
    prompt's `otherOptionLabel` and `otherVariablePrompt` must also contain text;
    the migration gives a blank one the other's text, else `Other` or
    `Please specify`. In a document already in schema 9 form, only the blank
    translations of these fields are removed.

  - Schema 8 still refuses names outside `a-z`, `A-Z`, digits and `. _ - :`, with
    a message that says so. `VersionlessProtocolSchema`, the version 8 body
    without its `schemaVersion`, is now exported.
  - The v3 to v4 migration no longer strips characters outside `[a-zA-Z0-9._:-]`
    from type names, variable names and option values. It turns tabs and line
    breaks into spaces, removes other control characters, trims the result, and
    falls back to the record's ID when nothing is left. Filter, skip logic and
    panel rules that refer to an option value it changed are updated to match.
    A migration to schema 7 or 8 still applies the old rule, which those schemas
    enforce: each migration step now receives the target version as a third
    argument to `migrate`.

  Localization:

  - A schema 9 protocol declares its languages in a required
    `localization: { defaultLocale, locales }` block of BCP 47 tags. Every string
    a participant reads (stage labels, prompts, panel titles, form captions and
    hints, option labels, Information items, census and pedigree copy) is a
    `LocalizedString`: a record from a declared locale tag to that language's
    text. Markdown fields hold markdown in each language.
  - A localized string needs a translation in at least one declared language, not
    in every language and not necessarily in the default one. A missing
    translation, in the default language or any other, is a warning from
    `analyzeProtocolLocalization` and never a validation error. The order of
    `locales` has no meaning, so nothing reads it.
  - Each value is an ICU MessageFormat message. A message may only be literal
    text unless its setting declares arguments (see the Family Pedigree's
    checklist wording): otherwise arguments, `plural`, `select`, number and date
    formats are refused, and markup is read as literal text everywhere. `escapeMessageText` turns plain
    text into such a message (escaping `{`, `}` and quoting apostrophes) and
    `messageText` turns it back, so an editor can show and save plain text.
  - Codebook node types, edge types and variables have only a `name`, which
    exports and rules use and participants never see. Text participants see
    belongs to the stage that shows it.
  - A Narrative preset's optional `highlight` is a list of
    `{ variable, label }`, where `label` is the localized text the preset
    switcher shows participants for that attribute.
  - A new `LanguageChooser` stage lets the participant choose among the
    protocol's languages.
  - Disease labels in a Narrative Pedigree stage must be unique in every
    declared language.
  - New exports: the `LocalizedString`, `LocalizedStringFormat`, `LocaleTag`,
    `LocalizationDeclaration`, `LocaleMetadata`, `ResolvedLocalizedString`,
    `ProtocolLocalizationWarning` and `LocalizedStringHit` types;
    `resolveLocalizedString` (takes the participant's languages in order of
    preference, the first being the language shown, and picks the best available
    translation: the first language or its closest related language, then each
    other language in turn, then the protocol's default language, then any
    language that has the text; it reports the language it found and how it found
    it);
    `selectProtocolLocale` and `normalizeLocalePreferences` (choose a protocol
    language from a list of preferences, in order, matching Chinese by script);
    `sortByLanguageName` (sorts any list of languages alphabetically by name,
    collated for the language its reader uses); `canonicalizeLocale`;
    `getLocaleMetadata` (a language's own name and text direction, with CLDR's
    English name and autonym standing in where the JavaScript runtime has no name
    for the language); `analyzeProtocolLocalization` (missing translations);
    `collectLocalizedStrings`; `escapeMessageText` and `messageText`;
    `escapeMarkdownText` (turns plain text into markdown that shows it as
    written).
  - A Network Composer form field is now a union on `component`, so its scale
    end labels are localized fields of their own. Its `label`, the caption
    participants read, is required and not blank, since the attribute's own
    label is not translated.
  - A form field's `prompt` is held to the same rule: every translation must
    contain text, so a translation of only spaces (or of invisible characters
    such as a zero-width space) is invalid, and one blank translation is an
    error rather than a gap the interview falls back over. A prompt is judged as
    written, so markdown that draws nothing from visible characters, such as
    `**` or `&nbsp;`, is not recognised as blank. New exports: `isBlankText` and
    `isBlankMessage`.

  Participant data files (rosters):

  - `validateNames` and the new `isUsableExternalAttributeName` accept any name
    the codebook allows once it is in NFC.
  - `readRosterCsv(text)` reads a CSV roster the way an interview loads it, and
    keeps a column called `__proto__` or `constructor`, or one whose name
    contains a dot, exactly as written. The package now depends on `csvtojson`.
  - `findRosterCharacterProblems(text, format)` finds characters XML 1.0 can't
    carry in a CSV or JSON roster, placed by column, row and cell, node and
    attribute, or line, so a host can refuse the file before it reaches an
    interview. Its types are `RosterCharacterProblem`, `RosterCharacterReport`
    and `RosterFormat`.

### Minor Changes

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

- 7d8e136: A schema 9 Ordinal Bin or Categorical Bin set to tap to place (`behaviours.interactionMode: 'select'`) can name the node being placed in its prompts. The prompt offers that node's label (`node.$label`) and attributes (`node.<id>`) under Contextual Attributes in Architect's insert menu, and the interview fills them in as the participant moves from node to node. Once every node is placed there is no node being placed, so the label can be missing there and the prompt needs an "If not known" version for it, which the interview shows at that point. A bin set to drag and drop still offers no node values, and neither does the label of a Categorical Bin's "other" bin, which is now stage text rather than a prompt.
- 8b35658: Ordinal and categorical bin stages can now be answered by tapping instead of
  dragging, which suits touch screens, switch access and participants who find
  dragging hard.

  **Protocols (`@codaco/protocol-validation`)**

  - Schema 9 bin stages accept `behaviours.interactionMode`, either `drag` (the
    default when it is left out) or `select`. Bin stages migrated from schema 8
    have no `behaviours`, so they keep drag and drop.

  **Interview runtime (`@codaco/interview`)**

  - In `select` mode one node in the drawer is shown as selected, and the
    participant taps the bin it goes in. The next unplaced node is then
    selected, until everyone has been placed. Tapping another node in the
    drawer, or one that is already in a bin, selects it instead, so it can go
    next or have its answer changed. Nothing can be dragged in this mode.
  - Screen readers announce who is being placed, and each bin is a button
    named after the person and the bin.
  - `node_binned` and `node_rebinned` analytics events carry the
    `interaction_mode`, and a `focal_node` event records each person shown.
    Both bins now work out whether a person is moving between bins from their
    stored answer, so a move made after coming back to the stage is recorded as
    `node_rebinned`, and an ordinal bin records `node_rebinned` at all.

  **Synthetic interviews (`@codaco/protocol-utilities`)**

  - `addStage` accepts `behaviours.interactionMode` for bin stages.

  **Architect**

  - Ordinal and categorical bin stages have a new **Placing nodes** section for
    choosing between drag and drop and tap to place.

- 8884dec: Ordinal and categorical bin stages can now require the participant to place
  every node before they move on. The setting is off by default, so existing
  stages behave as before.

  **Protocols (`@codaco/protocol-validation`)**

  - Schema 9 bin stages' `behaviours` object takes an optional
    `requireCompletePlacement`.
  - A bin stage with `requireCompletePlacement: true` needs an
    `unplacedNodesNotice`: the message the participant sees when they try to
    continue with a node still unplaced. Network Canvas supplies this text in
    English, German, Spanish, French, Italian, Dutch, Brazilian Portuguese and
    Simplified and Traditional Chinese, and `missingSuppliedStageText` seeds it
    like the other supplied stage wording. With the setting off, the notice is
    an inapplicable setting.

  **Interview runtime (`@codaco/interview`)**

  - With the setting on, Next is refused on each prompt until every node is in
    a bin, and the stage's notice is shown. Going back is never blocked. The
    refusal is recorded as a `stage_validation_failed` event of kind
    `unplaced_nodes`.

  **Synthetic interviews (`@codaco/protocol-utilities`)**

  - `addStage` accepts `behaviours.requireCompletePlacement` for bin stages.

  **Architect**

  - The **Placing nodes** section of both bin stage editors has a **Require
    every node to be placed** switch. Turning it on shows the participant's notice,
    filled in with Network Canvas's text. The protocol summary prints the
    notice.

  **Interviewer and Fresco**

  - Interviews follow the setting on stages that use it.

- 716e3d7: A Categorical Bin prompt can now show at most 10 bins, which is as many as the
  interview screen can lay out. The follow-up "other" bin counts towards the 10
  when it is turned on.

  **Protocols (`@codaco/protocol-validation`)**

  - Schema 9 rejects a Categorical Bin prompt whose attribute has more values
    than fit, counting the "other" bin when `otherVariable` is set. The limit is
    exported as `CATEGORICAL_BIN_MAX_BINS`.
  - An older protocol that goes over the limit can no longer be upgraded to
    schema 9. Remove values in Architect 8 first, then open it again.

  **Architect**

  - The Categorical Bin prompt editor shows an error once a prompt would draw
    more than 10 bins, and refuses to save it until values are removed. This
    replaces the earlier warning at eight bins.
  - When a list of attribute values has an error, the red outline around each
    value now follows its rounded corners instead of being cut off at them.

- dfcee00: Node types, edge types and attributes have only a name again. Architect no
  longer asks for a separate label when you create or edit one, because
  participants never see either. Where a stage does show an edge type to
  participants, the stage gives it its own translatable label: in a Narrative
  preset's legend, and in a Network Composer stage's toolbar. A node with no
  name is shown as "Unnamed".
- 9c1aeff: Architect can put values the interview fills in into participant text: for
  example the participant's name, a person's answer, the two people a census
  asks about, or today's date. Each text that accepts values has a syringe
  button in its toolbar, "Inject piped text from interview metadata or a
  network attribute", with a searchable menu that lists only the values
  available where that text sits. Typing `{` opens the same menu. A value that
  can be missing goes in with a version for when it is known and one for when
  it is not; in the editor it shows as its pill, and while it is selected its
  versions take the pill's place, one to a line, with the known version first.
  A version can be left empty, so that nothing is shown in that case; an empty
  version says "Shows nothing" in the editor. Inserting, removing and editing
  values can be undone and redone like any other edit. A choice or yes/no value
  can give the text one version for each answer, each on its own line; a yes/no value shows as words only once both of
  its answers have labels, so until then the menu lists it greyed out with a
  hint to add them (a Toggle, which has no labels, points to the
  different-wording entry instead). A number can give it a version for each plural form
  of the language. Values show as pills in the stage editors, the translation
  table and the protocol summary. A translation that leaves out a value is
  flagged with the value's name, and neither the table nor the stage editor
  will save it. Text that
  shows values a field cannot edit is shown as it is, with a note saying why.

  - `@codaco/fresco-ui`'s rich text editor opens its insert menu from an icon
    button (a syringe icon, named and tipped by the menu's label), and every
    placeholder pill, in the editor and in `TokenPill`, opens with the same
    icon, held on one line with the label's first word, and names its value in
    bold body type wherever it is shown; in the editor a pill shows a pointer. The editor accepts an insert menu (`RichTextInsertMenu`,
    whose items can be `disabled` with a description saying why), inline value
    pills, and a versions element for text with one version per case. The
    versions element shows as a pill (its optional `summary`, or its `label`)
    and, while it is selected (clicked, reached with the keyboard, or just
    inserted), shows its versions in the pill's place, one to a row in the
    order given, an empty one with a muted "Shows nothing" hint that is not
    saved. Enter or Space opens it, Escape folds it, and leaving the field
    folds it. A version's edits belong to the field's undo history, undone and
    redone from the version or the line around it, and choosing from the menu
    hands the caret back to the text. The editor keeps its history when a host
    passes the same placeholders in another order.
  - `@codaco/protocol-validation` exports `messageStructure` and
    `printMessageStructure`, which turn an ICU message into the tree of
    versions the editor shows and back, and `pluralValueExamples`, the plural
    categories a number answer can reach in a language, fractions included.
    It also exports `collectLocalizedStringsFromSchema`, which finds the
    localized strings of any value against the schema given, such as one
    stage against `stageSchema`.

- e749c06: Schema 9 stage text can show values from the interview, such as the participant's name, an attribute of the node a question is about, or today's date. A stage's `dynamicValues` binds each short argument name its messages use (`{partnerName}`) to a value: today's date (`now`) or an attribute of the participant (`ego.<id>`), the node or edge a form describes (`node.<id>`, `edge.<id>`), the two nodes a Dyad Census asks about (`dyad.source.<id>`, `dyad.target.<id>`) or a one-to-many census's focal node (`one_to_many.focal.<id>`). Each of those nodes can also be shown by its label (`node.$label`, `dyad.source.$label`, `dyad.target.$label`, `one_to_many.focal.$label`), as can the two nodes an edge form's edge joins (`edge.from.$label`, `edge.to.$label`): the text the interview shows on the node, chosen by its label rules and falling back to "Unnamed" in the participant's language, so it is never missing. A categorical, ordinal or boolean value's binding can name `cases` for its options.

  - Prompts, form field captions, introduction and panel text, Information screens (but not image descriptions), the anonymisation explanation and the finish screen's heading and text may show values. Stage labels, codebook text, `interfaceText` and wording Network Canvas supplies may not.
  - Each site shows only what is available there: the participant and today's date everywhere, the pair on a Dyad or Tie Strength Census prompt, the focal node on a one-to-many census prompt, the node being placed on a Geospatial prompt, and on a form field every attribute of the form's subject, including the question a Categorical Bin asks about a node put in its "other" bin. An edge form's fields, a Network Composer edge type's included, also show the two nodes the edge joins, by label only. `dynamicValueContextFor`, `dynamicValueArgumentsAt` and `dynamicValueStatus` give that table, and `findDynamicValueProblems` checks a protocol against it.
  - An attribute can always be missing, so it is shown only inside a version for when it has one: `{partnerName, select, missing {…} other {…{partnerName}…}}`. Versions can also follow a value's cases or, for a number, its plural category, chosen by the number with every digit it is shown with. `findDynamicValueProblem` is the one checker, given the text's language; text whose every version the values can reach shows nothing is refused. `dynamicMessageParts` gives the version a message reads for given values.
  - A translation must show every value the protocol's default-language text shows, in the same versions (`findMissingDynamicPlacement`). A plural category only one whole number selects may leave its number out.
  - A binding to an attribute that does not exist, or one that is encrypted, is an error at every text that uses it.
  - Text shows a yes/no attribute by its options' labels, so it can show one as words only when the attribute has a label for both yes and no; otherwise the text is refused with a message naming the attribute and asking for the labels (`dynamicValueUnshowableReason`). Text may still choose its wording by any yes/no attribute, including a Toggle, which never has labels. Bindings count as uses of their attribute in `collectEntityAttributeReferences`.
  - Interview metadata (IDs, start time, protocol name or hash, stage ID) is deliberately not available.
  - Text cannot contain U+E000, which the interview uses to place values (`DYNAMIC_VALUE_MARKER`).

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

- c058462: The screen that ends an interview is now part of the protocol. Researchers can
  write what participants read before and after they finish, translate it like
  the rest of the protocol, and choose how an interview that ends there is
  recorded: completed, ineligible, or ended early. That outcome is saved with each
  interview and exported. A finish stage either waits for participants to confirm
  or finishes the interview as soon as they reach it, and a protocol can end with
  several, such as a separate ending for participants who are not eligible.

  **Protocols (`@codaco/protocol-validation`)**

  - Schema 9 adds the `FinishSession` stage type, with a stage name, a `mode`
    of `confirmation` or `automatic`, the closing screen's Markdown (`content`,
    heading included, shown only in `confirmation` mode), the finished screen's
    Markdown (`finishedContent`), the Finish button label, confirmation question
    and failure message, and an `outcome` of `completed`, `ineligible` or
    `terminated`. It has no skip logic.
  - Every schema 9 protocol must end with a finish stage, and may end with
    several. Validation refuses a protocol with no stages, one whose last stage
    is not a finish stage, and any other stage after the first finish stage.
    `findTimelineStructureProblems` reports the same problems for a list of
    stages without validating the stages themselves.
  - The v8 to v9 migration appends a finish stage in `confirmation` mode, with
    id `finish` (or the next free `finish-2`, `finish-3`, …), outcome
    `completed`, and the text the interview has always shown there, in English under the protocol's default
    language. Its notes say so. A recorded interview that was on the old
    finish screen resumes on the new finish stage. Run again over a document
    already in schema 9 form, it keeps a finish stage the document already ends
    at, and gives one that has none the supplied text in the document's own
    languages.
  - A finish stage's name and text may have no translation at all while a
    protocol is being written, so a protocol in a language Network Canvas has no
    closing text for starts without any. `validateProtocol` still refuses a
    protocol whose finish stage has no finished text, or no closing text in
    `confirmation` mode, in its default language, with the issue code `finish_stage_text_missing`
    (`FINISH_STAGE_TEXT_MISSING`) naming what is missing. An editor passes
    `{ draft: true }` to allow it while the protocol is written.
    `findFinishStageTextProblems` reports the same problem without validating.
    Text made only of spaces or invisible characters counts as missing, and a
    translation of a finish stage's name or text that is given at all
    must not be blank, in any language and in a draft too.
  - `createDefaultFinishSessionStage`, `defaultFinishSessionText`,
    `defaultFinishSessionFields`, `hasDefaultFinishSessionText` and
    `withDefaultFinishSessionTranslation` supply that text in English, German,
    Spanish, French, Hungarian, Italian, Dutch, Brazilian Portuguese, and
    Simplified and Traditional Chinese.

  **Interview runtime (`@codaco/interview`)**

  - In `confirmation` mode the finish stage shows its closing text and a Finish
    button, which asks participants to confirm; once the interview is finished
    it shows the finished text. If finishing fails, the closing text comes back
    with an error toast. Participants can go back until they finish.
  - In `automatic` mode the interview finishes as soon as the stage is shown,
    and participants then see the finished text. They can't go back. If
    finishing fails they see the error with a button to try again.
  - No finish stage lets participants move forward. Finishing records which
    finish stage the interview ended at and its outcome.
  - **Breaking:** `onFinish` is now called as
    `onFinish(interviewId, { stageId, outcome }, signal)`. Hosts store both
    values and pass `finishStageId` back in `SessionPayload` when they reopen the
    interview.
  - A finished interview opens in its completed state: the finished text of
    the finish stage it ended at, with no way back into the interview. A host can add its own actions to it with
    the new `completedActions` prop. Review mode stops before the finish stage,
    and the stages menu no longer lists finish stages. A review of a protocol
    with nothing before its finish stage shows that stage's text read-only,
    with an **Exit review** button when the host passes `onExit`.
  - A host that lets a finished interview be changed passes the new
    `openFinishedAsActive` Shell prop. The interview then opens at its stages
    rather than in its completed state.
  - A finish stage with no text, which only an Architect preview of a protocol
    still being written can have, shows the Finish button alone.
  - `generateNetwork` leaves a completed synthetic interview on the finish
    stage its route reached, rather than one step past the last stage, and
    Fresco and Interviewer record that stage and its outcome.
  - Progress is 100% on every finish stage, not only the last one.
  - Skip logic that skips to the finish goes to the first finish stage after the
    stage that owns the rule. Skip logic can also name a later finish stage.

  **Exports (`@codaco/network-exporters`, `@codaco/shared-consts`)**

  - Each interview's outcome is exported: CSV ego files have a
    `networkCanvasFinishOutcome` column after `COMMIT_HASH`, and
    GraphML graphs an `nc:finishOutcome` attribute. **Breaking:**
    `InterviewExportInput` requires `finishOutcome`; pass `null` for an interview with no recorded
    outcome, whose CSV cell is then empty and whose GraphML attribute is left
    out. A variable exported under the column's name is renamed
    `networkCanvasFinishOutcome_2`, with a `'column-renamed'` warning.

  **Architect**

  - A new protocol starts with a finish stage, in each of its languages that
    Network Canvas has text for. The Finish Screen has its own editor, for its
    mode, closing and finished text, and outcome. More Finish Screens can be
    added from the New Stage chooser, and a skip rule can end the interview at
    any of them.
  - A protocol whose finish stage is missing text in its default
    language — a new protocol in a language Network Canvas has no text for, or
    text a researcher cleared — can be edited, saved and reopened, but not
    downloaded. The stage list says so, with a link to the finish stage's
    editor, and every download is refused with the same explanation.
  - Finish stages stay together at the end of the timeline: they can be
    reordered among themselves, but dragging one above the first finish stage,
    or another stage below it, stops at that point. A protocol's only finish
    stage can't be deleted. New stages are added before the finish stages.
  - Adding a language fills in the finish stage's text in that language while
    it is still the text Network Canvas supplied.
  - Finishing a preview shows the interview's completed state, with a button to
    start the preview again. The protocol summary prints the finish stage.

  **Interviewer**

  - A finished interview shows its completed state, with an **Exit** button. The
    outcome and finish stage are saved with the session (encrypted when the
    vault is on) and exported.

  **Fresco**

  - The `/interview/finished` page is gone: a finished interview's link shows
    its completed state, including to a participant who returns to it. That
    page is sent without the interview's answers or the protocol's resources,
    and nothing on it is saved back to the interview.
  - With **Freeze Completed Interviews** off, a researcher who opens a finished
    interview can still change it, as before. With it on, they see the completed
    state.
  - Each interview's finish stage and outcome are stored and exported, and
    included in the interview API. Interviews finished before this upgrade have
    no outcome.
  - The finish request must name a finish stage of the interview's protocol and
    its outcome.
  - The cookie that limits a participant to one interview per protocol now holds
    the finished interview's id. The browser no longer lets scripts read it, and
    it is sent only over HTTPS when the session cookie is (in production, unless
    `COOKIE_SECURE` says otherwise).
  - The dashboard's progress counts the finish stage as a stage.

- 1432069: When Fresco cannot upgrade a protocol made with an older version of Network Canvas, it now reports it to analytics both as a refused protocol and as an application error, so failed upgrades can be counted and fixed. Damaged files are still reported only as refused protocols. Nothing is reported when analytics are disabled, and no protocol names or contents are sent.

  For developers: `@codaco/protocol-validation` exports `toReportableProtocolError`, which copies an error that failed to open or upgrade a protocol without its message, keeping its name, its stack frames and its cause chain, so it can be sent to exception tracking without quoting the protocol.

- db8a2af: The interview shows less built-in text, and some of it reads more
  consistently:

  - In Family Pedigree, the answers to the sex assigned at birth question and
    the kinds of parent a participant chooses from now show the labels the
    protocol's codebook gives them, so a researcher can reword and translate
    them like any other protocol text. The choice of a biological parent who
    carried the pregnancy uses the protocol's label for a biological parent.
    Since participants choose from these answers, none of their labels may be
    blank. Architect fills those labels in for each of the protocol's
    languages that Network Canvas has wording for, when the attribute is
    created and when a language is added, and gives a default language it has
    no wording for the English labels. The supplied English label for a donor
    is now "Egg or sperm donor".
  - When a researcher changes the language a protocol's text is recorded as,
    or chooses another default language, text Network Canvas supplies and the
    researcher has not changed (the finish screen's text and the Family
    Pedigree answer labels) becomes the supplied text for the language chosen,
    so a protocol upgraded as English and corrected to German reads the German
    text.
  - The button that confirms finishing the interview says "Finish", like the
    button that opens the confirmation.
  - Several buttons and messages now use one wording instead of two: "Pause
    automatic layout" and "Resume automatic layout" on the Sociogram, "Enter
    your passphrase" in Family Pedigree, "Zoom in" and "Zoom out", "Nothing
    matched your search term." on the Geospatial search, and the same Cancel,
    Save, Back, No and loading text the rest of the interview uses.
  - The debug-information button no longer repeats its own label as a tooltip.
  - A stage name made only of spaces is no longer valid, so the interview never
    needs a name of its own for an unnamed stage.
  - `ResizableFlexPanel` breakpoints no longer take a `label`, which nothing
    read. A caller that passes one must remove it.

- 7fa80c2: The Language Chooser stage's heading is now part of the protocol. A new stage
  starts with "Choose a language" in each of the protocol's languages that
  Network Canvas has wording for, and the researcher can reword and translate it
  in the stage's Participant wording section in Architect. The interview shows
  the stage's heading, in the language the participant has chosen.
- 630410b: `@codaco/protocol-validation` now exports the version 9 protocol schema as a named value, `ProtocolSchemaV9`, alongside the type of the same name. In `@codaco/fresco-ui`, the `options` prop of `RichSelectGroup` and `ToggleButtonGroup` is now optional, which matches how both components already behaved: without options they render an empty group.
- 0e9243e: A question on a Family Pedigree stage's person form can be worded for the
  participant when it is about them: "Are you still living?" for the
  participant, and "Is this person still living?" for everyone else in their
  family.

  **Protocols (`@codaco/protocol-validation`)**

  - A dynamic value can read `node.$isParticipant`, whether the node a Family
    Pedigree person form is about is the participant. It is offered only in
    that form's questions, is never missing, and only chooses wording: its
    binding has the one case `participant: true`, and everyone else takes the
    `other` version. It can never be shown as words.
  - Exports `dynamicValueParticipantPathFor`, `dynamicValueParticipantRolesAt`
    and `PARTICIPANT_CASE`.

  **Interview runtime (`@codaco/interview`)**

  - The Family Pedigree person form tells its questions whether the person is
    the participant, so the right version shows. `useProtocolForm` takes
    `isParticipant` for this.

  **Architect**

  - In a Family Pedigree person form question, the insert-a-value menu lists
    **Participant or someone else** under Contextual Attributes. It inserts
    one version of the text for the participant and one for everyone else. The
    participant marker attribute stays in the menu too.
  - The CEGRM template's living-status and birth-year questions use it in
    place of the participant marker attribute.

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
- 2e44834: Schema 9 requires every stage id to be between 1 and 128 characters, so a protocol that validates can always be stored by hosts such as Studio.
- 069c9d0: The screen error message, the interview text shown when a task cannot be
  displayed, can now be formatted. Architect's translation table edits it with
  the rich text editor, so a researcher can add bold or italic text, lists and
  links, for example to a page where participants can get help. The interview
  and the printable protocol summary show it formatted. The wording Network
  Canvas supplies, and the wording of protocols upgraded from schema 8, reads
  as before.

  For developers: the schema 9 `interfaceText.messages.stageError` is a
  localized markdown string, and an interface text entry may declare its
  `format`.

- 3810333: Interview sessions are now migrated together with the protocol they were
  recorded against. `migrateProtocolWithSessions` returns the migrated protocol
  together with a migrator for the sessions recorded against the original. When
  a migration step adds, removes or reorders stages, the migrator moves each
  session's stage metadata and resume position with their stages, matched by
  stage id: a session resumes at the same stage, or at the next one when its
  stage was removed, and never at a stage inserted before its own. A step that
  changes how a session represents its data declares a session step beside its
  protocol transform, and the migrator runs it. Each migrated session is checked
  against the current network and stage metadata schemas. A session that cannot
  be migrated is reported, never thrown, with a reason; the new
  `stages-unmatched` reason covers a step that changes the number of stages of a
  protocol whose stages have no unique ids.
- 20cd773: Words that several interfaces show in the same way are now worded once for the
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

  - These words come from the protocol's interface text, falling back to the
    interview's own catalog. The Family Pedigree's twin question uses the same
    Don't know answer as its other questions.

  **Architect**

  - These words are reworded and translated with the interview's other shared
    words, under Buttons, Messages and a new Search group, rather than in each
    stage's editor. The Sociogram editor no longer has a Words on the canvas
    section.

### Patch Changes

- 1d2b623: Architect's fields for wording that runs to a sentence or more, such as the
  message a Finish Screen shows when finishing fails, now wrap onto more lines
  as the text grows, instead of hiding the end of it past the edge of a
  one-line box. This covers the Finish Screen's confirmation question and
  failure message, the Family Pedigree's hints and descriptions, the notices and
  error messages on name generator, bin, geospatial and network composer
  stages, and an image or video's description.

  The guidance under a Family Pedigree's name question can now be formatted in
  bold or italics, like a form field's hint, which it is shown as.

- e31a3c9: In the Family Pedigree, more answers saved by mistake can now be corrected without deleting anyone. The newest answer wins:

  - Recording, when adding a parent or connecting two people, that someone carried the pregnancy (a Surrogate included) is no longer unavailable when another parent is recorded as having carried it. That parent is left with nothing recorded about carrying.
  - Choosing a biological parent or donor while a biological parent with the same sex at birth is recorded is no longer unavailable. The form asks how the participant would define that parent's relationship instead.
  - Answering that two twins are identical gives both of them the same biological parents and donors, where that is possible.

  A hint under the answer says what choosing it will change, and Undo reverses it once saved. The question about a parent's kind now reads "How would you define “Julie”’s relationship to you?" instead of "Julie is your…". The stage wording gains `carrierReplaced`, `geneticParentReplaced` and `identicalTwinSharesParents`.

- ab9a884: In the Family Pedigree, a sex at birth saved by mistake can now be corrected from the person's own panel. Previously a parent recorded as having carried the pregnancy could not be changed to male, and a genetic parent could not be given the same sex at birth as the other genetic parent, so swapping two parents' answers meant changing a relationship first. Now the newest answer wins: every sex at birth stays available, and saving one that contradicts another record clears that record so it can be answered again. The record that the person carried a pregnancy is removed, and the other genetic parent's sex at birth is cleared. The hint under the field says what saving will change before the participant saves, and Undo reverses it. Only a surrogate still cannot be recorded as male. The stage wording `unavailableSameSexAsCoParent` is replaced by `sexChangeClearsCoParentSex` and `sexChangeEndsCarrying`, and `unavailableCarried` now applies only to surrogates.
- 0336cf4: In a family pedigree, a question limited to people of one sex assigned at birth
  no longer shows a note under the family tree saying who can't be selected. The
  people it leaves out are still shown unavailable. The note's wording setting is
  gone from Architect and from the schema 9 Family Pedigree stage.
- 6cc9d9d: The Family Pedigree's add-person steps no longer pre-select any answer: the kind of parent, child or sibling, the other parent, whether two people are still together, shared parents and twins all start unanswered. A step's button reads "Skip" only while nothing on it is answered, and "Continue" once anything is. The "Some details are missing" notice is removed, along with its `missingDetailsList` wording. When participants add their own child, the step-child, donor and surrogate options now say "you" ("A child you carried as a surrogate"), through a new `isYou` argument on the `childKindSocial`, `childKindDonor` and `childKindSurrogate` wording.
- 72b189a: In the Family Pedigree, twins share one carrier: answering who carried one twin answers it for the other, and the add-child and add-sibling forms now require "Who carried the pregnancy?" to be answered. Continue on a step with a required question left unanswered now shows the same error Save does, instead of doing nothing visible. When participants add a partner, "Are they still together?" names the person ("Are they still together with “Dina”?"). Two people recorded as female and male at birth are not offered as identical twins. Questions no longer put a possessive after a quoted name ("Are they a twin of “Cara”?" instead of "Are they “Cara”’s twin?"). A new sibling who would not share the person who carried someone cannot be their twin. When editing someone's twins, a twin recorded with a different sex at birth from another twin already answered identical cannot be identical too, since all of them would then be identical. Editing someone no longer offers as their twin a sibling someone else carried, and adding a sibling checks "Yes, identical twins" against the sex at birth of every twin identical to the person. Whoever is recorded as carrying one twin counts as having carried them all, so adding or connecting a parent cannot record someone else as carrying another twin. When someone recorded as male at birth cannot be a surrogate, the hint gives only that reason, not also who else carried the pregnancy. Adding a parent asks whether they carried the pregnancy only once their kind of parent is chosen. `validateField` in `@codaco/fresco-ui`'s form store takes a `showErrors` option that marks the field touched so its error shows.
- 40ff4e9: The schema 9 upgrade notes Architect shows before upgrading a protocol are
  shorter and plainer, in every supported language. Related changes are
  grouped under one heading, so the notes about text that may no longer be
  empty and the notes about the Family Pedigree each appear as a nested list.
  The heading above each schema version's notes now reads "Changes in schema
  version {version}:".
- 01189fd: Clearer German, Spanish, French, Italian, Dutch, Brazilian Portuguese and
  Chinese wording for the schema 9 text. Every translation added since the last
  release was checked by blind back-translation and adversarial review, and
  fixed where it read differently from the English: participant messages now
  use the polite form throughout in Chinese, the pedigree uses the same words
  for relatives in the editor as in the interview, and several labels no longer
  read two ways.
- Updated dependencies ([15155f3](https://github.com/complexdatacollective/network-canvas-monorepo/commit/15155f30295aadbf41691556a7251685b392ee52), [4de3f45](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4de3f45c1ecc06799211c41c1d72cee8fce7aa10), [2ff161c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2ff161cd71741a8405cef57ac08aa5b5b8ac9fd0), [2729855](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2729855a94c6a71f68283236ddb3c5810f1b6638), [43ffe6f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/43ffe6f1680658ff475ed51bc924557f282afbd8), [c058462](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c0584624345133246137fb4effff9920fce288ff), [2408129](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2408129ceb43de2d91a0365e966cffa462afc6d0), [08d76d8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/08d76d8da691c536eecbb252b7f1960a79321216), [151e511](https://github.com/complexdatacollective/network-canvas-monorepo/commit/151e511823d3cf083db2d2bb8e98c740cb9c657d), [cad7309](https://github.com/complexdatacollective/network-canvas-monorepo/commit/cad7309fa78cb2609416f1f445fdc4ad8ffcf226))
  - @codaco/app-i18n@0.4.0
  - @codaco/shared-consts@7.0.0

## 15.0.0

### Major Changes

- 216e8c4: Architect, Interviewer and Fresco now download only the interface language you
  are using, instead of every translation at once. English needs no download at
  all, and starting in another language fetches that one language before the
  first screen appears, so the interface never shows English first and then
  switches. Changing language loads the new one and then switches over, keeping
  the current language on screen in the meantime. If a language cannot be
  downloaded, the app keeps working — in English at startup, or in the current
  language after a switch — and a notice names the language that could not be
  loaded and offers to reload; the language still switches in by itself if a
  later attempt succeeds. In an interview the same notice appears without the
  reload. Installed offline copies of Architect and Interviewer still hold every
  language, so switching works without a connection. A Fresco interview in
  another language now arrives with its messages, so it opens without waiting for
  a download, and Architect's preview and Interviewer fetch the interview's
  language while they prepare it rather than afterwards.

  Breaking: each package's catalog map is replaced by per-locale loaders.
  `commonCatalogs`, `frescoUiCatalogs`, `interviewCatalogs`,
  `networkExporterCatalogs`, `protocolUtilitiesCatalogs` and
  `protocolValidationCatalogs` become `commonCatalogLoaders`,
  `frescoUiCatalogLoaders`, `interviewCatalogLoaders`,
  `networkExporterCatalogLoaders`, `protocolUtilitiesCatalogLoaders` and
  `protocolValidationCatalogLoaders`: for each translated locale, a function that
  dynamically imports that locale's catalog. Combine them with
  `createCatalogSource(...)` from `@codaco/app-i18n/locales`, then either
  `await source.load(locale)` before rendering or pass the source to
  `useLocaleCatalog` from `@codaco/app-i18n/react`, which feeds
  `AppI18nProvider`. `loadCatalog(locale, ...loaders)` loads and merges one
  locale where no source is needed, and `checkCatalogLoaders` in
  `@codaco/app-i18n/catalog-guards` checks that every committed catalog has a
  loader that loads it. `InterviewI18nProvider` from `@codaco/interview` now
  suspends while the catalog for a language it has not shown yet loads, so a
  host that renders it directly needs a `Suspense` boundary above it; `Shell`
  brings its own and shows a spinner in the interview's frame meanwhile.

  A catalog that cannot be loaded no longer reaches an error boundary.
  `useLocaleCatalog` falls back to English for a first load, or keeps the current
  language for a switch, and returns the `failure`; pass it to `AppI18nProvider`
  as `loadFailure`, and read it anywhere below with `useLocaleLoadFailure()`.
  `@codaco/fresco-ui/LocaleLoadFailureToast` presents it as a toast that stays
  until the language arrives, with an optional `onReload` button and an
  `onFailure` callback for error reporting. A fresco-ui toast with both a
  description and an action button no longer pushes the button out of view.

  `Shell` takes an optional `catalog`, and the new `@codaco/interview/catalog`
  entry, which carries no React and can be imported on a server, exports
  `loadInterviewCatalog(requestedLocale, localePreference)`: it negotiates as
  `Shell` does and resolves to the `catalog` to pass, so a server-rendered host
  can deliver the interview's messages with the page and a client host can start
  the download before mounting `Shell`.

### Minor Changes

- c5dc35b: Architect's stage editors now reach the protocol they edit through an
  in-process Effect rpc host instead of an oRPC router. Nothing about editing
  changes: locks, refusals, undo and imported resources behave as before.

  `@codaco/protocol-validation` exports `isSafeAssetSource`, the predicate
  `assetSourceSchema` applies to an asset's `source`, so a host that validates
  with a different schema library can apply the same rule.

- 08fd0f7: Brazilian Portuguese (Português (Brasil), `pt-BR`) is now available as an
  interface language in Architect, Interviewer and Fresco, alongside English,
  Spanish and Simplified Chinese. Choose it from the language setting, or let it
  be selected automatically when your browser prefers Portuguese. The built-in
  interview controls participants see are translated too; protocol content keeps
  the language it was written in.
- ee4ad52: Dutch (Nederlands, `nl`) is now available as an interface language in
  Architect, Interviewer and Fresco. Choose it from the language setting, or let
  it be selected automatically when your browser prefers Dutch, whether from the
  Netherlands or Belgium. The built-in interview controls participants see are
  translated too; protocol content keeps the language it was written in.
- bff61d5: French (Français, `fr`) is now available as an interface language in
  Architect, Interviewer and Fresco, alongside English, Spanish and Simplified
  Chinese. Choose it from the language setting, or let it be selected
  automatically when your browser prefers French — including Canadian, Belgian
  and Swiss French. The built-in interview controls participants see are
  translated too; protocol content keeps the language it was written in.
- 62617a9: German (Deutsch, `de`) is now available as an interface language in Architect,
  Interviewer and Fresco, alongside English, Spanish and Simplified Chinese.
  Choose it from the language setting, or let it be selected automatically when
  your browser prefers German, including the Austrian and Swiss variants. The
  built-in interview controls participants see are translated too; protocol
  content keeps the language it was written in.
- 5b12f3b: Italian (Italiano, `it`) is now available as an interface language in
  Architect, Interviewer and Fresco. Choose it from the language setting, or let
  it be selected automatically when your browser prefers Italian. The built-in
  interview controls participants see are translated too; protocol content keeps
  the language it was written in.
- f32135f: Simplified Chinese (简体中文, `zh-Hans`) is now available as an interface
  language in Architect, Interviewer and Fresco, alongside English and Spanish.
  Choose it from the language setting, or let it be selected automatically when
  your browser prefers Chinese. The built-in interview controls participants see
  are translated too; protocol content keeps the language it was written in.
- e5f6a9a: Traditional Chinese (繁體中文, `zh-Hant`) is now available as an interface
  language in Architect, Interviewer and Fresco, written in Taiwan-standard
  vocabulary. Choose it from the language setting, or let it be selected
  automatically: browsers set to Chinese for Taiwan, Hong Kong or Macau now get
  Traditional Chinese instead of Simplified Chinese, while other Chinese browser
  languages still get Simplified Chinese. The built-in interview controls
  participants see are translated too; protocol content keeps the language it
  was written in.

  Chinese browser languages are now matched by script rather than by region.
  `resolveAppLocale` in `@codaco/app-i18n` maps each Chinese tag to its script
  first, so Hong Kong (`zh-HK`) and Macau (`zh-MO`) resolve to Traditional
  Chinese even when the browser also sends a generic `zh`, which previously won
  Simplified Chinese. `@codaco/shared-consts` exports the rule as
  `toScriptMatchingTag`, which the website uses too. A registry that declares a
  regional Chinese tag such as `zh-TW` exactly still receives that tag.

### Patch Changes

- 56e16d0: Update third-party dependencies to their latest minor and patch releases, including Base UI 1.8, React Aria Components 1.21, Tiptap 3.31.4, Mapbox GL 3.32, Motion 13.4, Lucide 1.49, the Inclusive Sans and Nunito variable fonts 5.3, PostHog, Prisma 7.10 and Electron 43.7.
- 3093df5: Network Composer stages now require their layout variable to be a layout
  variable and their convex hull variable to be a categorical variable. A protocol
  that points either setting at a variable of another type fails validation
  instead of letting the interview write layout or group data over unrelated
  answers.
- 3093df5: A name generator prompt's additional attributes must now be boolean variables.
  Previously a hand-edited protocol could point one at a text, number or
  categorical variable — including an encrypted one — and adding a node to the
  prompt would overwrite that answer with true or false. Migrating a protocol to
  schema 8 removes any additional attribute that targets a non-boolean variable
  and adds a migration note saying so.
- Updated dependencies ([08fd0f7](https://github.com/complexdatacollective/network-canvas-monorepo/commit/08fd0f7dc2c1a7b757b2caf64ae68aacaaf31572), [ee4ad52](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ee4ad52b14e081d25f883d9d170454932749d5ab), [489bf51](https://github.com/complexdatacollective/network-canvas-monorepo/commit/489bf5173aad4d29e79c6a2a29d018223e369031), [bff61d5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bff61d58f17fbb7b021e6591da9575ed4c12cc16), [62617a9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/62617a9c21d7e6e200adc162417090a522fac1e6), [5b12f3b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5b12f3b977d4244c398301541d978d825f53ea13), [216e8c4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/216e8c4e1cc63357f121d65150851536996ef3af), [f32135f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f32135fd036f07157198728377dfdbeb30dff747), [e5f6a9a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e5f6a9ac0760f4a67ba353996b43327a5d1b0855))
  - @codaco/app-i18n@0.3.0
  - @codaco/shared-consts@6.2.0

## 14.0.0

### Major Changes

- e322f90: Open a protocol whose resources are missing, and never write one that is

  A protocol whose archive was missing one of its files could not be opened at
  all, in any version of Architect. Architect now opens it, says which resources
  are missing, and offers to add the files from Resources — every stage, prompt
  and variable in it stays exactly as it was. Interviewer and Fresco still refuse
  such a protocol, because a resource that never loads would surface to a
  participant mid-interview.

  Downloading a protocol whose resources cannot all be read is now refused rather
  than quietly producing a file without them. That file could not be opened
  anywhere: dropping a resource left the stages that used it pointing at nothing.
  Nothing is lost by refusing — the protocol stays in your library exactly as it
  was, and the message names the files to restore.

  A protocol archive whose contents are damaged is now described as damaged,
  instead of falling back to "could not be opened". The message shown when a
  protocol refers to a file it does not contain names the resource as you named
  it, rather than its internal filename.

  Opening a protocol that turns out to be damaged, unreadable, or too old to
  upgrade is no longer recorded as an application error by Architect or Fresco.
  Those are answers about the file, and recording them buried the failures that
  are real faults; the kind of problem is recorded instead, which also keeps your
  own resource names out of analytics.

  Fresco now reads archives through the shared reader, so the limit that protects
  against a maliciously compressed protocol applies to its imports too, and its
  media is resolved against the manifest that shipped inside the archive.
  Interviewer reads a pending protocol's name under the same limit.

  **Breaking (`@codaco/protocol-validation`):** `extractProtocol` and
  `extractProtocolFromZip` no longer throw when the manifest names a file the
  archive does not contain. They return it in a new `missingAssets` array and
  leave the policy to the host; call `missingAssetsError` to raise the refusal
  runtimes share. Also adds `createNetcanvasReader`, for hosts that read
  `protocol.json` and the media separately under one shared inflation limit,
  exports `getProtocolFileErrorKind` for classifying a failure without formatting
  a message, and adds `unreadable-entry` to `MalformedNetcanvasReason`.

### Minor Changes

- 4ea797d: Export `assetSourceSchema`, the rule an asset manifest entry's `source` is
  already validated by: a filename with no path separators and no `..`, because
  that string becomes a zip entry name when a protocol is exported. A host that
  stages a file can now refuse an unsafe name where the file arrives, rather than
  accepting it and producing a protocol that cannot be published.
- d7e93c5: `schemaRefusesContainer` answers whether a container an editor has ASSEMBLED —
  out of one person's edit and another's, neither of them wrong on its own — is
  one the stage schemas refuse. It is for the places whose members constrain each
  other without being rivals, which the exclusive-variant answer cannot help with:
  a sociogram prompt's `edges` says which edges to draw and which the participant
  may create, and an `edges` setting neither has no effect, so the schema refuses
  it. One researcher stops offering edge creation while another stops drawing the
  edges, and a merge that keeps each of their decisions produces a prompt neither
  of them held.

  Writing the container whole, the way a variant travels, would throw away exactly
  the collaboration that merging property by property exists to keep. So the
  container is assembled as before and then put to the schema, and only a refusal
  changes the answer.

  Which containers those are is read off the stage schemas rather than listed
  beside them, so a stage type that gains a rule about two of a container's
  members together is covered without anything else being remembered. Every schema
  declared at a path is consulted, because a caller holding a stage's fields does
  not know which stage it has: a prompt row is `prompts.*` whether it belongs to a
  sociogram or a name generator, and a container is called refused only when no
  stage type's schema for that path can read it.

- 55f5549: `isExclusiveVariantContainer` answers whether a place in a stage document holds
  one of several mutually exclusive shapes — a sociogram's background, which is an
  image or a number of concentric circles and never both; a family pedigree's
  framing; the destination a skip-logic rule jumps to. An editor that writes part
  of such a container while somebody else switches which shape it is would leave a
  protocol carrying half of each, so an editor can now ask, and write the whole
  container instead.

  The answer is read off the stage schemas themselves rather than from a list kept
  beside them, so a stage type that gains a variant is covered without anything
  else being remembered. A path may run through a list, naming its rows with the
  exported `VARIANT_ROW_SEGMENT`: a sociogram prompt's highlight is a variant too,
  and a merge that puts a rewritten row back property by property can leave half
  of each shape there just as readily.

  One path is deliberately unanswered, because the stage types disagree about it:
  a categorical bin's prompt row is itself a choice of shape, and every other
  stage type's prompt is an ordinary row. A caller holding a stage's fields cannot
  tell which it has, so neither answer is given.

- 2bea7ee: State what kind of value each filter operator compares against once, and
  export it. `FilterOperandKinds` maps every operator to `none`, `number`,
  `integer`, `string` or `attribute`, and schema 8's filter-rule validation now
  reads that table instead of keeping three private operator lists of its own.
  `filterValueSchema` is exported alongside it, so a protocol builder can choose
  each operand's input control from the same statements the validator applies
  rather than from a second list that could drift.

  Two rule-value verdicts change with it. A comparison value may now be a
  fraction: `filterValueSchema` previously required whole numbers, which left a
  scalar attribute — recorded as a normalised 0-1 reading — with no expressible
  comparison beyond the two ends of its scale, and rejected an ordinary
  `hours > 2.5` rule against a number attribute. The four operators that count
  SELECTED OPTIONS still require a whole number, and now say so: a fractional
  count is reported as an issue rather than stored as a rule that can never be
  satisfied.

  Each operand kind is applied by `filterRuleSchema` itself rather than by the
  protocol schema's cross-reference pass, so validating a bare filter through the
  exported `FilterSchema` or `filterRuleSchema` reaches the same verdict as
  validating the protocol it sits in — a fractional count is refused either way,
  where before only the whole-protocol path asked. `FilterSchema` is one object
  with a check on it instead of a union of a one-rule and a several-rule shape:
  it accepts and refuses exactly the same filters, but a rule that broke both
  shapes used to be reported as a single "Invalid input" against the whole
  filter, discarding the reason the rule was refused.

  Nothing here asks whether a rule's operand is one of the options its attribute
  authored. That check stays out of this validator on purpose: protocols already
  in the field hold rules naming an option a collaborator has since renamed or
  deleted, and refusing to LOAD one would lock the researcher out of the very
  editor that could fix it. Whether an operand is still one of the attribute's
  options is an editor rule, reported on the rule by the protocol builder.

  `collectEntityTypeReferencesFromSchema` is exported alongside the existing
  `collectEntityTypeReferences`, which now calls it. It takes any fragment of the
  schema and any value shaped like it, so a caller holding one stage rather than
  a whole protocol — a stage editor — can ask which codebook node and edge types
  that stage names, and get every field the schema tags as an entity-type
  reference instead of the two or three paths the caller happened to know about.
  It is the entity-type counterpart of the `collectEntityAttributeReferencesFromSchema`
  that was already exported.

- f84eb32: `MINIMUM_VARIABLE_OPTIONS` is now exported: the fewest options a categorical or
  ordinal variable may hold, which the variable schema itself enforces. Editors
  that refuse a list with too few values can read it instead of repeating it.
- eee19fb: Export `collectStageReferences` and `declaredStageReferenceSites`, the stage
  counterpart of the entity-attribute, entity-type and asset collectors: every
  other stage a protocol's stages name — a skip-logic destination, the
  FamilyPedigree a NarrativePedigree describes the people of — discovered from
  new `stageReference` tags on the schema rather than from a hand-kept list of
  paths. A host deciding whether a stage may be removed can now derive its
  dependants from the schema, so a stage type that gains a pointer at another
  stage is covered the moment its schema is tagged instead of the removal
  silently leaving a protocol that names a stage it no longer has.
- 3ae3a94: Provide optional localized researcher guidance with complete Spanish catalogs:
  protocol import failures, migration approval notes and validation conflicts, synthetic generation
  refusals, and export progress. Applications can present this guidance in the
  active language while keeping existing technical diagnostics, event identifiers,
  and generated interview data unchanged.

  Synthetic generation guidance covers both `generateNetwork` and the public
  `SyntheticInterview` builder, including fixed-value conflicts and unsupported
  participant uniqueness rules.

  Protocol validation also exports `parseAcceptLanguage` for HTTP hosts to parse
  canonical, quality-ordered browser preferences through the shared locale
  negotiation flow.

### Patch Changes

- 02ead76: Declare `jszip` as a runtime dependency. The published bundle still inlines it,
  so a published install keeps working with nothing extra to fetch, but the
  package's type surface imports it and workspace consumers that compile this
  package from source resolve its imports themselves — including under a
  production install (`pnpm deploy --prod`), which installs only `dependencies`.
- eea0b5a: "External-data panel filters cannot use edge rules" is now stated by the stage schema instead of the whole-protocol one, so a host validating a single stage — a stage editor checking the stage it is saving — refuses the panel at that moment rather than letting it through until the whole protocol is validated. `stageSchema` reports it at the stage-relative path `panels.<i>.filter.rules.<j>.type`. The message and the protocol-level path `stages.<n>.panels.<i>.filter.rules.<j>.type` are unchanged, as is which panels the rule refuses: only one reading an imported file, never one reading the interview network itself.
- 01aaed2: Use `libro de códigos` for the codebook throughout the Spanish catalogs.
- Updated dependencies ([026b518](https://github.com/complexdatacollective/network-canvas-monorepo/commit/026b5188636452e20570bb4c15e055c8d6d000e8), [2eafe92](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2eafe92060cd4aa1dbcde5c2b79d00d87bba9159), [b2ca402](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b2ca402a852b5527e0455c7ff2949da3be50dccd), [9d9f310](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9d9f310867e490c073374df20689def7be163f47))
  - @codaco/app-i18n@0.2.0
  - @codaco/shared-consts@6.1.0

## 13.0.1

### Patch Changes

- b387946: Exclude schema-invalid asset-reference values from the collected asset usage index.

## 13.0.0

### Major Changes

- c599dac: This release improves the reliability, accessibility, and recovery of protocol editing in Architect.

  - Stage edits are now transactional: cancelling restores Codebook changes, incomplete settings remain open with actionable errors, and Information blocks retain their drafts while switching media types.
  - Forms, rule builders, the Codebook, timeline, dialogs, and resource library now provide accurate labels, keyboard operation, focus restoration, and layouts that work on smaller screens. Undo and Redo operate one change at a time without recording no-op edits.
  - A second tab now shows a read-only protocol instead of accepting changes it cannot save. Closing the editing tab restores editing from the saved copy, and deleting a protocol clears its history and releases associated resources.
  - Protocol names, resource cards, variable identifiers, and stage editors are bounded on narrow screens. Duplicate resource filenames are distinguishable without changing the names stored in the protocol.
  - Invalid imports, blocked edits, migration conflicts, preview completion, and deleted protocol routes now explain what happened and provide a safe recovery path.
  - Recent protocols in the library now show their description, and starter templates show their stage, node type, and edge type counts.
  - The CEGRM starter template now uses an available color for its Narrative Pedigree condition. Protocol colors are constrained to typed node, edge, ordinal, or categorical palette references; Narrative Pedigree and Geospatial resolve those references through the active theme. A protocol created from the previous release's CEGRM template will report a validation error on its condition color — open the stage editor and select one of the available colors to fix it. A downloaded protocol file with this problem must be corrected before it can be imported again. Neutral dialog actions remain distinct from white dialog surfaces.

### Minor Changes

- e9a6522: Protocol validation now catches references and variable uses that could previously produce missing or conflicting interview data.

  - Form fields cannot write the same variable twice, and Family or Narrative Pedigree attributes cannot be overwritten by incompatible prompts, diseases, or interactions.
  - Pedigree prompts, forms, and diseases now resolve their Codebook references during validation rather than failing silently during an interview.
  - Prompt sort orders and roster display, search, and sort variables are included when collecting Codebook usage.
  - Asset references are derived from schema metadata through the new `collectAssetReferences` helper.
  - Malformed `.netcanvas` archives now produce structured `MalformedNetcanvasError` failures, with `loadNetcanvasArchive` and `describeProtocolFileError` available for actionable import messages.
  - The pedigree value sets a protocol must carry — `RELATIONSHIP_TYPES`, `GAMETE_ROLES`, `BIOLOGICAL_SEX_VALUES`, their option lists, `FRAMING_IDS`, and `INHERITANCE_PATTERNS` — are now defined and exported here rather than in `@codaco/shared-consts`. They live inside the schema version that defines them, so editing shared constants can no longer change what a released schema accepts.
  - Protocol colors must be palette references. Narrative Pedigree disease colors and Geospatial map colors no longer accept raw or empty strings, and disease colors must name one of the eight available node colors.
  - Migrating a version 7 protocol now wraps node colors 9 and 10 (which the classic Architect palette offered) onto the eight-color palette, so those protocols import successfully instead of failing validation.
  - Migrating a version 7 protocol whose forms collect the same attribute twice keeps the first field and removes the repeat — the repeated field never collected anything of its own — and the upgrade notes disclose the change.

  Protocols containing one of the newly detected problems may now be reported as invalid even though the underlying problem was already present. This includes protocols whose pedigree option sets were edited away from the canonical values, protocols with duplicate form fields, protocols with an empty panel data source, and protocols using an unavailable or raw disease or map color — including protocols created from the CEGRM starter template as previously released. The remedy is to correct the protocol in Architect's editor (for example, by re-picking the disease color). An exported `.netcanvas` file containing one of these problems cannot be imported until it is corrected, because import validates before anything is stored.

### Patch Changes

- Updated dependencies ([e9a6522](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e9a652266ef9ddfa7fc42de1c8123bd7011c52a1), [fdb3b56](https://github.com/complexdatacollective/network-canvas-monorepo/commit/fdb3b56440f6cad89a44718d24ff725be3bb5e15))
  - @codaco/shared-consts@6.0.0

## 12.1.1

### Patch Changes

- fec9536: Add a Colored Eco-Genetic Relationship Map (CEGRM) template for families living with an inherited condition. It combines a family pedigree with the participant's wider social network, records relationship closeness and contact frequency alongside exchanges of information, practical help, emotional and spiritual support, and closes on a visual map and an inheritance view.

  Treat the Family Pedigree node label as a validated codebook field, apply its rules to every family-member name entry point, and expose those rules beside the label-variable selector in Architect. Keep the iconically rendered ego node outside label and additional family-member form collection, including in synthetic previews. Reduce the default synthetic Sociogram edge density so preview networks remain legible as their node count grows.

  Keep optional unique fields empty without false duplicate errors, scope comparison rules to the active field namespace, and prevent dormant or duplicate pedigree name controls from affecting validation.

## 12.1.0

### Minor Changes

- b777dc1: Attribute-writing schema references are now classified by whether the interview applies the variable's validation rules when writing (`validatedAttribute`) or writes directly without them (`unvalidatedAttribute`). This includes Network Composer group and lasso membership changes through `convexHullVariable`, which write values without field validation. A new `findVariableRoleConflicts` export (with `collectVariableRoleHits`) reports any variable written by both classes for the same subject, so editors can surface the conflict. The v7→v8 migration now marks every variable referenced as a CategoricalBin `otherVariable` or NameGenerator `quickAdd` target as `required`, preserving the effective behaviour of migrated protocols now that those inputs honour configured validation instead of a hard-coded requirement.
- 8b660f5: Contradictory variable validation rules are now unexpressible. The schema
  rejects inverted `min`/`max` pairs, `minSelected` above the option count,
  `sameAs`+`differentFrom` naming one target, comparator structures no data can
  satisfy (impossible cycles, comparisons inside a `sameAs` group, comparisons
  with disjoint bounds), cross-type validation references, count-valued rules
  below their floors, and malformed or inverted DatePicker `min`/`max`
  parameters. Required text and categorical variables also cannot set their
  maximum answer size to zero. The v7→v8 migration strips or normalises all of
  these in existing protocols (see the migration notes). Protocols already at
  schema version 8 that carry a contradiction will now fail validation — the
  interview forms they produced were already unsubmittable.

  Three further unanswerable configurations are rejected for the same reason: a
  Network Composer form listing one variable in two fields (both fields render
  under the same form value), a Network Composer field whose input control
  cannot render its variable's type (for example a date picker on a numeric
  variable), and a boolean variable whose `options` list is empty (the control
  renders no choices at all). The migration removes an empty boolean `options`
  list so existing protocols keep the standard Yes/No choices.

  The contradiction check now also evaluates the participant-facing controls on
  Ego, node, edge, name-generator, and Family Pedigree forms. Its date reasoning
  recognises stable single-value coarse picker windows, equality forced by
  non-strict comparisons between full-date fields, and singleton values that
  propagate through a chain of `differentFrom` rules.

### Patch Changes

- b777dc1: The Categorical Bin "other" input and the Name Generator quick-add field now apply the referenced variable's configured validation rules, exactly as form fields do — including context-dependent rules such as `differentFrom` and `unique`. The Network Composer's add-node input applies the quick-add variable's codebook rules in the same way, a behaviour change for existing protocols whose quick-add variable carries validation. Previously these inputs ignored the codebook and enforced only their local requirements. In native v8 protocols, both Categorical Bin "other" and Name Generator quick-add are optional when their referenced variable has no required validation. The v7→v8 migration adds `required: true` to variables referenced by either writer, preserving existing protocols' required responses while retaining their other validation rules. Variables without an explicit input `component` work correctly. After a valid Network Composer node is added, its quick-add field now resets its value and validation state so the fresh blank entry does not announce a required-field error.

  Network Composer also waits for a quick-add node to finish being stored before
  clearing and reopening the input, preventing two rapid submissions from
  bypassing uniqueness validation against the first node.

  The Categorical Bin dialog registers its response under the referenced
  codebook variable ID, so a sibling variable literally named `otherVariable`
  cannot be mistaken for the live response by cross-variable validation.

  Deferred invalid-field focus now remains safe when its form unmounts before
  smooth scrolling finishes.

- 7cffcc9: Synthetic interview data now respects the validation rules configured on your variables.

  Previously, generated networks ignored the rules a protocol author sets in Architect, so previewing a protocol or bulk-generating interviews could produce data a participant could never have entered — names shorter than a required minimum length, numbers outside their permitted range, dates outside a date picker's window, duplicate values on a variable marked unique, or a "start date" later than the "end date" it is required to precede. Generated values now satisfy required, minimum/maximum length, minimum/maximum value, minimum/maximum selected, unique, same as, different from, and the greater/less than (or equal to) cross-variable comparisons, as well as the bounds a date picker or relative date picker imposes.

  Where rules refer to one another, generation follows that order, so a variable compared against another is filled in after the variable it depends on.

  If a protocol's rules cannot all be satisfied at once — for example a minimum length greater than its maximum length, a permitted range with no values in it, or a variable required to be both unique and drawn from fewer options than there are entities to fill — generation is now refused with a `SyntheticDataConstraintError` that names the variable and describes the conflict, instead of silently producing data that could never be collected. `SyntheticDataConstraintError` and the `ConstraintConflict` type it carries are exported from `@codaco/protocol-utilities`.

  When skip logic and filtering are respected, controls on stages proven unreachable no longer create synthetic-data rendering conflicts with reachable Network Composer stages.

  Read-only stage references no longer make validation rules apply to values written only by binning stages. Writers on stages proven unreachable by skip logic are likewise ignored consistently by both the feasibility check and the synthetic draw.

  Manually seeded nodes and edges keep omitted Boolean attributes at the neutral
  `false` value regardless of how the control's options are ordered.

  When multiple reachable Network Composer stages render one date variable at the
  same resolution, generation now uses the intersection of their accepted
  windows. It refuses only controls at incompatible resolutions or controls whose
  windows do not overlap. When an ordinary form also renders that variable,
  generation includes its codebook control in the same intersection.

  Categorical Bin "other" inputs must now target a text variable, matching the
  text field the interview renders. Importing a version 7 protocol removes an
  incompatible non-text "other" configuration instead of preserving a control
  that cannot record the target variable's value.

  `@codaco/fresco-ui` adds a `./form/validation/helpers` export subpath so consumers can build the same validator stack the interview uses. `@codaco/interview` now fails loudly, naming the variable, when a protocol carries a validation rule of the wrong type, rather than passing it to a validator that would report a generic error.

- Updated dependencies [59625a8]
- Updated dependencies [efc3a92]
  - @codaco/shared-consts@5.6.0

## 12.0.0

### Major Changes

- 9c25292: `validateProtocol` now returns a domain-owned `ProtocolValidationResult` instead of Zod's `SafeParseReturnType`. The result envelope is unchanged (`{ success: true, data }` / `{ success: false, error }`), but on failure `error` is now a `ProtocolValidationError` — an `Error` subclass carrying `issues: ProtocolValidationIssue[]` (`{ code, path, message }`) whose `message` renders the issues as a readable `path: message` list. `ProtocolValidationResult`, `ProtocolValidationIssue`, `ProtocolValidationError`, and `formatProtocolValidationIssues` are all exported.

  No changes are needed if you only read `result.success`, `result.data`, `result.error.message`, or the `code`/`path`/`message` fields of `result.error.issues`. Code relying on Zod specifics must migrate: `error instanceof z.ZodError` checks, `error.format()`/`error.flatten()`, per-code issue fields (`expected`, `received`, `minimum`, …), or narrowing against Zod's literal issue-code union. The CLI prints the formatted issue list on failure.

  Internally, entity-reference collection no longer touches Zod's private `zod/v4/core` internals; schema traversal now uses only Zod 4's public API.

### Minor Changes

- c8c4614: Scalar (visual analog scale) variables no longer accept the `minValue` and
  `maxValue` validation rules.

  A scalar response is recorded on a normalised 0-1 scale, and these rules are
  integers — so the only pair they could express on that scale was `{0, 1}`, the
  scale it already has. Anything else silently redefined the variable's range
  through a validation rule, which the interview then forwarded onto the slider's
  rendered track without adjusting its step or value formatting. Validation now
  rejects either rule on a scalar, migrating a protocol to schema 8 removes them
  (preserving the requiredness a `min*` validator used to imply), and the
  interview no longer derives the slider's bounds from validation.

  Number variables are unaffected, and scalars keep `required` and the comparison
  rules, which compare two scalars on the same scale.

  Also adds a `VARIABLE_TYPE_VALIDATIONS` export: the record of which validation
  rules each variable type accepts. Every variable schema now picks its
  `validation` shape from this record, so an authoring UI can build its per-type
  rule list from the same source rather than maintaining a parallel copy.

## 11.12.0

### Minor Changes

- c2a8700: `generateNetwork` now takes a single parameter object — call
  `generateNetwork({ codebook, stages, ...options })` instead of passing the
  codebook and stages as positional arguments. This is a breaking change.

  It can also build name generator stages from real roster data. Pass parsed
  roster nodes via the new `externalData` option, keyed by stage id, and roster
  and roster-panel stages draw their people from those rows — preserving each
  row's primary key and attributes — instead of inventing people from the
  codebook. Draws are without replacement across prompts and stages, mirroring the
  runtime's global exclusion of rows already in the network. A stage with no entry
  still falls back to codebook-generated people. A roster that loads but contains
  no rows — or whose panel filters out every row — now generates an empty roster
  stage instead of inventing people, matching a live interview that would offer
  nobody to add; only a missing or unreadable roster falls back to fabrication. A new `config` option exposes the
  generation-tuning defaults (the roster-versus-fabricate ratio, node counts, edge
  probabilities, and so on) so callers can override them. FamilyPedigree stages
  now mark exactly one generated node as ego, matching the runtime convention,
  instead of randomising the ego flag across every node.

  `@codaco/interview` now exposes its roster-parsing pipeline from the `./contract`
  entry: `collectRosterExternalData` gathers a protocol's roster nodes keyed by
  stage, and `parseExternalNetworkAsset` and `filterExternalPanelNodes` parse and
  filter individual roster assets. This is the exact code the interview runtime
  uses, so a host reads roster assets identically to a live interview.

  `@codaco/protocol-validation` now exports a `StructuralCodebook` type for
  consumers that assemble or receive a codebook before schema validation.

  Roster rows parsed by `@codaco/interview` are now identified as
  `subjectType_contentHash` instead of a bare content hash. A roster file that
  backs more than one node type (say, a shared address book used by both a
  person stage and a place stage) previously produced the same primary key for
  matching rows under each type, an invariant violation once both ended up in
  the same network. This is a breaking change: sessions saved by earlier
  versions will not re-associate their roster people after upgrading.

### Patch Changes

- 47dda6b: Migrating a protocol from schema 7 to schema 8 now repairs several legacy shapes that schema 8 would otherwise reject, so older protocols import cleanly instead of failing validation:

  - External-data side panels no longer keep edge rules, which can never match on an external data source; these rules are stripped during migration.
  - Filters with more than one rule but no join are backfilled to `OR`, matching the query runtime's default.
  - Form fields bound to a non-renderable variable (a layout or location variable) are dropped, and any form left with no fields is removed.

  Shape-to-variable mappings on node types are now recorded as variable references, so where-used reporting and dangling-reference validation account for them.

## 11.11.0

### Minor Changes

- c7e767c: Add image backgrounds to Narrative stages and keep canvas background images fully visible and centred in every layout.

## 11.10.0

### Minor Changes

- 34d2bfd: Align schema 8 with the fields Architect has always required, so a protocol
  that validates is a protocol that renders correctly:

  - Information stages require a `title` (the page heading).
  - Name Generator forms require a `title` (the add-a-person dialog heading).
  - Sociogram and NetworkComposer stages require a `background`, which must be
    exactly one of an image or a concentric-circles count (zero or more; 0
    renders no rings). Narrative stages require a concentric-circles `background`
    (it has no image variant).
  - OrdinalBin prompts require a palette `color`.
  - CategoricalBin prompts with an "other" option require both the bin label and
    the follow-up prompt; a lone empty-string `otherVariable`, or an "other"
    label/prompt set to an empty string without one, is now rejected too.
  - A Sociogram prompt with highlighting enabled must name the variable to
    toggle, and an `edges` object must set `create` and/or `display`.
  - A codebook variable referenced by a form field must define a `component`
    (input control) — previously a missing one crashed the interview when the
    form rendered.
  - Free-text fields the editor already requires are now required (non-empty) in
    the schema too: a prompt's `text`, a form field's `prompt`, an introduction
    panel's `title`/`text`, an Information item's `content`, a Narrative preset's
    `label`, a side panel's `title`, a FamilyPedigree `censusPrompt`, an
    Anonymisation `explanationText`, a NarrativePedigree disease's `label`/`color`,
    and a NameGeneratorRoster `dataSource` and `searchOptions.matchProperties`.

  The conditional rules are also encoded in the inferred TypeScript types: the
  background is a two-variant union (image or circles), and checking a Sociogram
  prompt's `highlight.allowHighlighting` or a CategoricalBin prompt's
  `otherVariable` narrows the dependent fields to present, so consumers need no
  runtime fallbacks or non-null assertions.

  Protocols migrating from schema 7 are backfilled with the value the interview
  already displayed (stage label or "Information", "Add {node type}", 4 rings,
  the first palette color, "Other"/"Please specify"); empty required text is
  backfilled from a natural source where one exists (a form field's prompt from
  its variable name, a panel title from the stage label) or a plain default
  otherwise, so migrated interviews look identical. Synthetic interviews seed the
  default background for canvas stages.

## 11.9.0

### Minor Changes

- b467615: Add forward skip destinations to schema 8, shared skip evaluation, synthetic
  network generation, and the interview runtime. Hidden stages can now continue
  at a later stage or route to the interview finish screen, with live route
  recalculation, safe Back navigation, and confirmed one-screen overrides for
  unavailable stages.

  Also keep shared Select fields correctly labelled and contained when option
  labels are long. The bundled sample protocol now ends the interview when a
  participant declines consent.

### Patch Changes

- 367e702: Harden protocol import/validation and make interview autosave failures recoverable:

  - **Zip-bomb protection:** `extractProtocol` now caps the _actual_ inflated output incrementally as it decompresses, instead of trusting the archive's declared uncompressed size. A crafted `.netcanvas` (deflate bomb) can no longer exhaust memory; the new `NetcanvasInflationLimitError` is thrown when the limit is exceeded.
  - **Locked value sets** (biological sex / gamete role / relationship type) are now enforced for read-only **ordinal** variables, not only categorical ones, so their canonical options can't be silently altered.
  - Form-field and composer-field schemas tolerate a persisted stable `id`, so editors can keep durable field identity across reorder and delete.
  - **Autosave durability:** the interview sync middleware no longer advances its "last synced" marker before the write resolves. A failed autosave (e.g. a locked vault or storage quota) is now retried on the next debounce instead of silently dropping just-added network data.

- e6c58c2: Validate Family Pedigree ego identifier variables against the configured node type.
- c16a1d9: Emit NodeNext-compatible relative module specifiers in generated declaration files so TypeScript consumers can resolve package types without a bundled declaration rollup.
- 803e4e7: Tighten two schema-8 coherence gaps where silently-ignored configuration was accepted:

  - OrdinalBin `prompts[].color` is now restricted to the ten `ord-color-seq-1`–`ord-color-seq-10` palette values the interface can render; any other string was a silent no-op. The v7→v8 migration drops out-of-palette values so migrated prompts fall back to the default colour.
  - CategoricalBin `otherOptionLabel` or `otherVariablePrompt` set without `otherVariable` is now rejected; without `otherVariable` no 'other' bin renders, so the properties were silently ignored. The v7→v8 migration drops the orphaned properties.

- Updated dependencies [179952e]
  - @codaco/shared-consts@5.5.0

## 11.8.1

### Patch Changes

- 272c1b2: Harden protocol validation and synthetic-network generation.

  `@codaco/protocol-validation`: asset `source` is now constrained to a safe
  filename (no path separators or `..`), so a malformed protocol can no longer
  carry a path-traversal entry name into an exported archive. `NameGeneratorRoster`
  now reuses the shared name-generator node-count bounds (`minNodes`/`maxNodes`
  lower bounds and the `maxNodes >= minNodes` check) instead of accepting
  unbounded values. Codebook variables gain an optional `readOnly` flag for
  system-managed variables, and a protocol-level check validates that Family
  Pedigree's locked value sets keep their canonical options. A new
  `extractProtocolFromZip` export lets a caller that has already parsed a
  `.netcanvas` archive extract from it without re-parsing.

  `@codaco/protocol-utilities`: `generateNetwork` clamps the requested node range
  so an inflated `minNodes` with no `maxNodes` can no longer produce an inverted
  range (previously this threw and left synthetic preview loading forever).

## 11.8.0

### Minor Changes

- 38aff29: Add `collectEntityTypeReferences`: every codebook node/edge type referenced by
  a protocol, discovered from schema-level `entityTypeReference` tags — the
  entity-type counterpart of `collectEntityAttributeReferences`. Covers stage
  subjects (including the Network Composer's per-edge-type entries), edge
  creation/display prompt settings, the Family Pedigree node/edge configs, and
  filter rules. Architect's codebook usage detection now derives node/edge type
  usage from this instead of hand-maintained path lists, so new stage types are
  covered automatically — and types referenced only by filters now correctly
  count as in use.
- 37006d0: Refine the Architect stage editors for the Family Pedigree and Narrative Pedigree interfaces.

  **Family Pedigree editor**

  - The fixed-framing selector is now a styled select, and the framing section explains what the gamete-based and gendered framings mean in neutral, non-normative terms.
  - Boundary options no longer use "family tree" (always "family pedigree"), explain what off/recommended/required do, and rename "Require Children Contributors" to "Require Co-Parents' Families". Both boundary fields are now required in the editor so a missing value surfaces as a named issue rather than a raw schema error.
  - Fixed a bug where changing the node type cleared the stage-level `framing`, `boundaries`, and `introScreen`, producing a schema error on finish. A seam test now guards the preserve-list against the schema's required fields.
  - The intro screen is now built on the Information content-item model — reorderable text and asset sections instead of a single title/text/video block. The `introScreen` schema field changes from `{ title?, text, videoAssetId? }` to `{ items }`, and the Information item renderer is extracted to a shared `ContentItem` component reused by the pedigree intro step. The intro-screen title field is removed.
  - Node and edge configuration panels split their columns evenly (50% variable column), give variable pills a white background, and edge-type items render on a darker surface to stand out from the panel. Edge configuration explains why the interface needs an edge type, and the gamete-role variable now uses predefined read-only egg/sperm options (shared via `GAMETE_ROLE_OPTIONS` in `@codaco/shared-consts`) in the same way as relationship type.
  - Nomination prompts show an empty-state message when no prompts exist yet.

  **Narrative Pedigree editor**

  - Corrected the new-stage dialog tags: Narrative Pedigree (read-only) is tagged Display Data only; Family Pedigree gains Capture Edge Attributes.
  - The At-Risk Statuses explanation moves from the section side column into the main column and is formatted with subheadings and lists.

- fd2a7e2: Family Pedigree redesign (three features):

  - **Configurable FamilyPedigree framing** — swappable parent terminology (gamete-based "Egg/Sperm Parent" vs gendered "Mother/Father"), either researcher-fixed or participant-chosen; an optional video+text intro step; and two author-set boundary rules (require grandparents; require children's genetic contributors). Persists `gameteRole` as a network edge variable and captures biological sex for non-parent people.
  - **Interface fixes** — "Add sibling" is now always discoverable (rendered disabled with an inline hint when it cannot apply, keeping the shared-parent rule), plus first-cousin representation/creation demonstration stories.
  - **Narrative Pedigree** — a new read-only interface that renders a captured pedigree, computes faithful Mendelian carrier/at-risk status per disease (autosomal dominant/recessive, X-linked recessive/dominant, Y-linked, mitochondrial, multifactorial), highlights a focal node's affected genetic lineage under participant-switchable presets, renders status as edge stickers or classic pedigree notation, and exports a PNG snapshot.

- a171f96: Unify the Sociogram and Narrative stage behaviours into a single shared schema, and flatten the `automaticLayout` behaviour to a plain boolean (was `{ enabled }`). The Narrative interface gains a configurable `automaticLayout` behaviour (a force-directed layout that positions nodes). It is only active when explicitly enabled, so existing protocols keep their hand-authored static layouts; new Narrative stages created in Architect enable it by default. The v7→v8 migration flattens any existing Sociogram `automaticLayout` value.
- 3218905: Rework the Network Composer editor: consolidated Node Configuration section, multi-select Edge Configuration with per-edge-type attribute lists, and editable attributes whose input control is configured on the stage (and rendered in the side panel) rather than the codebook variable. Each editable attribute also carries an optional `label` that captions the field in the side panel, falling back to the variable's name when unset.
- 0f577dd: Add the **Network Composer** stage type — a free-form, single-screen, promptless
  canvas for building a whole personal network in one place (create nodes, draw
  multiple edge types, capture node and edge attributes, group nodes into convex
  hulls, reposition, and delete, with undo/redo and lasso selection).

  - `@codaco/protocol-validation`: a new additive schema-8 `NetworkComposer` stage
    (no version bump, no migration) with cross-reference validation of its
    `quickAdd` / `layoutVariable` / `nodeForm` / per-edge-type form references, and
    a `superRefine` check rejecting duplicate edge subject types (edge types and
    node attributes are both optional). Automatic layout uses the shared flat
    `behaviours.automaticLayout` boolean (as the Sociogram and Narrative do); for
    NetworkComposer it is only the starting default. An optional
    `convexHullVariable` names a single categorical node variable whose values are
    drawn as convex-hull groups.
  - `@codaco/interview`: the `NetworkComposer` runtime interface, reusing the shared
    canvas, edge layer, and force-directed auto-layout engine. Nodes are added by
    name from a field in the tool palette and laid out on a grid; in edge mode the
    first node tapped enters a linking state and the edge tool adopts that edge
    type's colour. Selecting a node or edge opens a resizable, backdrop-less
    right-hand drawer that leaves the canvas interactive; it edits the entity's
    attribute form (saving valid edits automatically, with no Save button) or shows
    an empty state when there is nothing to edit. When a `convexHullVariable` is
    configured its hulls are always drawn (reusing the Narrative hull layer), and
    group membership feeds the layout's group-cohesion force so same-group nodes
    cluster under automatic layout. Nodes are grouped with the Groups tool (pick a
    group in its popover, tap nodes to toggle membership) or by lasso-selecting in
    select mode and choosing which group to add the selection to. Automatic layout
    is an interview-time toggle whose live value is persisted in stage metadata, so
    the participant's choice sticks across navigation; Architect only sets its
    default.
  - `@codaco/shared-consts`: a `NetworkComposer` stage-metadata shape storing the
    participant's automatic-layout choice.
  - `@codaco/fresco-ui`: the `SegmentedToolbar` gains a `menu` segment (a button
    that opens a single-select menu) and a `popover` segment (a pressed-able button
    that anchors arbitrary popover content), and a vertical toolbar now opens its
    tooltips, menus, and popovers to the right (into the canvas); `Popover` accepts
    a `side` prop.
  - `@codaco/interview`: the NetworkComposer tool palette is built from the shared
    `SegmentedToolbar` — a Select tool, an Add-node button whose popover holds the
    name field, an edge tool that opens a menu of edge types, an automatic-layout
    toggle, and undo/redo.

- 7970d1f: Refine the Family Pedigree and Narrative Pedigree interfaces.

  **Narrative Pedigree** defaults to a plain pedigree with no status markers. The key panel lists the conditions and explains what each status symbol means; selecting a condition from that list switches to a single-condition view, drawn in that condition's colour in standard pedigree notation. Any person can be made the focal point once a condition is shown: the pedigree then keeps the relatives who contribute to that person's inheritance at full strength and fades everyone else by blending them toward the background, with a "Clear focus" control to return to the whole family. The fixed preset/behaviour configuration is removed from the stage (schema 8). The snapshot control (a camera action) produces a printable document — the whole pedigree at natural size on a white background with dark labels, a heading generated from the shown condition and any focal person, and the symbol key.

  Narrative Pedigree also gains a researcher option, **"Show possible (at-risk) statuses"**, which defaults to off. When off, the pedigree shows only certain statuses; the inferred at-risk markers (may develop / may carry / may be affected, including the more-seriously-affected homozygous marker) are hidden from the people, the key panel, and the screen-reader summary. When on, those markers are drawn. The genetics engine is unchanged — this is a display gate intended for clinician-directed use.

  **Family Pedigree** intro is simplified: the language selector now uses the standard rich option group with plain-language wording ("Mother & father" listed first), and the separate "biological parents" explainer step is folded into the editable Information step (pre-filled in Architect, so researchers can reword it, remove it, or add a video). The in-wizard intro screen renders its explanation as markdown, with any headings kept beneath the dialog's own heading level. When the framing is a participant choice made partway through the quick-start wizard, the choice is now reflected in the following step titles (e.g. "Mother"/"Father"), not just their body text.

  Both pedigree interfaces now render only the alters placed on the pedigree. The interview network is one shared graph, so an alter nominated in a later stage can share the pedigree's node type; the views scope themselves to the pedigree's committed private membership (its stage metadata) and fall back to node type only when no membership has been recorded.

  **Biological sex** is now asked consistently and sensitively wherever a person is added, through one shared field: "What sex was this person recorded as at birth?" (or "…were you…" for the participant), with a one-time explanation that it is for inheritance, not gender identity, and a required answer whose options are Female, Male, Intersex or a variation in sex characteristics, Don't know, and Prefer not to say. The participant's **own** biological sex is now captured (an "About you" step) — previously it was never asked, so the participant dropped out of their own sex-linked risk. The genetics engine drives transmission from Female/Male only; the other values propagate as uncertainty but are stored distinctly. When adding a child, the "who provided the egg/sperm" questions now read in the chosen framing (e.g. "Who is the biological mother/father?" under the mother/father framing), and the two contributors are pre-selected from the parents' biological sex where it can be inferred (with same-sex couples prompting for the donor/carrier), always overridable.

  Biological sex is now stored as a node attribute on **every** pedigree member, so it is a first-class part of the interview network and a researcher can drive node shape from it (or leave shape free for a construct such as gender identity). People who are not asked directly are inferred from their reproductive role — an egg provider is recorded female, a sperm provider male, a gestational carrier female — falling back to Don't know. In Architect, the biological-sex variable is created pre-seeded with the canonical value set, locked so it cannot drift from what the interview and engine expect.

  The Narrative Pedigree genetics changes (inheritance-aware focal highlighting) require research-team sign-off before merge.

- c56b75a: Stage labels are now required to be non-empty. The schema-8 stage `label` is
  validated as a required, non-empty string, and the v7→v8 migration backfills any
  stage with a missing, empty, or whitespace-only label with a positional default
  ("Stage 1", "Stage 2", …) so existing protocols upgrade cleanly.

### Patch Changes

- Updated dependencies [37006d0]
- Updated dependencies [fd2a7e2]
- Updated dependencies [0f577dd]
  - @codaco/shared-consts@5.4.0

## 11.7.0

### Minor Changes

- dd13556: Tighten the protocol schema and add migrations to fix conformance gaps found in a release audit of the interview module:

  - Reject form fields that reference a variable with no renderable `component` (or a `layout`/`location` variable).
  - Validate that a NameGeneratorQuickAdd `quickAdd` references an existing text variable on the subject node type.
  - Require `otherOptionLabel` when a CategoricalBin prompt sets `otherVariable`.
  - Add prompt/parameter validation: `highlight.variable` must be boolean, `layout.layoutVariable` must be a layout variable, RelativeDatePicker `before`/`after` must be non-negative with an ISO `anchor` (they are independent opposite-direction offsets — earliest = anchor − before, latest = anchor + after — so there is no `before < after` constraint), non-empty ordinal/Likert options, and external-data panel rule targets.
  - Remove the vestigial Information `loop` flag, with a migration dropping it from existing protocols.
  - A `minValue`, `minLength`, or `minSelected` validator no longer implies a field is required. A migration sets `required: true` on every existing codebook variable (node, edge, or ego) that has one of these validators without an explicit `required: true`, preserving the effective behaviour of protocols authored before the change.

  Further schema tightening and migrations from the medium/low conformance audit:

  - Variables: ordinal/categorical option lists require at least two options and may no longer use boolean values (a migration coerces legacy boolean values to strings); ordinal variables no longer accept `minSelected`/`maxSelected`; `encrypted` is permitted only on node text variables (rejected on other node types and on all ego/edge variables); ego variables may not declare `unique` validation. Migrations strip the now-invalid properties from existing protocols.
  - Forms: Alter/AlterEdge/NameGenerator forms require at least one field; the unused `form.title` on EgoForm/AlterForm/AlterEdgeForm is dropped by migration.
  - Filters & skip-logic: empty `rules` arrays are rejected (and dropped by migration); operator-by-type / value-type validation now also runs on `skipLogic.filter` and `panels[].filter`; ego rules are rejected inside a stage node/edge filter; attribute-less ego type-level rules are rejected.
  - Stages: OrdinalBin/CategoricalBin prompt variables must be of the matching type; NameGeneratorRoster `dataSource` must reference a `network` asset; Geospatial `tokenAssetId`/`dataSourceAssetId` must resolve to correctly-typed assets, its prompt variable must be `location`, and `targetFeatureProperty` / apikey value must be non-empty; CategoricalBin requires `otherVariablePrompt` when `otherVariable` is set (backfilled by migration); a contradictory NameGenerator min/max-nodes `behaviours` block is normalised by migration; a Sociogram prompt may not set both `edges.create` and `highlight` (migration drops highlight); Information `size` is restricted to an uppercase enum applied to image/video items only (migrated); FamilyPedigree nomination prompts may not reuse the reserved `scaffolding` id or duplicate prompt ids.
  - Codebook: variable record-keys must be unique across entity types.

- 8be592d: Store categorical attribute values consistently as arrays of selected option values.

  Previously the CategoricalBin interface wrote a bare scalar while CheckboxGroup / ToggleButtonGroup wrote arrays, and consumers carried bridging helpers to tolerate both shapes. Categorical attributes are now always arrays (a single selection is a one-element array), and the bridges have been removed:

  - `interview`: `CategoricalBin` writes a single-element array; the node-shape resolver, categorical sorter, and bin matcher read the array contract directly.
  - `network-query`: `EXACTLY` / `NOT` use deep equality and `OPTIONS_*` use array length — the scalar-categorical fallbacks (`categoricalEqual`, scalar `optionsLength`) are gone.
  - `network-exporters`: `isCategoricalOptionSelected` checks array membership only.
  - `shared-consts`: `VariableValue` types categorical as an array of option values.
  - `protocol-validation`: the v7→v8 migration wraps existing scalar categorical filter / skip-logic rule operands (`EXACTLY` / `NOT` / `INCLUDES` / `EXCLUDES`) in a single-element array.
  - `interview` (FamilyPedigree): the `relationshipType` edge variable (a categorical) is now written and read as a single-element array, conforming to the contract so its values export and query correctly.
  - `shared-consts`: adds the canonical `RelationshipType` type and `RELATIONSHIP_TYPE_OPTIONS`, shared between Architect (which locks the categorical edge variable's options) and the FamilyPedigree interface so they cannot drift.

  Collected interview networks holding scalar categorical values must be migrated by the host application (tracked for Fresco).

- 545edda: Make the v8 schema the single source of truth for entity-attribute (codebook variable) references.

  Fields that hold the id of a codebook variable are now tagged at their schema definition with `entityAttributeReference({ subject, requireType? })`, which brands the field type and records how to resolve the variable's subject. A new `collectEntityAttributeReferences(protocol)` walker derives every reference — with its resolved subject and any required type — directly from the tagged schema, and `validateProtocol` uses it to check that each referenced variable exists on its subject and is of an allowed type. This replaces the hand-placed existence checks that were duplicated across `superRefine`, removing the drift that previously let a variable referenced only by certain validation rules be reported as unused (and invalid references slip through). The walker tolerates structurally-invalid stages/filter rules so references inside in-progress protocols are still detected.

  New public exports: `collectEntityAttributeReferences`, `asEntityAttributeReference` (the brand-boundary constructor for building branded reference values), and the `EntityAttributeReferenceHit` type.

### Patch Changes

- d0ca1be: Fix two NameGeneratorRoster bugs and remove a dead schema field.

  - **Roster cards no longer show a raw UID.** When the name heuristic could not
    resolve a label for an external-roster node (e.g. the asset came from a
    preview interview export whose attribute keys are variable UUIDs absent from
    the running codebook, or the subject has no populated text variable), the
    card title fell back to the node's content-hash `_uid` — an opaque "random
    ID". The new `resolveRosterNodeLabel` falls back to the first usable
    attribute value, then to a stable `Unnamed {subject} {n}` placeholder.
  - **DataCards shrink to fit narrow panels.** `GridLayout`'s
    `repeat(auto-fill, minmax(Npx, 1fr))` forced columns to at least `minItemWidth`
    even in a narrower container, so a single roster card overflowed its panel at
    the default resizable width (observed on iPad), breaking drag-and-drop. The
    column floor is now `min(Npx, 100%)` so a lone column shrinks to fit.
  - **The roster panel can't be resized narrower than a card.** `ResizableFlexPanel`
    gains an optional `minSizePx` (a hard pixel floor for the first panel, enforced
    by the resize hook and a CSS backstop). NameGeneratorRoster sets it to the card
    width plus chrome, so the resize handle stops before a card would overflow.
  - **Removed the unused `cardOptions.displayLabel`.** It was introduced in the v8
    schema but was never read by any application (legacy or current) and cannot be
    set in Architect. Dropped from the schema, the `protocol-utilities` types, and
    the `SyntheticInterview` builder.

- Updated dependencies [8be592d]
  - @codaco/shared-consts@5.3.0

## 11.6.1

### Patch Changes

- Add `hashProtocol(protocol)` export — content-only hash of `{ codebook, stages }` for cross-package protocol identification (dedup, analytics, migration). Computed via ohash.

## 11.6.0

### Minor Changes

- Add `VariableOption` and `VariableOptionValue` exports, derived from the existing `VariableOptions` (`z.infer<typeof categoricalOptionsSchema>`):

  ```ts
  export type VariableOption = VariableOptions[number];
  export type VariableOptionValue = VariableOption["value"];
  ```

  Consumers that previously hand-rolled equivalent shims (`@codaco/interview`'s `utils/codebook.ts`, `@codaco/protocol-utilities`'s `types.ts`) should import from here instead. Both shims have been deleted in their respective packages' next releases.

## 11.5.0

### Minor Changes

- Add `hashProtocol(protocol)` export — content-only hash of `{ codebook, stages }` for cross-package protocol identification (dedup, analytics, migration). Computed via `ohash`.

## 11.4.0

### Minor Changes

- f1dbd8d: Add node shape support with variable-to-shape mapping. NodeDefinition now includes a required `shape` field with a default shape (circle, square, or diamond) and optional dynamic mapping that maps variable values to shapes. Supports discrete mappings for categorical/ordinal/boolean variables and breakpoint mappings for number/scalar variables. Renames `iconVariant` to `icon` on node definitions.

## 11.2.0

### Minor Changes

- b8b9fb0: Add legacy protocol migration support for schema versions 1 through 7. The package can now migrate protocols from any schema version (1-8) to the current version 8. This includes the v3→v4 name sanitization migration and the v5→v6 NameGenerator type consolidation, along with no-op version bumps for intermediate versions.

## 11.1.1

### Patch Changes

- 4f2d778: Export sort rule schema from filters module

## 11.1.0

### Minor Changes

- 273bcbe: Add optional showTransit and allowSearch configuration options to geospatial interface mapOptions:

  - showTransit: When enabled, Fresco displays transit layers on the map
  - allowSearch: When enabled, participants can search the map for locations

  Both options default to false (disabled).

## 11.0.0

### Major Changes

- 8f91391: Remove `introductionPanel` from Geospatial interface schema.

  This is a breaking change for existing protocols that include an `introductionPanel` on Geospatial stages. Protocols with Geospatial interfaces no longer support or require an introduction panel.

## 10.1.0

### Minor Changes

- b713317: Add greaterThanOrEqualToVariable and lessThanOrEqualToVariable validations for number, datetime, and scalar variable types

## 10.0.0

### Major Changes

- 01448c8: Split Family Tree sexVariable into egoSexVariable and nodeSexVariable.

  This is a breaking change for existing protocols that reference the old sexVariable field. Protocols with Farmily Tree interfaces require that the egoSexVariable and nodeSexVariable be defined separately.

## 9.0.0

### Major Changes

- cc2adc3: Add required `name` property to protocol schema (breaking change)

  **Schema changes:**

  - Protocol schema now requires a `name` property (`string`, min 1 character)

  **Migration changes (v7 → v8):**

  - Migration now requires a `name` dependency to be provided when migrating from v7

## 8.0.2

### Patch Changes

- 9958b67: Fix type inference in zod-mock-extension generateMock function
  - Fixed `base` parameter type inference in `generateMock()` callbacks by using `z.output<this>` instead of explicit type parameters
  - Added excess property checking for object schemas to catch extra properties at compile time
  - The `ExactReturn` type utility now correctly handles unions, primitives, arrays, and Record types without false positives

## 8.0.1

### Patch Changes

- 84d09e3: Implement validation of variable ID uniqueness across entities. Replaces broken implementation.

## 8.0.0

### Major Changes

- edc9dcb: added relationship to ego variables to edges for family tree census #315

## 7.2.0

### Minor Changes

- 26ae10b: Add comprehensive migration tests and wildcard support for schema transformations
  - Add comprehensive test suite for v7 to v8 migration covering all transformations (displayVariable removal, Toggle options removal, filter type transformations, schema version updates)
  - Extend traverseAndTransform utility to support wildcard (\*) syntax in transformation paths
  - Add 9 new tests for wildcard functionality including nested paths, multiple wildcards, and edge cases
  - Create Protocol<V> generic type for discriminated union extraction by schema version
  - Fix TypeScript compilation errors using schema validation and optional chaining patterns
  - Update extractProtocol utility to use VersionedProtocol type for better type safety

## 7.1.0

### Minor Changes

- c0c9e2b: Fix typo in filter rule operators

## 7.0.1

### Patch Changes

- dc865db: Second draft of family tree census
- d795dd9: Changeset
- 9c213e7: Add node and edge color sequences
- f0fd48b: Implement initial family tree census
- 018f3a0: Adjust property names

## 7.0.0

### Major Changes

- 7ec964b: Refactored protocol-validation API to return the Zod validation result directly, which is a result object with success and error properties.

## 6.0.0

### Major Changes

- 3849e0e: Updated zod to version 4. Consumers must also use zod 4 to avoid type conflicts.

### Patch Changes

- Updated dependencies [3849e0e]
  - @codaco/shared-consts@5.0.0

## 5.0.2

### Patch Changes

- 793bf39: Fix TypeScript declaration merging errors by disabling rollupTypes in vite-plugin-dts. This resolves "Individual declarations in merged declaration must be all exported or all local" errors and "const initializer in ambient context" issues when importing the package.

## 5.0.1

### Patch Changes

- 29287ef: Schema 8 migration fixes/improvements:
  - Fix displayVariable removal
  - Remove options from Toggle variables

## 5.0.0

### Major Changes

- 97fd038: # Release stable versions for protocol-validation

  This changeset marks the transition from alpha/prerelease to stable versions for protocol-validation package.

  ## Changes
  - **@codaco/protocol-validation**: Upgraded from `4.0.0-alpha.11` → `4.0.0` (stable)

  ## Context
  - Both shared-consts (3.0.0) and protocol-validation are now considered stable and ready for production use
  - This removes the alpha/prerelease status and indicates these packages have reached production readiness

  ## Breaking Changes

  This is not a breaking change in terms of functionality - the API remains the same. The version bump reflects the move from alpha to stable status.

- ae26f2a: ### Major Update for `@codaco/protocol-validation` (Schema 8)

  #### Key Changes:
  - **New Stage Types Added**:

    - `Geospatial`
    - `Anonymisation`
    - `OneToManyDyadCensus`
    - `FamilyTreeCensus`

  - **Expanded `assetManifest` Schema**:

    - Added a new `apiAssetSchema`, enabling support for API keys.
    - Expanded `fileAssetSchema` with the addition of the `geojson` type, enabling support for geospatial data.

  - **New `experiments` Property on `Protocol`**:
    - Introduced a new `experiments` property with an `encryptNames` boolean.

### Patch Changes

- a4969c4: small changes
- 86aa8c0: separate out node and edge based stage subjects so that they can be extracted
- Improve types for variables
- 4ea6b33: Ensure development protocol can validate
- 43c3304: make data source required property in panel schema
- 3605f81: export even more types
- df6da79: Make migration for schema 8 return proocol object
- 04aff9d: Correct SortOrderSchema
- 37df451: Export stage types
- ec38a8a: change anonymisation schema
- 3e394d5: use specific stage subject types
- ceda2af: Export additional schemas to support prisma json transformer extension
- 551b473: Improve prompt type
- Updated dependencies [a4969c4]
- Updated dependencies
- Updated dependencies [9ec9284]
- Updated dependencies [304c64f]
- Updated dependencies [b0fa339]
  - @codaco/shared-consts@4.0.0

## 4.0.0-alpha.11

### Patch Changes

- df6da79: Make migration for schema 8 return proocol object

## 4.0.0-alpha.10

### Patch Changes

- 551b473: Improve prompt type

## 4.0.0-alpha.9

### Patch Changes

- 43c3304: make data source required property in panel schema
- 04aff9d: Correct SortOrderSchema

## 4.0.0-alpha.8

### Patch Changes

- 3e394d5: use specific stage subject types

## 4.0.0-alpha.7

### Patch Changes

- 86aa8c0: separate out node and edge based stage subjects so that they can be extracted

## 4.0.0-alpha.6

### Patch Changes

- a4969c4: small changes

## 4.0.0-alpha.5

### Patch Changes

- ceda2af: Export additional schemas to support prisma json transformer extension

## 4.0.0-alpha.4

### Patch Changes

- 3605f81: export even more types

## 4.0.0-alpha.3

### Patch Changes

- 4ea6b33: Ensure development protocol can validate
- 37df451: Export stage types
- ec38a8a: change anonymisation schema

## 4.0.0-alpha.2

### Patch Changes

- Improve types for variables

## 4.0.0-alpha.1

### Major Changes

- ae26f2a: ### Major Update for `@codaco/protocol-validation` (Schema 8)

  #### Key Changes:
  - **New Stage Types Added**:

    - `Geospatial`
    - `Anonymisation`
    - `OneToManyDyadCensus`
    - `FamilyTreeCensus`

  - **Expanded `assetManifest` Schema**:

    - Added a new `apiAssetSchema`, enabling support for API keys.
    - Expanded `fileAssetSchema` with the addition of the `geojson` type, enabling support for geospatial data.

  - **New `experiments` Property on `Protocol`**:
    - Introduced a new `experiments` property with an `encryptNames` boolean.
