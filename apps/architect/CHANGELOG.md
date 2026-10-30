# @codaco/architect

## 9.0.0

### Major Changes

- 97933ea: Architect 8 now comes with Architect 9, so you can keep working on a schema 8
  protocol without upgrading it. Architect 8 opens in the same browser tab, at
  `/v8/` on the Architect site, and works offline too: Architect 9 downloads it
  in the background, after it has finished loading itself.

  - When you open a protocol made for schema 8 or earlier — from a file, by
    dragging it in, from your computer's file manager, or from the library —
    Architect asks how to open it. **Upgrade to schema 9** creates an upgraded
    copy and opens it; the original is never changed. **Keep editing as schema
    8** opens the protocol, unchanged, in Architect 8.
  - The protocols you saved in Architect 8 appear in the library beside your
    schema 9 protocols, marked with their schema version. Their menu can
    upgrade the protocol, open it in Architect 8, download it as a `.netcanvas`
    file or show its details. Architect remembers when you chose to keep a protocol in
    Architect 8 and opens it there next time.
  - Architect 9 keeps its own library, separate from Architect 8's. It never
    changes or deletes a protocol saved in Architect 8, and **Clear all**
    removes only what is saved in Architect 9.

- 1769104: Protocols can now be translated. A schema 9 protocol declares the languages
  its text is written in, and participants see each interview in the language
  that suits them best.

  How an interview picks its language:

  - An interview shows the protocol in the first of the participant's browser
    languages that the protocol offers, or in the protocol's default language
    when it offers none of them. A close regional match counts: a browser set to
    `es-MX` gets a protocol's `es`, and `zh-TW` gets `zh-Hant`. This is checked
    again each time the interview opens, until the participant chooses a
    language.
  - A new Language Chooser stage lets participants choose one of the protocol's
    languages. Its heading is the stage's own text, which starts as "Choose a
    language" and can be reworded and translated in Architect; participants read
    it in the interview's current language. The languages are listed
    alphabetically by their own names, sorted for the language of the
    interview's own buttons and messages, and the order they are stored in has
    no effect. The current one is selected, and choosing
    another switches the whole interview at once. The choice is saved with the
    interview. The stage can appear anywhere, more than once.
  - Buttons, menus and other text that Network Canvas provides follow the
    participant's chosen language when it is one of Network Canvas's own
    languages, and otherwise their browser's languages. The language setting in
    the interview's settings menu has been removed.
  - Text that is missing in the participant's language is shown in the best
    available translation: first in another language their browser lists, then in
    the protocol's default language, then in any language of the protocol that has
    it. Each step accepts a close regional match.
  - The interview marks itself, once, with the interview language and its
    direction, and lays everything out in that direction, including its
    navigation, dialogs and notifications. Text inside it does not mark a
    language of its own, even when it falls back to another language, apart
    from the Language Chooser, which names each language in that language.
  - Participants never see a codebook name. A Narrative preset switcher lists
    highlighted attributes and drawn edge types by the translated labels the
    preset gives them, a Network Composer stage gives each edge type it lets
    participants draw a translated label of its own, and a Network Composer
    field shows its own translated caption. A node with no name is shown as
    "Unnamed". A form field is always captioned with its own prompt: a prompt can no
    longer be only spaces, so the attribute's name never stands in for it.

  In Architect:

  - A new Languages page lists the protocol's languages alphabetically by name,
    lets you add languages, remove one with its delete button and choose the
    default one from a list, explains which translation participants see, and
    shows which text is still missing a translation. Languages have no order, so
    there is no way to reorder them. Text only needs a translation in at least
    one language: a missing translation, in the default language or any other,
    is a warning and never an error. A language can't be removed while it is the
    default, or while it holds the only translation of some text, and its delete
    button says why.
  - A translation table shows everything participants see beside its
    translation into each of the protocol's languages, one column per language.
    Open translation table, on the Languages page and in the Language Chooser's
    editor, opens it in a dialog over the Languages page that fills the window.
    The page's address records that the table is open and what it shows,
    so Back closes it. Rows are grouped by stage, with each stage's position, name
    and interface, then by codebook type, and each row is named the way its
    editor names it, such as "Page heading" or "Item 1 › Content". Each cell is
    edited where it is, formatted text with the stage editor's formatting
    buttons, and checked when you leave it. Changes stay in the table, each
    marked, until Save writes them all into the protocol as one change that a
    single Undo takes back; while any cell holds text that can't be saved, Save
    refuses and takes you to that cell, showing it even if a search, filter or
    hidden column had taken it out of view. Cancel closes the table, asking first
    when it would throw changes away. Escape and a click outside don't close it,
    and Back or a reload asks before losing changes. Escape undoes your change to
    a cell, the arrow keys move between rows, and Ctrl+Enter moves to the next
    row. An empty cell
    shows what participants using that language see instead, tagged with that
    translation's language. A menu shows every translation, those missing
    a translation into any language shown, or those missing one language; a
    search finds strings by place or translation; and language columns can be
    hidden. Placeholders show as named pills whether or not a cell is being
    edited, and the table's scrollbars stay visible while it overflows.
  - On the Languages page, a language that some wording is not translated into
    yet is marked "Missing translations". While translations are missing, a note
    in the stage list names the languages that need them and opens the table on
    every missing translation.
  - A new protocol asks which languages participants can take it in, and,
    when you choose more than one, which of them is the default. A protocol
    upgraded from an earlier version is recorded as written in English, and each
    language's row has a button that changes which language its text is
    recorded as, for a protocol that is really written in another language.
  - Once a protocol has more than one language, each text field in the stage
    editors has a language menu that shows which languages its text still needs.
    All the menus switch together, so you can work through a stage in one
    language. The menus name each language in Architect's language, with its
    own name beside it. A note under a field with a missing translation tells
    you what participants will see instead, and says when their browser's other
    languages could change that. Node types, edge types and attributes have only a
    name, which participants never see.
  - Each attribute a Narrative preset highlights and each edge type it draws has
    a label of its own, which participants see in the preset switcher. You write
    and translate it in the Narrative stage editor; it starts as the attribute's
    or edge type's name.
  - Each edge type a Network Composer stage lets participants draw has a label of
    its own, which participants choose it by. You write and translate it in the
    stage editor; it starts as the edge type's name.
  - Each Network Composer form field needs a caption, which can be translated.
    Choosing the field's attribute fills in its name as the caption, until you
    write one of your own.
  - The printable protocol summary shows every text in all of the protocol's
    languages, alphabetically, with the default language marked, and says which
    language participants see where a translation is missing. Its cover lists
    the protocol's languages.
  - The New Stage menu has a new Utilities capability, which lists the
    Information interface and the Language Chooser. The Language Chooser's
    editor lists the languages participants will be offered, which is every
    language the protocol is written in, and manages them the same way as the
    Languages page: you can add languages, choose the default, and remove one,
    under the same rules.
  - A preview opens in the language a participant with your browser would see,
    rather than in Architect's own language. A "Preview language" menu above it
    switches the interview to any of the protocol's languages while the preview
    window is open, in place: the screen, the prompt and anything typed but not
    yet submitted stay, including after a Language Chooser has stated a
    language.

  In Interviewer and Fresco:

  - The language an interview is shown in is not interview data: it is not
    saved with the interview and not exported. A language the participant
    chooses lasts for the rest of their visit in that browser tab, including
    across a reload.
  - Interviewer's new interview form no longer asks for a language, and the
    confirmation at the end of an interview follows the interview's language.
  - Fresco reads the participant's browser languages from their request, so the
    server and the browser agree on the interview's language.

  **Breaking for hosts of `@codaco/interview`.** The Shell no longer takes
  `localePreference`, `onLocaleChange`, `allowLanguageSelection` or
  `requestedLocale`. Pass `requestedLocales`, the participant's browser languages
  in order (`navigator.languages`, or a parsed `Accept-Language` header on a
  server). The interview keeps the participant's chosen language itself, in the
  tab's `sessionStorage` keyed by interview id, so a host stores nothing for it.
  An optional `statedLocale` states a language on the participant's behalf,
  replacing a held preference in place, and an optional
  `onLocalePreferenceChange` tells a host whose own controls follow the
  interview's language which one the participant chose. `SessionPayload` now
  requires `localeOptions`, the `LocaleMetadata` of every language the protocol declares
  (from `getLocaleMetadata` in `@codaco/protocol-validation`), which is never
  stored. `localeOptions` holds one entry for each declared language, in any
  order: the interview sorts them, and the Shell throws only when the set of
  languages differs from the protocol's. The `onSync` snapshot is typed
  `SessionSnapshot`. Components used
  outside the Shell that show protocol text need a `ProtocolLocalizationProvider`.
  The package README describes the whole contract.

- 151e511: Names in a protocol can now be written in any language. Node types, edge types,
  attributes and option values can use any script, spaces and punctuation, so a
  study can name an attribute "Âge", "年龄" or "Close friend" rather than keeping
  to unaccented letters, numbers and `. _ - :`. A name still can't be empty,
  start or end with a space, or contain tabs, line breaks or other invisible
  control characters. Names are saved without spaces at either end, and an
  accented letter is stored the same way however it was typed.

  Protocols now use schema 9, the protocol version that allows these names. When
  you open a protocol made with an earlier version, Architect creates an upgraded
  copy and leaves the original as it was. Existing names are kept exactly as
  they are. Interviewer and Fresco keep an older protocol on schema 8 when it is
  imported, and never upgrade it. Update
  Interviewer and Fresco to
  this release before you use a schema 9 protocol with them, because earlier
  versions can't open it. A protocol made with a newer version of Network Canvas
  than the app can run is now reported as needing an update to the app, rather
  than as an unreadable protocol.

  In Architect:

  - The hint under a node or edge type's name now suggests names you can type in
    as they are. The last release suggested "Works With" in English, and
    "Organización" and "Trabaja con" in Spanish, and the field then refused them.
    Every suggestion is now accepted, and each language suggests names its
    researchers would naturally use.
  - A name that would clash with another column in exported data is refused as
    you type it, and the message names the other column. A categorical attribute
    is exported as one column for each option, named after the attribute and the
    option, and a layout attribute as one column for each coordinate. So an
    attribute called "age_1" can't sit beside a categorical "age" attribute that
    has the option "1", and no attribute can take the name of a column every
    export includes, such as "nodeID" or "label". Names that an export would
    write the same way are refused too: GraphML files replace spaces and most
    punctuation with "_", so "close friend" and "close_friend" can't both be
    used, and CSV files put an apostrophe before a name that starts with "=",
    "+", "-" or "@", so "=total" and "'=total" can't either.
  - Two options of one attribute that would be exported to the same column, such
    as the number 1 and the text "1", are refused.
  - A participant data file (roster) is checked for characters that exported data
    can't carry, which are usually invisible control characters pasted in from
    another program. A file that contains one is refused when you import it, and
    the message names the row and column, or the line, to fix.
  - A roster's column headers can be any name an attribute can have. A roster
    with two headers that are the same name written two ways, such as an accented
    letter stored as one character in one and as two in the other, is refused,
    because only one of the two columns could fill the attribute.
  - The roster preview shows the values of a column called "constructor" or
    "toString" correctly.

  In interviews:

  - Rosters match their columns to attributes by name in any language, including
    a spreadsheet saved on a Mac that stores accented letters differently. A
    roster with two such columns for one attribute shows an error instead of
    keeping only one column's values. An option whose value looks like a number
    or `true` keeps the value the codebook gives it.
  - Columns and attributes called "constructor" or "toString", and names that
    contain a dot, are read, shown, searched and sorted like any other name.
    Before, some of them were dropped or read wrongly.

  **Breaking for hosts of `@codaco/interview`.** The engine now runs schema 9
  protocols. `COMPATIBLE_PROTOCOL_SCHEMA_VERSION` (from
  `@codaco/interview/protocol-schema-version`) is `9`, and `ProtocolPayload`
  (from `@codaco/interview/contract`) is typed from the schema 9 protocol. A host
  must migrate stored protocols to schema 9, for example with `migrateProtocol`
  from `@codaco/protocol-validation`, before it hands them to the Shell. Hosts
  that already migrate to `COMPATIBLE_PROTOCOL_SCHEMA_VERSION` only need the
  `@codaco/protocol-validation` and `@codaco/shared-consts` majors released
  alongside this one. Roster CSV files are now read with `readRosterCsv` from
  `@codaco/protocol-validation`, and the package no longer depends on
  `csvtojson`.

### Minor Changes

- b8a5637: Per-person and per-connection forms now move the participant along, as the family tree's person form does. Choosing an option brings the next unanswered question into view, and once every question for one person or connection is answered, the form saves and moves on to the next one by itself after a short pause. Changing an answer already given does not move on.
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

- 4de3f45: Architect can now send a protocol straight to Interviewer.

  **Architect**

  - A new **Send to Interviewer** button sits beside **Download**. It opens
    Interviewer in a new tab and passes it the protocol, bundled exactly as
    Download would save it. The production site sends to
    interviewer.networkcanvas.com; the development site and its previews send to
    interviewer.networkcanvas.dev.
  - If the protocol cannot be bundled (a resource cannot be read, or the finish
    stage has no text), the new tab closes again and the same explanation as for
    Download is shown. If Interviewer does not receive the protocol, for example
    because the browser blocked the new tab, a dialog suggests downloading the
    protocol and opening the file in Interviewer instead.

  **Interviewer**

  - When Architect opens it, Interviewer accepts the protocol Architect passes
    and imports it once Interviewer is unlocked (or set up, on first use). It
    only accepts protocols from Architect's own sites.

  **Shared constants (`@codaco/shared-consts`)**

  - Adds the message types, origin rules and helpers both apps use for this
    handoff (`parseInterviewerHandoffPayload`, `readInterviewerHandoffReply`,
    `interviewerOriginFor`, `isAllowedArchitectOrigin` and related exports).

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

- 7002c7c: The interview shows a stage's dynamic values in its text. A prompt, form question, introduction, Information screen or finish screen reads the version of its message that the values choose, with each value written in the interview's language: dates in full, numbers and lists as the language writes them, and a categorical or yes/no value as its option's label. Values are read live, so a form question changes as the participant answers an earlier question on the same form (on a Family Pedigree form, also the name, gender identity and sex questions above it), and a correction made earlier shows at once. A form adding a person on a Name Generator prompt already has the attributes the prompt gives them.

  - Each filled-in value is tinted with the primary colour, so participants can tell it was filled in for them. Screen readers read it as part of the sentence. The value is isolated for bidirectional text.
  - A value is only ever text. Markdown, HTML or message syntax in a participant's answer is shown as typed. It never becomes formatting, a link or an image, and it is never sent to analytics or written to the console.
  - A Dyad or Tie Strength Census prompt can show the two nodes it asks about, a one-to-many census prompt its focal node, and a Geospatial prompt the node being placed. The question a Categorical Bin asks about a node put in its "other" bin can show that node.
  - Each of those nodes, a form's node and the two nodes an edge form's edge joins can be shown by the label the interview draws on them, which on a form follows the answers as they are given. On a Family Pedigree form, that is the label the family tree draws: the typed name, "You" for the participant, or the word for how an unnamed relative is related, in the stage's wording and framing, as saving the answers will draw it.
  - A Geospatial or one-to-many census stage reached with nobody to ask about, such as a preview of it, shows no prompt, as a Dyad or Tie Strength Census with no pairs already did, instead of a question naming nobody.
  - `@codaco/fresco-ui`'s `RenderMarkdown` exports its default rehype plugins (`DEFAULT_MARKDOWN_REHYPE_PLUGINS`) and its default label elements (`ALLOWED_MARKDOWN_LABEL_TAGS`) so that a caller can extend them. It also exports `getMarkdownAttributeValues`, which lists the attribute values (link destinations and titles, image sources and text) a piece of markdown produces.
  - `SyntheticInterview` stages can carry `dynamicValues`.
  - `ProtocolField` takes a `label` to show in place of the field's authored label, as it already took a `hint`. Architect's form field preview uses it to show a question that holds values.

- c8dfb28: Encrypted attributes are no longer an experimental feature. The Anonymisation
  interface, which asks a participant for a passphrase and encrypts the
  attributes you choose so that researchers can't read them, is now always
  available when you add a stage in Architect. Architect's Experimental Features
  page, where encrypted attributes had to be switched on for each protocol, has
  been removed.

  In interviews, an attribute marked as encrypted is now always encrypted.
  Upgrading a protocol to schema 9 keeps each attribute working as it did: if a
  protocol marked attributes as encrypted but had the experimental feature
  switched off, the upgrade unmarks them, so they go on being collected without
  encryption. Fresco and Interviewer carry each protocol's setting into the
  upgrade when they update the protocols they already hold, including Fresco
  protocols that the schema 8 alpha stored with name encryption on.

  Encrypted answers are now protected in a new way:

  - Each interview has one encryption key, made from the participant's
    passphrase with PBKDF2-SHA256 (600,000 iterations, with a salt derived from
    the interview's id) and used with AES-256-GCM. The key is made once when the
    passphrase is chosen and once each time it is entered again, and is only
    ever held in memory: it is never saved, synced or exported. Nothing else
    about the key is stored either: no salt, and no value for checking a
    passphrase against.
  - A passphrase entered again is accepted only if its key decrypts an answer
    the interview has already encrypted, so a mistyped passphrase is turned
    away at once instead of failing later. Until an answer has been encrypted,
    there is nothing a passphrase could be wrong about, and the passphrase
    entered becomes the interview's.
  - Each answer is bound to the person and the question it belongs to, so an
    encrypted answer copied anywhere else can't be read, and it is padded so
    that its length reveals less about it.
  - A participant now confirms the passphrase when choosing it. Entering it
    again only checks it. A minimum length set on the Anonymisation stage
    applies even if it is shorter than 8. Without one, the passphrase must be
    at least 8 characters long, or as long as the stage's maximum when that is
    shorter. Architect shows the minimum that applies where you set the lengths.
  - The passphrase stage now says whether the passphrase was set, accepted, or
    had already been entered. Password managers are asked not to fill in or
    save it, and when a passphrase is turned away the cursor goes back to the
    field so it can be typed again.
  - While a passphrase is being checked, the interview says so and the button
    can't be pressed twice.
  - The passphrase prompt now says that a forgotten passphrase can't be
    recovered, instead of suggesting someone can help.
  - The passphrase prompt now also appears when the navigation runs along the
    bottom of the screen, and a notice that answers are protected brings it
    up. Password managers are asked to stay out of it too, and it can't be
    closed while it checks a passphrase. It starts empty each time it opens,
    even when it is opened again as it closes.
  - An answer that can't be read is shown as "Answer unavailable" rather than
    asking for the passphrase again. Saving a form keeps such an answer instead
    of clearing it, and the participant can replace it with a new one.
  - Whether an answer is read as encrypted follows how it was saved, not the
    protocol's current setting.
  - A validation rule that compares an answer with protected ones, such as
    "must be different from" or "must be unique", uses the decrypted answers.
    While the passphrase hasn't been entered, the check asks for it instead of
    passing or comparing with encrypted text. When that keeps the answers in a
    form, or in the Network Composer's side panel, from being saved, the
    warning before discarding them says to enter the passphrase rather than
    that they are invalid. A check that waits for the answers to be decrypted
    compares with them as they are once it is done, so someone added or
    changed meanwhile, such as a person put back by an undo, is compared too.
  - A form shown over the screen, such as the add-a-person form, the "Other"
    question of a categorical bin, or a family pedigree's person forms, now
    offers the passphrase itself when one of its rules needs it, because the
    prompt in the navigation can't be reached while the form is open. A rule
    asks for the passphrase only when it reads a protected answer: a new
    person's form no longer asks for it to check the new person's own answers,
    which aren't saved yet.
  - A protected name is shown decrypted in a person's label and in the "Other"
    prompt of a categorical bin. While it is still being decrypted, the label
    shows the lock, as it does before the passphrase is entered.
  - A list sorted by a protected answer, such as a name, is sorted by the
    decrypted answers once the passphrase has been entered. Until then, and
    when an answer can't be read, the list ignores that sort rule and keeps the
    order its other rules give it, so the order never hints at what the answers
    say. A one-to-many dyad census, which shows people one at a time, keeps the
    order each prompt began with until the stage is left, so entering the
    passphrase part-way never skips or repeats anyone. When the passphrase has
    already been entered, it waits for the decrypted answers before showing
    anyone.
  - Typing a letter to move through a list of people finds them by their
    decrypted names once the passphrase has been entered. Until then, typing
    never finds anyone by a protected name. A name that can't be read is found
    by "Answer unavailable", and a person without a name by the name of their
    type, as each is shown.
  - The add-a-person form can't be closed or submitted twice while it saves.
    A family pedigree is saved all at once or not at all, and a relationship
    that can't be saved is reported rather than skipped. Choosing to keep
    editing while it is being saved saves none of it, so finalizing it again
    saves each relative once.
  - Going back from the first person or relationship in a form now saves the
    answers, or asks before discarding answers that can't be saved, as going
    back from any other person does. Leaving a Network Composer stage saves a
    change in its side panel that hadn't been saved yet, and asks before
    discarding one that is invalid or couldn't be saved. Closing the side panel,
    tapping another person, relationship or the background, choosing another
    tool or selecting with the lasso now does the same, so a change made just
    before is no longer lost, and keeping a change keeps the panel open on it.
    Deleting the person or relationship discards its change without asking, and
    closing the panel after an undo keeps the answer the undo put back.
  - Leaving a stage, moving to the next or previous question on a stage (or to
    the next person on the map), finishing or closing the interview waits for
    answers still being encrypted, so they are kept and the next stage is
    chosen with them. When one of them can't be saved, the participant stays
    where they are and the interview isn't finished or closed, so they see why
    and can try again. The confirmations to finish and to close the interview
    stay open while they wait, and cancelling either one keeps the interview
    open.
  - A name entered in the quick-add field of a name generator or the Network
    Composer counts as being saved from the moment Enter is pressed, while it is
    still being checked, so leaving the stage waits for it too. The field stays
    open, with the name in it, until the person is added or the name is refused,
    so a refusal is shown where the name was entered.
  - An area picked on the map is highlighted once it is saved, so a pick that
    couldn't be saved, such as a protected location picked before the
    passphrase was entered, no longer looks chosen. The map highlights only the
    location saved for the person shown, even when moving on while it is still
    loading.
  - Answers changed one after another in the Network Composer's side panel, and
    locations picked one after another on the map, are saved in the order they
    were made, so an earlier answer that takes longer to encrypt can't be saved
    last and replace a later one.
  - The summary of the family that a family pedigree saves alongside the
    interview names a relative whose name is protected by their relationship
    alone, so a protected name never reaches it, even inside another
    relative's label, such as "Rosa's Parent".

  Skip logic and filters are checked without the participant's passphrase, so a
  rule that compared the answers to an encrypted attribute only ever compared
  its encrypted text. A rule that only checks whether an encrypted attribute is
  answered still works. When you build skip logic, a stage filter or a panel
  filter, Architect offers an encrypted attribute only with "exists" and "does
  not exist", except in a panel that lists people from an external data file,
  whose rows are not encrypted. A stored rule that compares one is marked, and
  can't be saved until it is changed. Architect won't let you encrypt an
  attribute while one of these rules compares its answers. Upgrading a protocol
  to schema 9 removes the comparing rules and keeps the others. Skip logic left
  with no rules is removed, so its stage is always shown, and a stage shown only
  when a removed rule matched may never have appeared before.

  Answers encrypted by the experimental feature in schema 8 can't be read after
  the upgrade, and a forgotten passphrase still can't be recovered. A schema 8
  interview with encrypted answers still opens, syncs and exports as before:
  its old encrypted answers show as "Answer unavailable" and export as
  `ENCRYPTED`, and if the participant continues, they choose a new passphrase
  that protects the answers they give from then on.

  In a one-to-many dyad census that takes people out of the list once they have
  been considered, going back to an earlier prompt now resumes on the last
  person that prompt showed, rather than on one it never shows on the way
  forward.

  For hosts of `@codaco/interview`: `ProtocolPayload.experiments` no longer has
  `encryptedVariables`, because an attribute marked as encrypted is always
  encrypted. The interview's key is derived from the passphrase and the
  session's `id`, so a host must keep a session's id unchanged for as long as it
  holds the session: under another id, its encrypted answers can no longer be
  read. Encrypted values' metadata is now `{ iv }`, and schema 8's
  `{ iv, salt }` is still accepted. Redux DevTools and
  the interview's action logger now connect only when the host passes
  `flags.isDevelopment`, and both show encrypted answers redacted.

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

- 685c481: A new Finish Screen stage is now named from how it is set up, like other stages: its outcome, and whether it finishes automatically, for example "Finish Screen (Completed)" or "Finish Screen (Ineligible, Automatic)". The name follows changes to those settings until you rename the stage yourself.
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

- 97a6ca1: On a Geospatial stage, the map's labels and the place search now follow the language the participant is reading the interview in, instead of always searching in English. A participant reading a Hungarian protocol sees Hungarian place names on the map and gets Hungarian search results. Changing the interview language updates the map in place, without reloading it, and replaces any search results already on screen.

  Where Mapbox has no labels in the language, the map shows each place's own name. Where place search has no results in the language (it has no Chinese, Korean or Arabic), the search uses the interview's interface language if it can, and English otherwise. The map's button labels keep following the interface language.

- 7fa80c2: The Language Chooser stage's heading is now part of the protocol. A new stage
  starts with "Choose a language" in each of the protocol's languages that
  Network Canvas has wording for, and the researcher can reword and translate it
  in the stage's Participant wording section in Architect. The interview shows
  the stage's heading, in the language the participant has chosen.
- 2449843: The stage list now shows a note when a protocol has more than one language but
  no Language Chooser stage. It explains that each interview then opens in the
  language that best matches the participant's browser settings, and suggests
  adding a Language Chooser stage if participants should choose the language
  themselves. Leaving the stage out is still valid, so the note can be dismissed,
  and it stays dismissed for that protocol.
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

- be92228: The Family Pedigree has Undo and Redo buttons in its toolbar, so a participant can take back their last change to their family and bring it back again. Ctrl+Z (⌘Z on a Mac) undoes and Ctrl+Shift+Z (⇧⌘Z) or Ctrl+Y redoes. Each saved change is one step: adding someone, saving their details, removing someone, connecting or disconnecting two people, answering a checklist question, or selecting someone for a question. The zoom and Show the whole family buttons have moved to a small toolbar of their own beside the main one.
- b92ccdb: The Family Pedigree editor's wording fields now use the piped-text editor that
  other stages' prompts use. A syringe button inserts what each text can show,
  such as a family member's name or the number of parents still to add, and what
  it can change with, such as whether it is about the participant. A text that
  changes with something is shown as one folded piece; opening it shows one
  version per case, and a text that shows a number gets "Wording that fits the
  number". The translation table and the protocol summary show these pieces folded
  in the same way. The new labels are translated into every Architect language.
- d0118fe: The per-person form now shows the person joined to their form. On a wide screen the person sits beside the form, and on a tall screen above it, staying in view as a long form scrolls. Moving on, the questions clear, the last person shrinks away, the next slides into place, and their questions appear one after another. The form about each connection between two people shows the pair the same way, joined to the top of the form. Moving to the next connection, the line between them is taken back, anyone not in the same place in the next pair shrinks away, the new people drop in one after another, and the line is drawn between them again. With reduced motion turned on, they simply fade.
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

- 3f3397a: Interviews now pass over any stage that has nobody to show, not only empty
  forms and censuses. A Categorical or Ordinal Bin, Geospatial, Sociogram or
  Narrative stage with no person of its type to show is skipped, as is a One to
  Many Dyad Census with fewer than two people. Next and Back move past these
  stages in either direction, and the stages menu lists them as hidden by
  answers. Name generators, the Network Composer, and Narrative stages that let
  participants draw are never skipped, because the participant can still do
  something there.
- ad201b2: Every kind of stage now has one colour and one icon, the same in every app. Stages that do similar work share a colour family: naming people in coral reds, describing them in blues, sorting them in oranges, mapping in teal, finding ties in purples, reflecting in sea greens, and the screens that collect no network data in greys. Every colour carries a white icon at the WCAG AA contrast ratio of 4.5:1. Eight interfaces get new icons drawn in Lucide's style: Ego Form, Per Alter Form, Per Alter Edge Form, Sociogram, Network Composer, Narrative, Dyad Census and Tie-Strength Census.

  **Architect**

  - The protocol timeline on the start screen draws each stage in its new colour and icon. Information stages are a lighter grey instead of charcoal.
  - Each stage in that timeline now carries the name of the interface it really uses, under a title that says what happens on the stage. Previously some stages showed the wrong type, such as a Sociogram labelled "Connections". The stage labels also have more padding and tighter, clearer type.

  **Tailwind config (`@codaco/tailwind-config`)**

  - Adds `interfaces.css`, which `fresco.css` loads, with `--interface-<stage-type>` and `--interface-<stage-type>-contrast` tokens for each stage type and `--color-interface-*` aliases for Tailwind utilities. An app that keeps its own theme instead of `fresco.css` imports `colors.css` and then `interfaces.css`.

  **Fresco UI (`@codaco/fresco-ui`)**

  - **Breaking:** `STAGE_TYPES` in `stages/stageTypes` replaces `STAGE_TYPE_COLORS` and `STAGE_TYPE_ICONS`, mapping each stage type to its colour token and icon. `stageTypeColorStyle` now returns the stage type's `--interface-*` tokens instead of a palette colour, and `stageTypeIcon` returns the new icons. `StageBar` draws its segments in the new colours.

- 2488dcf: Use dynamic values and other schema 9 features in the protocol templates

  The templates now show participants the names they gave, and earlier answers,
  where that makes a question clearer:

  - Questions about one person name them, instead of saying "this person". This
    covers every Per Alter Form, the "something else" question on the Categorical
    Bin stages of the IPV Help-Seeking and Colored Eco-Genetic Relationship Map
    templates, the Social Connection & Isolation template's "who knows whom"
    stage, and the Transnational Networks map. The Colored Eco-Genetic
    Relationship Map's family pedigree asks about each relative by the name or
    relationship the family tree shows ("Is Mother living or deceased?"), and
    asks participants about themselves as "you".
  - Life Transitions & Turning Points: the Network Composer's questions about
    "before" and "since" give the month of the change the participant described.
  - Care & Support Networks: questions about the pregnancy or the baby follow
    whether the participant is pregnant or has given birth.
  - Sexual & Injection Risk Networks: the question about when a partnership ended
    reminds participants when they said it began, and the question about HIV
    treatment is asked directly of participants who said they are living with HIV.
  - Transnational Networks: the question about years lived in the country reminds
    participants of the year they said they arrived.

  The Narrative stages of the Life Transitions, Mental Health and Colored
  Eco-Genetic Relationship Map templates label their highlights in words, instead
  of with attribute names. The Social Connection & Isolation template's closeness
  stage lets participants tap a person and then a band, instead of dragging.

- c236d04: Translate the Transnational Networks template into Hungarian and Spanish

  The Transnational Networks template is now written in English, Hungarian and
  Spanish. A Language screen after the researcher notes lets participants choose
  one, and the notes explain how to remove languages you don't need.

  Checking the translations turned up some English wording to fix:

  - Answer options say "this country" instead of "host country", which was the
    answer offered to people born in the country they live in. "Citizen" is now
    "Citizen of this country".
  - The answers about where a participant was born speak in the participant's own
    voice, like the other answer options.
  - The welcome screen no longer says that only some people go on the map.
  - The Narrative stage's view that groups people by where they are from is named
    "Where people are from" instead of "Where people live", and its highlight is
    labelled "Same ethnic or cultural background" instead of the attribute's name.

### Patch Changes

- 50cc7c9: In the Family Pedigree, adding a sibling as an adopted child of the parents they share no longer asks whether they are a twin or who carried the pregnancy. Someone else carried them, so the parents who adopted them are recorded as not having carried them, and they are not anyone's twin. The twin question still appears when the participant was adopted by the same parents, since twins can be adopted together. If a parent who adopted someone is later changed to another kind of parent, the recorded answer that they did not carry the pregnancy is cleared and the question is asked again.
- bc7e02b: The Next button on Ego, per-person and per-connection forms now lights up as soon as every question has an answer, or once every required question is answered and the participant has scrolled to the end of the form. Answers already given, and an answer typed into the last question, now count without the participant first leaving the question.
- 552956e: Architect opens faster: the start screen loads first and the editor downloads
  in the background, so it is ready, and works offline, by the time you open a
  protocol.
- 43a407c: Opening Architect at an address it has no page for, such as a bookmark or restored tab for a page that no longer exists, now shows the start screen instead of a blank page. An unknown address inside an open protocol now shows the protocol's Stages page.
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

- 24c3716: On the Network Composer, the names of groups now show their formatting in the Groups list and on the buttons that add selected people to a group. Bold and italic text appear as formatted, and characters such as `<`, `&` and `'` appear as typed.
- 97933ea: The published apps no longer include the Development protocol, a test protocol that only developers can open. Its media files, including a 24 MB video, were copied into every release even though nobody could use them there.
- 5669fa1: Menu, select and combobox items now have a small gap between them, so a run of checked or selected items no longer merges into one block.
- e28359f: Leaving or finishing an interview now waits until the latest answers have been
  saved. If saving them fails (for example, because the connection dropped), the
  interview stays open and the confirmation explains that the answers could not
  be saved, so the participant can try again. Previously the interview closed or
  finished anyway, and the answers given since the last save could be lost.
- c4349f8: The delete button of the only stage that ends the interview is now unavailable, with a tooltip explaining that every protocol needs one, instead of opening an error. The notices shown when a stage cannot be deleted or moved because another stage skips to it, or because it ends the interview, now show their sentence instead of unreadable code.
- ac486db: Previewing a GeoJSON map file no longer fails when one of its features has no properties. The table now lists the properties of the features that have them.
- b42f631: Making the last line of a rich text field a heading no longer leaves an empty line under it. Press Enter at the end of the heading to carry on writing below it.
- 9483e9e: Inline fields (label beside a toggle) now sit on one row once their container
  is 28rem wide, down from 32rem. In Architect, the "Style “true”/“false” as
  negative" switch in a yes/no attribute's answers now fits beside its label.
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

- 362070b: Numbers, lists, coordinates and alphabetical order inside an interview now
  follow the language the participant is reading the protocol in, even when the
  interface itself is in another language. A participant reading a protocol in
  German sees `1.234,5`, a list as "a, b und c", and names sorted by German
  rules, rather than English formats and the browser's default order. Form
  fields in the interview follow it too: a date picker names its months, and a
  scale writes its value, in the protocol's language. Sentences the interface
  speaks, such as validation messages, stay in the interface language.

  On a roster card, an empty value or empty list now reads "No value" in the
  interface language (translated for every interface language) instead of a bare
  dash, and numbers, lists and locations are formatted for the protocol language.

  `@codaco/fresco-ui`: `Collection` takes a `sortLocale` prop (and
  `createCollectionSorter` a `locale` argument) to choose the language text is
  ordered in. Without it, `Collection` orders text in the interface language
  instead of the browser's default. `ContentLocaleProvider`
  (`@codaco/fresco-ui/form/ContentLocale`) names the language form fields write
  their values in; without one they use the interface language.

- 1e0625d: The Add languages dialog now names the languages you have chosen, rather than
  only counting them. When the names do not fit the field, it shows as many as
  fit and counts the rest, such as "English, Spanish, and 4 others".
- a0b3db7: On the Languages page, the pencil in a language's row now opens the translation
  table on that language, beside the default language, so its translations can be
  written and changed there. Changing which language a row is (for translations
  recorded under the wrong language) moved to its own two-way arrows button.
- 8139734: The language menu above translatable text now takes its text colour from the surface it sits on, so it stays readable on dark and coloured backgrounds.
- 1d2b623: Architect's fields for wording that runs to a sentence or more, such as the
  message a Finish Screen shows when finishing fails, now wrap onto more lines
  as the text grows, instead of hiding the end of it past the edge of a
  one-line box. This covers the Finish Screen's confirmation question and
  failure message, the Family Pedigree's hints and descriptions, the notices and
  error messages on name generator, bin, geospatial and network composer
  stages, and an image or video's description.

  The guidance under a Family Pedigree's name question can now be formatted in
  bold or italics, like a form field's hint, which it is shown as.

- 0912a1f: In the Narrative Pedigree, the highlighted line for a focused person no longer has gaps where it meets a dimmed line: where it turns at a line that carries on, or where a relative's dimmed line joins it. Every dimmed line is now drawn underneath the highlighted ones, in the interview and in saved snapshots.
- 3d1b535: In the Narrative Pedigree, the button that clears the focus on a person now sits in the toolbar instead of above it, and the toolbar's labels use smaller text.
- 2c1d478: A new stage's suggested name is now selected when you click into it, so typing replaces it instead of landing in the middle of it. Cancelling a new stage you have not changed now closes it without asking whether to discard changes.
- 5dda5bb: The tab on the drawer of people still to place (on bin stages and the
  sociogram) no longer shows a count, which repeated what the drawer already
  shows. Its chevron is larger and the tab stays easy to tap. Screen readers
  still hear how many people are left. When the sociogram's drawer is open and
  empty, a short looping animation of a pointer bringing a person down into a drop
  zone replaces the arrow icon; it holds still when reduced motion is on. On
  bin stages where people are placed by tapping, the drawer stays open and has
  no tab, so the person being placed is always in view.

  `@codaco/fresco-ui` adds `NodeDropAnimation`, a decorative loop of a pointer
  bringing a node down into a drop zone, for empty drop targets.

- c34db26: Node labels are easier to read. The node colors are adjusted, most of them darker, so their white labels stand out: all eight node colors now meet the WCAG AA contrast ratio of 4.5:1 for text, and the lighter half of each node stands out at 3:1 against the interview background. Nodes keep their two-tone diagonal.

  The node colors in the default and interview themes (`--node-1` to `--node-8`) are now derived from the brand colors rather than equal to them. The brand color Neon Coral is slightly lighter and less saturated, and Mustard, Neon Carrot, Sea Serpent, Kiwi and Paradise Pink shift in hue, so edge, ordinal and categorical colors, the destructive and warning colors, the loading spinner, Background Creator's color swatches, and generated background patterns built from them change color slightly too.

  In Architect, a read-only shape picker now tells assistive technology that its shapes are unavailable, matching the read-only type picker.

- 77264fa: An Ordinal Bin prompt now warns about having too many bins only beyond six, matching the documented guidance, instead of beyond five. A six-point scale no longer raises the warning.
- 277c544: On the Family Pedigree, the buttons that add a relative no longer flash
  shortly after they appear when the pointer rests on a person in Safari and
  Firefox.
- ef8d925: In a family pedigree, the birth parents of someone who was adopted away from
  them no longer count as the people who raised them; a birth parent whose
  partner adopted the child, as in a step-parent adoption, still does. An unnamed birth father of the
  participant's adopted partner is now shown as "Daniel’s Biological father"
  rather than "Father-in-law", and his relationship to the participant is
  recorded as another relative rather than a parent-in-law. The same holds for
  every step and in-law tie, such as a birth parent's partner or an adopted-out
  child's partner.

  Such an unnamed birth parent is now called "Biological mother" or
  "Biological father", beside the adoptive parents, wherever
  their gender identity is known.

- e6fedd4: In the Family Pedigree stage editor, the words of the completeness checklist moved from the completeness settings to the participant wording section, as its last group, "Completeness checklist". The group is shown only while the stage has a completeness requirement. Its labels now say which part of the checklist each box holds, such as "Missing parents item" and "No children button".
- 7d2293b: The Family Pedigree asks fewer questions whose answer it already knows:

  - Adding an adopted child or an adoptive parent no longer asks who carried the pregnancy; the adoptive parent is recorded as not having carried it. A parent who did carry it can still be recorded from their panel.
  - Someone born to a couple is no longer offered as the twin of a child they adopted, whichever of the two is added, and the person panel's twin list leaves them out too.
  - When two twins cannot be identical, the sibling form offers only "No" or "Yes, fraternal", and the person panel records them as fraternal without asking. In the sibling form that is when they differ in sex at birth or do not share both genetic parents; in the person panel, where answering identical brings the twins' genetic parents into line, it is when they differ in sex at birth or their parents cannot be brought into line. The question returns, unanswered, if a change makes identical twins possible again.
  - A new twin is recorded as carried by whoever carried their twin, without being asked. If the twin answer is changed to "No", the question comes back.
  - The twin question appears only once the new sibling shares whoever carried the participant.
  - When adding a parent, the question about their partner waits until the kind of parent is chosen.

- df1708b: In the Family Pedigree and the Narrative Pedigree, Show the whole family (and every automatic reset of the view) now zooms in as far as the family fits, up to a fifth larger than its natural size, instead of stopping at its natural size.
  The Family Pedigree no longer keeps empty room around the family for the add-relative buttons, so the family fills the space between the prompt and the toolbar.
- af48c8c: In the Family Pedigree stage editor, the name attribute's validation no longer offers the "Required answer" rule. The interview gives every family member a name, either the one the participant types or a label generated from their relationship to the participant, so the rule could never apply. A rule already set on the attribute can still be switched off there.
- e31a3c9: In the Family Pedigree, more answers saved by mistake can now be corrected without deleting anyone. The newest answer wins:

  - Recording, when adding a parent or connecting two people, that someone carried the pregnancy (a Surrogate included) is no longer unavailable when another parent is recorded as having carried it. That parent is left with nothing recorded about carrying.
  - Choosing a biological parent or donor while a biological parent with the same sex at birth is recorded is no longer unavailable. The form asks what kind of parent they are instead.
  - Answering that two twins are identical gives both of them the same biological parents and donors, where that is possible.

  A hint under the answer says what choosing it will change, and Undo reverses it once saved. The question about a parent's kind now reads "What kind of parent is Julie to you?" instead of "Julie is your…". The stage wording gains `carrierReplaced`, `geneticParentReplaced` and `identicalTwinSharesParents`.

- ab9a884: In the Family Pedigree, a sex at birth saved by mistake can now be corrected from the person's own panel. Previously a parent recorded as having carried the pregnancy could not be changed to male, and a genetic parent could not be given the same sex at birth as the other genetic parent, so swapping two parents' answers meant changing a relationship first. Now the newest answer wins: every sex at birth stays available, and saving one that contradicts another record clears that record so it can be answered again. The record that the person carried a pregnancy is removed, and the other genetic parent's sex at birth is cleared. The hint under the field says what saving will change before the participant saves, and Undo reverses it. Only a surrogate still cannot be recorded as male. The stage wording `unavailableSameSexAsCoParent` is replaced by `sexChangeClearsCoParentSex` and `sexChangeEndsCarrying`, and `unavailableCarried` now applies only to surrogates.
- 3c5d750: The Family Pedigree's person panel asks "Who carried the pregnancy?" once, as the add forms do, instead of asking whether each parent carried it. The participant chooses one of the parents who could have, or "Someone else, or I don’t know". Choosing another parent moves the answer to them. Choosing "Someone else, or I don’t know" no longer records the parent as having carried it. The question is not asked while one of the parents is a surrogate.

  Choosing "Someone else, or I don’t know" for a twin takes back the carrier their twins were recorded with, and keeps any recorded "No".

  The twin question now reads "Are any of these siblings your twins?", or "Are any of these siblings twins with “Sophie”?" about someone else.

- 6cc9d9d: Family Pedigree labels that describe someone through a relative no longer capitalise the kinship word after the relative's name: "Ana’s parent" rather than "Ana’s Parent". Languages that put the kinship word first ("Parent de Ana") or capitalise every noun, such as German, are unchanged.
- f8bf0c3: Refinements to the family pedigree:

  - The side panel casts a clearer shadow over the family tree, and moving between its groups of questions no longer flashes a horizontal scrollbar. After the last required answer in a group, the answer shows a little longer before the next group slides in.
  - The menu for adding a relative now opens on top of everything else on the screen, after the pointer rests on a person for a moment, and its buttons cast soft shadows.
  - The family tree never shows anyone larger than their natural size when it fits the family to the screen, and no longer shrinks a little each time the side panel opens; zooming in is left to the participant. Selecting someone centres them together with their partners and children.
  - The progress list shows what is done, ticked and struck through, as well as what is still needed. Missing details are listed person by person until all are given, then as one item, ticked once nothing else is needed.
  - Gender identity, where the stage asks it, must be answered before a person is saved, and counts as a missing detail until it is. "Did this parent carry the pregnancy?" must be answered too, and now offers "Don't know", which records nothing.
  - Long kinship words break inside a symbol at the places the interview sets for the stage's own languages. Wording a researcher writes can carry its own break points as soft hyphens, which are kept, so any language can have them.

- 0336cf4: In a family pedigree, a question limited to people of one sex assigned at birth
  no longer shows a note under the family tree saying who can't be selected. The
  people it leaves out are still shown unavailable. The note's wording setting is
  gone from Architect and from the schema 9 Family Pedigree stage.
- 84bf796: Family pedigrees draw the lines of donors, surrogates and social and adoptive
  parents more simply.

  - Each line runs straight from the centre of one symbol to the centre of the
    other, bending only to get round someone in the way. Where lines cross,
    they cross plainly; they no longer hop over each other.
  - A donor or surrogate of some of a sibship has a line to each child. A line
    for a whole sibship joins the sibling bar where the line of descent meets
    it.
  - Children carried by a surrogate hang from her, as before, unless hanging
    them from their genetic parents gives fewer crossing lines. A child she
    carried with no biological parent recorded shares a sibling bar with the
    others she carried, so twins hang from one bar.
  - People are seated so that lines can run straight: a seating whose lines
    would have to bend round someone's symbol is passed over for one where
    they need not, even at the cost of a crossing.
  - A line may leave a symbol closer to where another line meets it, as long
    as the two part at a clear angle.
  - A parent no longer sits straight above a child they draw a line of their
    own to, where that line would run down over the line of descent. Where a
    row has no room to move them aside, the people beside them move half a
    seat with them.
  - A donor sitting straight above where their children's line of descent
    meets the sibling bar draws a straight line down that joins it, as two
    co-parents' lines do, instead of hooking round it.
  - Lines into an adopted child cross the adoption bracket to the child's
    centre, and the brackets are drawn in the text colour.
  - Lines into one child each arrive from a direction of their own, and a
    family is still laid out within one frame budget.

- aa76c59: In the printable protocol summary, the Family Pedigree and Narrative Pedigree
  tables keep their labels to a third of the page width, wrapping long labels
  onto more lines. The wording beside them, such as the long hints about
  unavailable answers, now has room to read across the page instead of running
  down a narrow column.
- 33f0a91: In the Family Pedigree stage editor, the Symbols choice has its usual space again before the "Record each person's relationship to the participant" section.
- 624a6f8: Every Family Pedigree toolbar button now has a tooltip that names it and says what it does, including the Show the whole family button, which had no tooltip before.
- a8c2a11: Family Pedigree: choosing an item from the "what's still needed" list now
  puts the list away, so it no longer covers the details panel it opened. The
  notice listing missing details no longer ends a question with "?.".
- 6cc9d9d: The Family Pedigree's add-person steps no longer pre-select any answer: the kind of parent, child or sibling, the other parent, whether two people are still together, shared parents and twins all start unanswered. A step's button reads "Skip" only while nothing on it is answered, and "Continue" once anything is. The "Some details are missing" notice is removed, along with its `missingDetailsList` wording. When participants add their own child, the step-child, donor and surrogate options now say "you" ("A child you carried as a surrogate"), through a new `isYou` argument on the `childKindSocial`, `childKindDonor` and `childKindSurrogate` wording.
- 72b189a: In the Family Pedigree, twins share one carrier: answering who carried one twin answers it for the other, and the add-child and add-sibling forms now require "Who carried the pregnancy?" to be answered. Continue on a step with a required question left unanswered now shows the same error Save does, instead of doing nothing visible. When participants add a partner, "Are they still together?" names the person ("Are they still together with “Dina”?"). Two people recorded as female and male at birth are not offered as identical twins. Questions no longer put a possessive after a quoted name ("Are they a twin of “Cara”?" instead of "Are they “Cara”’s twin?"). A new sibling who would not share the person who carried someone cannot be their twin. When editing someone's twins, a twin recorded with a different sex at birth from another twin already answered identical cannot be identical too, since all of them would then be identical. Editing someone no longer offers as their twin a sibling someone else carried, and adding a sibling checks "Yes, identical twins" against the sex at birth of every twin identical to the person. Whoever is recorded as carrying one twin counts as having carried them all, so adding or connecting a parent cannot record someone else as carrying another twin. When someone recorded as male at birth cannot be a surrogate, the hint gives only that reason, not also who else carried the pregnancy. Adding a parent asks whether they carried the pregnancy only once their kind of parent is chosen. `validateField` in `@codaco/fresco-ui`'s form store takes a `showErrors` option that marks the field touched so its error shows.
- 7d6ebb8: In the Family Pedigree, the view now goes back to the whole family, centred, whenever the participant presses Show the whole family, moves to another prompt, or finishes adding or editing someone, instead of keeping where they had dragged or zoomed it. The zoom fits the whole family, no larger than its natural size and no smaller than the furthest the zoom buttons go.
- b7a7d08: The Family Pedigree opens framed as Show the whole family frames it, and moving between prompts keeps the participant's zoom and pan. Show the whole family frames the same family the same way on every prompt, and, like the opening view, zooms out no further than names stay legible, centring on the participant when the whole family would be drawn smaller.
- 042f94c: When several notes show above the protocol card on the Stages page, they now sit closer together, with the same space above them (below the toolbar) as below them (above the protocol card).
- 92cf293: Reduced motion now follows `AnimationProvider`'s `reducedMotion` setting everywhere, not only in Motion components. `@codaco/fresco-ui/reducedMotion` adds `usePrefersReducedMotion()` (use it instead of Motion's `useReducedMotion()`, which reads only the operating system) and `prefersReducedMotion(node)` for code outside React. The provider marks the document root with `data-reduced-motion` when it overrides the system, and `@codaco/tailwind-config`'s `motion-reduce:` / `motion-safe:` variants and its global reduced-motion rule follow that mark. With the default setting nothing changes: motion follows the operating system's preference as before.
- 8470005: The interface previews in Architect's timeline and stage picker show the current interview interfaces again: the bins and sociogram show the new node drawer tab, the Family Pedigree shows its new toolbar, and the language chooser and Ego Form show their current layout. Previews no longer show a keyboard focus ring on a control the interface focuses when it opens.

  The active sort button on a roster name generator is coloured again. It had taken the interview theme's white selected colour, which looked the same as the inactive buttons.

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
- 9fdb4ff: When an interview task cannot be displayed, the error screen's copy button now reads "Copy" and changes to "Copied" for a moment once the debug information has been copied, which screen readers also announce. The message above it is now set out as a heading and short paragraphs instead of one block of text, in every language the interview ships. New protocols get the new wording; a protocol that already holds its own wording for this message keeps it.

  In Architect, the Languages page now offers the translation table even when a protocol has only one language, since that is where the protocol's own words for the interview, such as this error message, are edited.

- 7b38b84: When you create a protocol from a template, its suggested name is now selected, including after you click into it, so typing replaces the name instead of landing in the middle of it. fresco-ui gains a `useSelectOnFocus` hook that Architect's stage names and protocol names share.
- 332df6a: Rounded corners now always come from the theme's radius tokens, including on elements that animate their size. The segmented toolbar is a full pill at every screen size, so its ends match its round buttons on large screens too, and its corners stay round while tools appear and disappear. Lists of items in forms, the expanded category in the categorical bin interface, and dialogs that open out of a list row keep the theme's corner radius throughout their animations.

  `@codaco/fresco-ui` adds `useTokenRadius` (`@codaco/fresco-ui/hooks/useTokenRadius`), which reads the radius an element's `rounded-*` class resolves to so it can be passed to a Motion component's `style.borderRadius`. `ModalPopup` applies it itself for a `layoutId` morph.

- 6a26bd3: In the translation table, a text that shows values is edited in the same
  frameless cell as any other text, with its formatting toolbar above the text.
  Before, its editor kept its own frame, and the toolbar slid down over the
  words it formats.
- a7ca9c1: When a value's versions are open in a text field, a version that wraps onto more lines now stays inside its dashed box in Safari, and each version's label sits level with the version's first line.
- Updated dependencies ([50cc7c9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/50cc7c9c97a835bde5752f614b683dda7a66a9c4), [b8a5637](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b8a563797c356e3ad9091a9200d59666e8851c66), [bc7e02b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bc7e02bd1214ed20e5c5eccfe416a1ed07db7542), [0aee4be](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0aee4be0be8a8efe379ea249b47b6ca754702d21), [9fdb4ff](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9fdb4ff704487d4178d6ad5470e5440c056ebd55), [15155f3](https://github.com/complexdatacollective/network-canvas-monorepo/commit/15155f30295aadbf41691556a7251685b392ee52), [4de3f45](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4de3f45c1ecc06799211c41c1d72cee8fce7aa10), [7d8e136](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7d8e13644eaf7da31b7c2192c4faad0b7104bc10), [8b35658](https://github.com/complexdatacollective/network-canvas-monorepo/commit/8b35658a427674b37ae8fada8c4f38f6b0689b16), [8884dec](https://github.com/complexdatacollective/network-canvas-monorepo/commit/8884dec06e921f61be7ea36b5c1c81384c302d82), [716e3d7](https://github.com/complexdatacollective/network-canvas-monorepo/commit/716e3d75854022d1becf9d207eb2b159ead8185a), [dfcee00](https://github.com/complexdatacollective/network-canvas-monorepo/commit/dfcee00beb5a93d6e8ef0bea602d266091c6c5d7), [24c3716](https://github.com/complexdatacollective/network-canvas-monorepo/commit/24c371606fc81b91db9ebfe0481d08073714a73c), [5669fa1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5669fa125753a8159779edf013fa4aeb20a75db0), [c210bce](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c210bcea0f237d5e98e71921f297fb5411540f30), [9c1aeff](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9c1aeff40eca424c3ed29d3f98ff6b6b4e1a4c74), [7002c7c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7002c7c68cda62a061bc2d66869b4830a727b7e2), [e749c06](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e749c06db7d8ee60d34a06d232ebbe33b4a38ba0), [ed8fef3](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ed8fef34d368c0db913e7db78077a701bbb23144), [c8dfb28](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c8dfb284ef838c2aa54496e56d8274ee11332085), [2ff161c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2ff161cd71741a8405cef57ac08aa5b5b8ac9fd0), [e28359f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e28359fa2f44ad1ea8cb9405450c20632feb8120), [2729855](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2729855a94c6a71f68283236ddb3c5810f1b6638), [43ffe6f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/43ffe6f1680658ff475ed51bc924557f282afbd8), [38bbefa](https://github.com/complexdatacollective/network-canvas-monorepo/commit/38bbeface8c200142985951fe5d41bffa3b5aafc), [c058462](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c0584624345133246137fb4effff9920fce288ff), [1432069](https://github.com/complexdatacollective/network-canvas-monorepo/commit/14320697db5c21da818bd474ab18737d7b22d36a), [552956e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/552956e8508851acab50a881777a11f66626c883), [151e511](https://github.com/complexdatacollective/network-canvas-monorepo/commit/151e511823d3cf083db2d2bb8e98c740cb9c657d), [ca97000](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ca97000fb02653324f07343037df9cef94a1e0dd), [7050d25](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7050d258394cefd7e854858d8eb90df2bedba4cd), [bec9b59](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bec9b594e43ae07bd2c72ad476b6f243c0ec7f8f), [729c670](https://github.com/complexdatacollective/network-canvas-monorepo/commit/729c67096aa934d9fcdbf0405a864a978e39556c), [1769104](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1769104cce2773332238e4b941a6b6cae91750f9), [6956edc](https://github.com/complexdatacollective/network-canvas-monorepo/commit/6956edcc582e652c765136a4909fc7244de82de3), [66b2226](https://github.com/complexdatacollective/network-canvas-monorepo/commit/66b2226e4a8865cc003b501cced0cfbf55fb3e4b), [6d1307c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/6d1307c702f02f8c0450fdd6282088de05b9cd73), [7225b5c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7225b5cce7ec60634b21a86342682c0622f0f714), [90ddb32](https://github.com/complexdatacollective/network-canvas-monorepo/commit/90ddb329959d48ba4da0813827a7717b91988459), [0cd3a3e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0cd3a3ebbcadfdfcb19ecd8b595f0bb5f13f4ed8), [21ea84b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/21ea84bb89452b462d15b588375813bf34badf37), [97a6ca1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/97a6ca1a842063bf199a54de00a7fd9c2c5b3eb9), [b42f631](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b42f631494112610a010af7ee328d04a351a3696), [9483e9e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9483e9eff45cf51bf9790c18240e5054ac619c66), [db8a2af](https://github.com/complexdatacollective/network-canvas-monorepo/commit/db8a2afe52bcd4eebf3240b0aab2fee13a33a77a), [362070b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/362070b9ba2b90b22bee9fdf855c17fad46df202), [2408129](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2408129ceb43de2d91a0365e966cffa462afc6d0), [7fa80c2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7fa80c26ae731b2919033c33299eea5f7785695a), [630410b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/630410bedccb59e3ea94d866a3234a98abd3a78c), [1d2b623](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1d2b623e77327a01bd2e1462d288ecab5b82c23d), [0912a1f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0912a1f880c05f1e2c031294423e600a433392c6), [3d1b535](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3d1b53515231bd295897cc82e576622146266c4a), [5dda5bb](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5dda5bb0592cf4f304e3089335396e3d47380b11), [c34db26](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c34db2601b78441316b3d9c9ec8d1b839d92f3db), [277c544](https://github.com/complexdatacollective/network-canvas-monorepo/commit/277c5443c2da871038c8588abb2d0537639702fb), [ef8d925](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ef8d925f2c3ba879daeae365a4b5d16b964b332a), [7d2293b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7d2293b8fe01802c8ffe08bb934a4cf37e93bf38), [df1708b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/df1708b22c70d228605605198fccdd4cf2760445), [e31a3c9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e31a3c97a48d8c10c6b788957c68a5d4073a7512), [ab9a884](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ab9a884c73208b942a19c2e032b079e8b3f6ae98), [3c5d750](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3c5d750182d55e3aa5baa155f8e5364071adaa99), [6cc9d9d](https://github.com/complexdatacollective/network-canvas-monorepo/commit/6cc9d9de66924da47480cbf3405ac84cd16cc367), [f8bf0c3](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f8bf0c3baec102c837f3a50e79ea7ad71e7c62ad), [0e9243e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0e9243e5bd375df66f625ae1c94b62c891def082), [0336cf4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0336cf4696df7e3c6f8bbd4a7416cf87f9a46676), [84bf796](https://github.com/complexdatacollective/network-canvas-monorepo/commit/84bf796ac81ff786744bf9159f5683c87c10b8bb), [624a6f8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/624a6f85d4003d4d84763e08bdbf8f3031cea45c), [a8c2a11](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a8c2a1172919791c2854bada51ab5f7c3d68b35f), [72b189a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/72b189ae35ec66ae2cafb99ff0fe47686c72ace8), [be92228](https://github.com/complexdatacollective/network-canvas-monorepo/commit/be92228a08d3cdbd5059774e187774daf11d2a51), [7d6ebb8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7d6ebb8e761acaefc8c92555b2a7e9520a2a7509), [b7a7d08](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b7a7d0807192f2db652db16af880f7b1444d84c7), [d0118fe](https://github.com/complexdatacollective/network-canvas-monorepo/commit/d0118fe562008020c876dfceec6f31bb6f7e1dde), [92cf293](https://github.com/complexdatacollective/network-canvas-monorepo/commit/92cf293eb8b7d10d3a0d601283e3996f56eab415), [8470005](https://github.com/complexdatacollective/network-canvas-monorepo/commit/84700053a750432593dfe5df51fe1cddaf36f58e), [43acfe0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/43acfe075af1876a75051b288b72fc728a2ee0c4), [08d76d8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/08d76d8da691c536eecbb252b7f1960a79321216), [18f0696](https://github.com/complexdatacollective/network-canvas-monorepo/commit/18f06960be51e4bd2b3395393a99d92196efdafc), [7bc3d43](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7bc3d437143887b29bdafe5d880fa4a251416621), [c68530b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c68530b55e361f0276f08155f7fbef70c3422883), [40ff4e9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/40ff4e93fbd889bddf42d094e2c3a063c5955816), [2e44834](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2e448345e3221e75a5f5d6c445049279bfd2b606), [01189fd](https://github.com/complexdatacollective/network-canvas-monorepo/commit/01189fdde1a68bb8d6e53bf1e855917c39a06b21), [069c9d0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/069c9d0dad52cd17743bbb7e0ac748a9bc113c0b), [3810333](https://github.com/complexdatacollective/network-canvas-monorepo/commit/38103337561800dd4e57f96dff9c589047bd862e), [cad7309](https://github.com/complexdatacollective/network-canvas-monorepo/commit/cad7309fa78cb2609416f1f445fdc4ad8ffcf226), [20cd773](https://github.com/complexdatacollective/network-canvas-monorepo/commit/20cd773b0ef51a9a8bcf4896205216e9a6f68727), [3f3397a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3f3397ae06c56dcc4eac6ab150e922fb6b3882d7), [ad201b2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ad201b20d586082ba4f20d06961177fa74149db6), [7b38b84](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7b38b84c6df8324e1798c2c305142d72cb289c6f), [332df6a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/332df6ae2b31b24b4da8d109c8a221cab6c1e494), [b4bc4c1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b4bc4c1e8e984545ab707101ace9cba9ab8e02d7), [a7ca9c1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a7ca9c137e5031acc3744a8024edb6f23898cfeb))
  - @codaco/interview@12.0.0
  - @codaco/protocol-validation@16.0.0
  - @codaco/protocol-utilities@6.0.0
  - @codaco/app-i18n@0.4.0
  - @codaco/shared-consts@7.0.0
  - @codaco/fresco-ui@9.0.0
  - @codaco/tailwind-config@1.6.0
  - @codaco/art@0.1.6
  - @codaco/interface-images@0.0.2

## 8.5.2

### Bug fixes

- Older protocols that would not open with an "Unrecognized key: parameters" error now open. This happened when an attribute's type or input control had been changed in Architect Classic, which left behind settings the new attribute type cannot use. Opening the protocol now removes those settings and lists the change in the upgrade notes.

## 8.5.1

### Bug fixes

- Option labels show their formatting again. The option rows of a variable's choices, the read-only options table, and the shape picked for each value showed a label's markdown and escape codes (`**Regularly**`, `&lt;3`, `Don&#39;t know`) instead of the formatted label, and a screen reader read the shape picker's name the same way.

### Interview changes (seen in Preview)

These fixes to the interview are shared with Interviewer and Fresco.

- Network Composer's group names, in the Groups list and on the group buttons for selected people, show their formatting instead of their markdown.
- A screen reader now reads a toggle button option, and the chosen point on a Likert scale, by its label as shown rather than by its markdown.

## 8.5.0

### New features

- **Ready for Architect 9.** Architect 8 can now run inside Architect 9, on the same site, so you can keep editing schema 8 protocols after Architect 9 ships. There it is the protocol editor alone: Architect 9 opens your schema 8 protocols in it, and closing the editor takes you back to Architect 9. Architect 8 on its own works exactly as before.
- **Open protocols sent from Sketch.** A study design you send from Sketch opens in Architect as a new protocol in your library, ready to edit.

### Interview changes (seen in Preview)

These improvements to the interview are shared with Interviewer and Fresco.

- **Dragging on touch screens.** Dragging people out of a scrolling area now goes the way you'd expect. In the Sociogram's bin you can drag a person straight up or diagonally onto the canvas, and swiping sideways scrolls the bin. In the roster and name generator panels, swiping up and down scrolls and dragging sideways moves a person. To drag along the direction an area scrolls, hold the person still for a moment first.

### Bug fixes

- The update check now offers the newest release, not whichever release GitHub lists first, so a fix for an older version is never offered as an update to a newer one.
- The released app no longer includes the developer test protocol and its media, among them a 24 MB video.

## 8.4.0

### New features

- **Seven new languages.** Architect is now available in Brazilian Portuguese, Dutch, French, German, Italian, Simplified Chinese and Traditional Chinese, as well as English and Spanish. Pick one from the language setting, which now has a search box, or let Architect follow your browser's language. The interview controls participants see in Preview are translated too; your protocol's own text stays in the language you wrote it in.
- **Faster start in any language.** Architect now downloads only the language you use rather than every translation. If a language can't be downloaded, Architect keeps working and offers to reload. The installed offline app still includes every language.
- **Browse a protocol that's open in another tab.** When a protocol is already being edited in one tab, a second tab can now open every page of it in read-only mode, with a banner explaining why. You can still search, preview, print and download it, and the tab becomes editable as soon as the other one closes the protocol.
- **New template: Help-Seeking After Intimate Partner Violence.** This built-in template shows encrypted attributes in use: the names and private notes a participant records about people are encrypted with their own passphrase, while relationship types, disclosure, reactions and the services they use stay readable for analysis.
- **Templates first for new users.** The home screen opens on the Templates tab when you have no recent protocols.
- **Paste to upload.** You can paste a file onto a selected file drop area.

### Interview changes (seen in Preview)

These improvements to the interview are shared with Interviewer and Fresco.

- **Passphrase-protected answers.** For studies that protect answers with a passphrase, protected answers are no longer lost or saved in a way that can't be read back, and participants are told when an answer wasn't saved so they can try again. Once some answers are protected, a passphrase that can't read them is turned away with a message, so a typo can't start protecting new answers with a different passphrase. The passphrase button is now available on phones and portrait screens.
- **Family pedigree.** Complex families now draw correctly, including half-siblings, step-parents, chains of partnerships and children whose parents aren't a couple. A participant's chosen terms are kept when the pedigree is reopened, and the "finalized" notice no longer hides the bottom of a tall pedigree.
- **Network Composer.** Changes in the side panel are saved when the panel closes instead of being lost, and undo and redo now update the panel.
- **Accessibility.** Screen readers name each person by the label on their node, and audio or video without a description is announced by its name rather than its filename.
- **Privacy.** Analytics no longer include protocol details such as codebook type names or validation messages, and analytics and error reporting run only from code shipped with the app.

### Bug fixes

- Text in angle brackets in introductions, prompts and labels now appears in the interview. Fields saved by an earlier version need to be edited once.
- Changing language with a stage editor open no longer loses files imported in it.
- Sociogram, Narrative and Network Composer stages with an image background can be saved after changing the node type.
- Cancelling an unchanged Sociogram prompt no longer asks to discard changes.
- Turning on roster search in a Name Generator for Roster Data stage now starts at High accuracy, so Finished Editing no longer refuses the stage until the slider is moved.
- The Skew circle sizes switch now shows on for backgrounds that don't set it, such as the sample protocol's Narrative stage, matching what interviews draw.
- The example names under a type's name field are now valid in every language.
- Deleting a codebook entity or variable waits until it's done and shows an error if it fails.
- The "Return to Start Screen" button is no longer cut off.
- Long ordinal bin labels are no longer cut off.
- Names that couldn't be added on a name generator are no longer cleared.
- Navigation buttons stay on screen on small phones and at larger text sizes.
- Dropping a file onto a busy or disabled drop area no longer opens it in a new tab.
- The hourly update check no longer reports false errors when offline or in Firefox.
- Updated third-party libraries.

## 8.3.0

### Minor Changes

- a749731: Every stage editor is now the shared protocol-builder editor, and Architect has
  one implementation of every stage-editing control rather than two. Each
  interface keeps the same sections, fields and saved protocol, and gains a
  section outline that says which parts of the stage still need attention. Undo
  and redo now cover saved changes to the protocol rather than unsaved typing
  inside an editor, and changes made to the codebook while a stage is open are
  kept when the stage edit is cancelled — an attribute belongs to the codebook
  every stage collecting it shares, not to the one stage being edited.

  Rules that contradict each other are now reported in the words that say what to
  do about them, rather than the technical diagnostic written for a validation
  report. A protocol that has recorded nothing about the participant yet can now
  gain its first list-of-answers or scale attribute from a form field, and a new
  node or edge type takes the next colour in its palette rather than always the
  first.

  The app's own copies of the field, rule, validation and parameter editors have
  been removed, along with the editing state they needed. The printable protocol
  summary now reads a rule back in the same words the rule list does. One sentence
  changes: a rule asking whether the participant has answered one of their own
  attributes at all printed as "Ego where Age", a clause with nothing after it,
  and now prints as "Ego has Age". Every other rule reads as it did, and nothing
  about a saved protocol changes.

- 86aecd1: Choose English, British English, or Spanish for Architect. Language settings are saved on this device and apply to editor controls, guidance, dialogs, reports, and built-in preview controls. Preview menus can select their own interface language, while protocol-authored questions, labels, options, and data stay unchanged.
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

- 29b11be: Built-in interview controls, help, validation, dialogs and accessibility messages
  are available in English, British English and Spanish. The interview menu now
  includes an interface language chooser, with all messages available offline.

  Hosts can pass a preference or an already negotiated language through
  `Shell.requestedLocale`; the interview package finds the best match among its
  own supported languages. `onLocaleChange` lets hosts persist menu choices, and
  `InterviewI18nProvider` gives inline field previews the same negotiation and
  catalogs. Language changes preserve entered answers, open forms and the current
  interview position. Protocol-authored content and research values keep their
  existing language and meaning.

- aab7516: Architect and Interviewer share one interface-language switcher. In Architect
  it sits in the header navigation and names the language in use, written in
  that language; in Interviewer it is a globe button in the home status bar.
  Both open a list of every interface language, each written in itself. The
  first entry, Automatic, says which language the browser currently resolves to,
  and while it is chosen the switcher names that language rather than announcing
  itself as automatic.

  Choosing an entry applies at once and closes the list. A choice that could not
  be stored is reported in the list's footer, with a button to try again.

  Architect's language dialog behind the translate icon is retired in favour of
  the header switcher. Interviewer's settings dialog, welcome screen and setup
  wizard keep their language selects.

  For anyone building on `@codaco/fresco-ui`: `navigation/LocaleSwitcher` is the
  new component. It takes the app's locale registry, the stored preference, the
  locale automatic resolves to, the host's save state, and whether it persists
  to a device or an account; its own chrome is translated once under
  `frescoUi.localeSwitcher.*`. `display` chooses what the trigger shows beside
  the globe — `label` always names the language, `icon` never does, and
  `responsive` drops the name once its container is narrower than 36em.
  `searchable` adds a search box, for a host offering more languages than a list
  can carry comfortably; it is off by default and matches a language by its own
  name or its tag. A host whose bar dresses its own controls hands the trigger
  element in as `renderTrigger`; Architect's header does, so the switcher sits
  in its navigation list styled like the links beside it.

### Patch Changes

- 486ad48: Choosing an attribute is a searchable window again. Every control that asks
  which codebook attribute something records — a form field, a prompt, a rule, a
  pedigree slot, quick add — now opens a window with a search box and a keyboard
  navigable list, instead of a dropdown you had to scroll. Each attribute is
  shown with the kind of answer it holds, so a type carrying dozens of them can
  be read at a glance, and the arrow keys and Enter take a row without reaching
  for the mouse.

  Where a control lets you invent an attribute, you do it from the same window:
  type a name nothing matches and the first row offers to create it. A name the
  type already has, or one holding characters the export formats cannot carry,
  says so on the row before anything is written.

- 043c098: Error messages inside a list item in Architect, such as the one under a
  yes/no attribute's answer labels, can be read again. They were red on the
  slate blue row and almost invisible. They now appear as white text in a red
  box, the same treatment Fresco UI already uses for errors on coloured
  backgrounds. Other destructive text on these rows, such as the required-field
  marker, is drawn in a light tint that stays legible against the row.

  In Fresco UI, `FieldErrors` now draws its messages as that red box by default
  when it sits inside `<Surface series="accent">`; pass `variant="text"` to keep
  plain text there. In the default theme's dark mode the box uses dark text
  instead of white, which read at 3.85:1 on the brightened red there and now
  reads at 5.06:1; every other theme draws it as before. A new `useSurfaceSeries`
  hook, exported from `@codaco/fresco-ui/layout/Surface`, tells a component
  whether it is inside an accent or a default Surface.

  Destructive text across the library, such as required-field markers, inline
  error lines and the weak password label, now uses `text-destructive-ink` rather
  than `text-destructive`, so an accent Surface can give it a legible colour
  without changing destructive buttons and badges. `getPasswordStrength` returns
  `'text-destructive-ink'` as the `colorClass` of a weak password, and the
  `PasswordStrength['colorClass']` type changes to match.

- 55bf4da: Links inside a list item in Architect, such as a link in an Information stage's
  text block, can be read again. They were coral on the slate blue row and almost
  invisible. They are now white and underlined, so they stand out from the text
  around them.
- a75437b: The Sociogram, Narrative, Network Composer, Geospatial, Family Pedigree,
  Narrative Pedigree and Anonymisation stage editors say what Architect 8.2.5
  said again. 110 section titles, descriptions, field labels, hints and
  placeholders go back to the released wording in English and Spanish, and the
  hints, placeholders and empty states the rebuild invented — which Architect
  never showed — are gone. The Mapbox API key hint carries its documentation link
  again, a canvas tick list with nothing to offer says so inside the list
  itself, instead of rendering an empty box, every disease and map-highlight
  colour is announced by its name ("Neon Coral", "Sea Green") rather than by its
  position, and the at-risk explanation cites Bennett et al. (2022) as it did
  before.
- 91a25de: The stage editor's shared sections and its form-family editors say what
  Architect has always said. Section titles, descriptions, field labels, hints,
  placeholders and empty states across the subject picker, stage filter, skip
  logic, task introduction, page content, prompts, sort order, background, side
  panels, quick add, the form-fields section and the attribute editor now match
  the released wording word for word, in English and Spanish, and around sixty
  invented hints and placeholders that Architect never showed are gone.

  The stage filter's description now says what that section does: "Create rules
  that filter which nodes or edges are displayed on this stage."

  Three explanations come back with it. The background image picker and the
  input-control picker link to their documentation pages again; choosing an
  attribute that already exists explains why the list of input controls is short
  ("Attribute type is locked") and choosing a control for an attribute being
  invented says which type it will create; and a form field's collapsed row
  names its attribute type and input control in the reader's own language,
  filled in that type's colour, instead of showing a raw schema token.

  A validation rule is now called the same thing everywhere: the names come from
  `@codaco/protocol-validation`, which is what a protocol's own validation errors
  already use.

  Colour swatches announce the colour they are rather than their position in the
  palette — "Sea Serpent" rather than "Node color 2" — for everyone choosing one
  with a screen reader. Architect's own colour picker in the codebook reads its
  swatch names from the same list, so the two announce a swatch identically.

  For anyone building on `@codaco/fresco-ui`: a field's hint is now given to
  `Hint` as its `hint` prop, with a field's validation summary as a separate
  `validationSummary` prop, so a field carrying both keeps them as two
  paragraphs. Passing the hint as children still works and renders as before.
  A `Badge` given both a `color` and `variant="outline"` now reads in the surface's
  own text colour instead of the theme colour, which most of the palette does not
  reach 4.5:1 against a wash of itself; the colour is still the badge's border
  and background.
  A filled `Badge` now reads in whichever of black or white contrasts better with
  the colour it is filled with, worked out from that colour rather than assigned
  by hand, so every colour in the palette carries a readable label. The palette
  itself is exported as `BADGE_COLORS`.

- 39e178b: Editing a form field is a two-pane dialog again. The field's settings stay on
  the left; on the right is the question as the participant will meet it, in the
  interview's own theme, and it can be answered — "Check response" runs the rules
  the attribute carries, so a researcher can see what a participant would be
  told without leaving the dialog. The preview follows what is being typed or
  chosen, including the values, control settings and rules authored in the
  dialog itself, and answering it changes nothing about the protocol. Below the dialog's
  breakpoint the two panes stack into one column. It appears wherever a form
  field is authored: ego, alter and relationship forms, a name generator's form,
  a family pedigree's family-member form, and the network composer's node and
  connection forms.
- 50afa35: The name generator, census and bin stage editors say what they said before the
  protocol-builder rewrite. Every section heading and description, every field
  label, hint, placeholder and empty state across the three name generators, the
  Dyad, One-to-Many Dyad and Tie-Strength censuses and the Ordinal and
  Categorical bins is Architect 8.2.5's wording again, in English and in Spanish
  — so "Prompts" is "Prompt collection", "Card details" is "Card display",
  "Roster order" is "Roster sorting", "The bins" is "Categorical response", and
  the ~30 hints and empty states the rewrite invented are gone. A side panel's
  data source is once more labelled by the panel's number, and the censuses name
  their prompt group and their connection control the way each of them used to.
  A Tie-Strength Census prompt no longer raises a notice above its prompt box
  telling the researcher to write a question every point of the scale can
  answer, which disagreed with the hint under the box asking for one answered
  yes or no; Architect's hint is the only guidance there, as it was.
- ce5e872: The node type editor offers the icons themselves again, and the dialogs it opens
  close instead of vanishing.

  Choosing a node type's icon is a search through the icons again. The field had
  become a plain text box asking for an icon's name typed exactly — so the only
  way to find one was to know it already, or to guess and be refused. It is a
  searchable list again, each icon shown as itself: type a few letters and pick
  what you see. Both sets are offered, Network Canvas' own icons first and then
  Lucide's, and the search matches either way of writing a name, so "user plus",
  "user-plus" and "userplus" all reach the same icon. Where the list is longer
  than it shows at once, it says so rather than stopping silently.

  Every Network Canvas icon can now be chosen, not just the two that name the
  buttons an interview offers. A type whose icon was any of the others — set in an
  older version of Architect, or by hand — opened onto an empty field asking the
  researcher to choose an icon, with no way to choose the one it already had.

  The dialogs in the stage editor close instead of disappearing. Creating or
  editing a node type, inventing an attribute, editing the values or rules an
  attribute collects, and setting a map's starting view all vanished the instant
  they were dismissed, which read as the screen flickering rather than as the
  dialog going away. They now animate out the way every other dialog does. One
  exception remains and is deliberate: finishing an attribute you were inventing
  takes the row out of inventing anything in the same moment, so that dialog still
  goes at once.

- cbfd411: The rules an attribute's answers have to satisfy can be edited again where the
  attribute is chosen. Every picker that binds an attribute a participant types
  into — the quick-add name generator's, the Network Composer's quick add, the
  Family Pedigree's display label, and a categorical bin's follow-up "other" bin
  — now carries a "Validation" section that opens on the attribute's own rules.
  It starts open when the attribute already has rules, offers every rule the
  attribute's kind of answer can carry, and writes each change straight to the
  codebook: cancelling the stage edit does not undo one, and saving the stage
  does not commit one. Switching the section off clears the attribute's rules.

  Quick add previously said only that its attribute could be left empty, and
  offered a single button that made an answer required and could not be undone.
  An attribute created from a quick-add box is once again born requiring an
  answer — what the participant types there is the only thing they give — and
  that requirement can now be taken off again.

  Every rule that takes a number now has buttons to raise and lower it by one,
  named for the rule they move, and holds what is typed until the box is left,
  Enter is pressed, or a step settles it — so a maximum raised from 5 to 40 is no
  longer judged at every number it passes through on the way.

- fced7d0: Creating an attribute is now offered from inside the attribute window, in every
  editor that offered it. Where a stage editor used to carry a separate **Create
  a new … attribute** button beside the control, searching for an attribute and
  finding that it does not exist are one act: type the name into the window, and
  the first row offers to create it — on the name you just searched for, with a
  name the type already holds, or one the export formats cannot carry, refused on
  that row before anything is written. In a form field, including a network
  composer field, whatever else the new attribute needs — its list of values, a
  scale's end labels, a date's range — is filled in on the field itself. In the
  other editors, kinds of answer a name cannot finish — a list of values, a
  scale — open the codebook's own editor already holding the name. Network
  composer form fields can invent an attribute this way too, which they
  previously could not.

  The window itself says what it can do. Where a control only chooses from what
  already exists, its search box is called **Find an attribute** rather than
  **Find or create an attribute**, so a researcher using a screen reader is told
  the same thing its placeholder has always said. And a stage that stops taking
  changes while the window is open — because a colleague took the section, or the
  protocol was closed — stops offering to create as well as to choose, rather than
  offering a write that would only be refused.

  Rules for an attribute a form field is inventing can now be set before the field
  is saved. Making a new answer required, or bounded, used to take saving the
  field, reopening it, and finding the rules in a second dialog; they are now set
  alongside the attribute and written with it.

- 94c06e4: Node and edge types can now be made and changed from the control that picks
  them, in every stage editor. **Create new node type** and **Create new edge
  type** sit under the picker itself, and **Edit this node type** opens the type
  the stage already holds, so its name, colour, shape or icon can be changed
  without leaving the stage. A Family Pedigree on a brand-new protocol no longer
  stops at "No node types currently defined" with nothing on screen saying where
  node types come from, and the separate create buttons the network composer, the
  census family and the subject sections each carried are gone — there is one
  place to make a type, and it is where you were already looking for one.

  A network composer form field can now invent the attribute it records. Choosing
  the input control decides what kind of answer the new attribute holds, its rules
  are set in the same dialog, and both are written when the field is saved.

- 2eafe92: `Modal`'s `forceBackdrop` prop is gone: every nested surface now dims what is
  behind it, so there is nothing left for a caller to opt into.

  A dialog opened from inside another dialog dims what is behind it. Reaching for
  the attribute picker from an edit prompt dialog, or opening an attribute's
  values, left the dialog underneath at full strength, so the two surfaces read as
  one crowded screen rather than one on top of the other. Every nested surface now
  carries its own dimmed, blurred layer, so the deeper you go the further back the
  rest of the screen sits.

  Editing a node type no longer restates its own title. The dialog said "Edit this
  node type" and then immediately said "Edit node type" again above the first
  field. Its fields are now grouped under the four topics they belong to — the
  type's identity, its colour, how its nodes look, and the icon the interface
  shows — and its Cancel and save buttons sit in the dialog's footer with the rest
  of the dialogs', rather than partway down the form. The same restatement is gone
  from the disease, nomination, content item and dyad-census prompt dialogs, whose
  single group repeated the title it sat under; what that group explained now
  introduces the dialog itself.

  A node type can map its nodes' shapes to an attribute's answers again. The
  feature was missing from the node type editor altogether, so a protocol that
  already mapped shapes could be opened, saved and handed back with the mapping
  intact but invisible and uneditable. Choose an attribute and each of its answers
  takes the shape you give it; for a number or a scale, set one or two thresholds
  and the shape changes as the answer crosses them. It says which answers still
  have no shape of their own, refuses a save that has no threshold to act on, and
  tells you when an attribute it was pointing at is no longer one shapes can be
  mapped to.

  The colour picker shows which colour is chosen. Each colour is a circle of
  itself outlined in the ink around it, and the chosen one carries a thick ring in
  the selection colour the rest of the interface marks a chosen thing with —
  previously it was ringed in its own colour, which is the one outline it cannot
  be told apart from. Keyboard focus draws that same ring rather than a second one
  of its own, so a chosen swatch no longer changes shape merely by being focused.
  Pointing at a swatch grows it instead of drawing a faint copy of the chosen
  ring, so an offer can never be mistaken for an answer.

  The buttons that create and edit a node type are the size every other button is.
  They were drawn small, which read as a lesser action than the one they perform.

  Architect's section list stays clear of the menu bar. The list down the left of a
  stage editor is meant to hold still while the stage scrolls past it, but its top
  was measured from the top of the page rather than from the bottom of the menu
  bar, so its first entries slid underneath the bar and out of sight. It now
  measures the bar, follows it if it changes height, and jumping to a section
  leaves the section's own heading clear of the bar instead of tucked behind it.

  A categorical or ordinal attribute's answers are edited where the attribute is
  chosen. Choosing an attribute for a form field, a composer row, a bin prompt or
  a tie-strength prompt put its answers behind a "change this attribute's values"
  dialog; the list of answers, and a yes-or-no attribute's two words, now sit
  under the attribute you picked, and are saved by the same button that saves the
  rest of the row. An attribute whose answers an interface owns, or one you are
  only allowed to read, shows them without offering to change them and says why.
  A yes-or-no attribute you invent while filling in a row can be given its two
  words as you invent it, rather than becoming editable only the next time the
  row is opened.

  The rules an answer has to satisfy are set in the Validation section, not a
  dialog of their own. A button reading "set rules for this answer" opened a
  dialog Architect never had, and in the edit prompt dialog that button and the
  Validation section were both on screen at once, each offering to set the same
  rules. There is now one Validation section, in the place Architect put it, built
  from the same switches, boxes and menus as every other field — and the rule
  groups are drawn the way Architect drew them, each group titled on its own
  border with its rules reading as on or off at a glance, with the explanation of
  what each rule needs beside it and any complaint about a value under that value.

  The edit field dialog is arranged the way Architect arranged it. The input
  control was under "Attribute selection", which is where the attribute is
  chosen, not where the field is configured; it now sits at the end of "Field
  configuration" after the question text, the hint and the validation-hints
  switch, with the attribute's own answers and the Validation section below.

  An attribute can be renamed from its pill again, wherever the pill is shown. The
  only place an existing attribute's name could be changed was the attribute
  editor, behind the buttons for its answers, parameters and rules — so renaming a
  plain text attribute had become unreachable. Clicking the pill, or pressing
  Enter or Space on it, opens a box on the name it already holds; the new name has
  to be given, has to be one the entity type does not already use however it is
  spelled, and has to be one the protocol can store. A name a colleague's open
  section is holding says who is holding it and keeps the old name rather than
  failing. Cancelling, pressing Escape or clicking away puts the old name back and
  returns you to the pill, and each of editing, renaming and cancelling is
  announced once.

  An option's label is written as rich text everywhere it can be written. The
  label of a categorical or ordinal answer is shown to participants as markdown,
  so bold and italic have always reached them — but only the codebook's own
  editor offered them, and the same label reached from a bin's stage editor was a
  plain box. Every place a label can be edited now offers the same restricted
  editor, with bold and italic and nothing else. A label that is typed with a
  literal asterisk, underscore, hash or backtick keeps that character in the
  interview rather than turning into emphasis or a heading, which the plain boxes
  could not promise. The two answers of a yes-or-no attribute are written the
  same way, and the check that refuses two answers with the same label now asks
  one question from every surface instead of four slightly different ones.

  A node type's shape is chosen from the shapes themselves. The default shape, and
  the shape each answer or threshold of a shape mapping maps to, were dropdowns
  listing the words circle, square and diamond; they are swatches again, drawn in
  the type's own colour, as Architect drew them — so the choice is made by looking
  at what a participant will see. A threshold box left empty now goes back to the
  number that is actually stored rather than saving a number it is not showing,
  adding a threshold starts it on a number you could have typed rather than on a
  floating-point remainder, and no further threshold is offered once the
  attribute's range is used up.

  The warning that an attribute offers more answers than a screen can draw appears
  while you are adding them. It counted the answers the codebook had already
  stored, so adding a sixth value to a bin prompt or a tie-strength scale said
  nothing until the save — which closes the dialog, so it was never read at all.

  Saving a prompt no longer writes back answers you did not touch. The list of
  answers under an attribute is filled in from the codebook, so every save used to
  write it back; a colleague who added a value while you were rewording the prompt
  had it taken away again by your save, with nothing on either screen saying so.
  A list nobody edited is left alone.

  Renaming an attribute from its pill holds until the codebook answers. Pressing
  Escape or clicking away while the rename was still being written said the edit
  was cancelled while the new name landed anyway. Both ways out now wait, as the
  Cancel button already did, and what you are told is what actually happened.

- d3ee03f: The stage editor's sections are as wide as they used to be. Gutters were being
  spent out of the column's own maximum width rather than outside it, so every
  section on a stage editor was drawn 48 pixels narrower than intended.

  A pedigree remembers the terminology you saved. Choosing "gendered", saving,
  then switching the framing to a participant choice and back put "gamete" in
  the box again — the terminology the stage was opened with rather than the one
  you had chosen and stored. It now restores what you last saved, whether or not
  you changed it before the save.

  The map preview draws a real map again. Setting a geospatial stage's starting
  view said the map could not be drawn here and left you typing coordinates by
  hand; it now opens the map your chosen API key and basemap produce, which is
  the map the participant will see, so the view is framed against it. A protocol
  whose stored key has no value in it says that instead, and points you at a
  different key or the coordinate boxes.

  A rule reads back with the same attribute pill as everywhere else — filled and
  coloured for the kind of answer it holds, rather than a plain outlined chip. An
  attribute the codebook no longer has still appears, marked in the destructive
  colour and described as missing, so you can see what the rule is pointing at
  and repair it.

- c632e51: Architect's in-process protocol-builder router now reads the authoring contract
  from `@codaco/protocol-builder-core`, the host-neutral half of the
  protocol-builder package. Nothing a researcher sees or does changes.
- 88f4d4b: A long attribute name no longer pushes the rest of the codebook table off
  screen. The name is cut short with an ellipsis, and the full name is still in
  its tooltip.

  The printed protocol summary shows stored values exactly as they are saved,
  instead of breaking them across lines with hyphens. The summary page also has
  the same margin at the edges as the Codebook and Resource Library pages.

  On a phone, the list of interfaces for a new stage now fits the screen, and
  every title and description can be read.

  A video preview keeps its playback controls inside the window.

  While you edit a choice value, its confirm button is now the same size as the
  delete button beside it.

  When you create an attribute on the Codebook page and choose its type, the
  values it needs now scroll into view instead of appearing below the window's
  visible area.

  When a toolbar is too narrow for all its buttons, it now fades the edge where
  more buttons are hidden, so it is clear the toolbar can be scrolled. This
  includes the Background Creator toolbar. The toolbar at the bottom of
  Architect's screen also scrolls to show its last button, such as Download.

  `SegmentedToolbar` has a new `restAt` prop. Set it to `"end"` to show a
  toolbar's last button, rather than its first, when the toolbar does not fit.

  A field's error message now has space between it and the control above it,
  instead of sitting right against it.

  `ScrollArea` now fades the correct edges when it scrolls sideways in a
  right-to-left language.

- 2e4621d: Stop the rule builder marking its container with `aria-required`. The rule
  builders behind a stage's Skip Logic and Filter sections are regions of controls
  rather than a single input, so the form's identity lands on a `role="group"`
  element — and `group` is not a role that supports `aria-required`, so axe
  reported a critical `aria-allowed-attr` failure on every editor that mounted a
  required rule set. ARIA 1.2 made `aria-invalid` global, so the group keeps that.
  The requirement still reaches assistive technology the way it already did: the
  visible marker on the "Rules" label and the visually hidden "Required" element
  the group's `aria-describedby` names.
- 333bb75: The list of a stage's sections beside the stage editor is now drawn by
  Architect itself rather than by the shared editor inside it. It sits in the
  same place, at the same width, lists the same sections with the same states,
  and still moves you to a section when you choose it — nothing about editing a
  stage changes.

  A save the protocol refuses now says what it refused above the form as well,
  one sentence per problem, each naming the section that holds it, instead of
  the general "this stage is not finished" line on its own.

- 0968b01: Response options read in full in the categorical and ordinal bins. A researcher
  can write an option as a whole sentence — "Previously involved in the criminal
  legal system, but not currently" is an ordinary thing for a study to ask — and
  the bin now sizes that text to the room it actually has, a step at a time, in
  place of cutting it off mid-word. Where a bin is too small to hold every word
  even at the smallest readable size, the text fades at the edge rather than
  stopping without warning, and the whole option is still read out by a screen
  reader.

  Two ways an option could disappear entirely are fixed. In a tall window, an
  ordinal bin's heading could be pushed out through the top and bottom of its own
  panel, leaving a coloured band with nothing in it. In a narrow one, the labels
  were cut part-way through a line of text.

  A bin that holds people shows who is in it underneath the option, as before. It
  now steps aside when the option itself needs the room, instead of being cut in
  half, and comes back as soon as there is room again.

  Emphasis authored in an option — **bold** or _italic_ — now reads as emphasis
  against the label's own weight, and a screen reader is handed the words without
  the markdown around them.

- cd75518: Require an answer in the bundled protocols' quick-add and "other" fields

  Quick-add name generators and the follow-up question behind a categorical bin's
  "other" option used to require an answer on their own. They now follow the
  validation set on the attribute they write to, and upgrading a protocol to
  schema 8 adds `required` to those attributes so nothing changes for existing
  studies. The protocols bundled with Architect and Interviewer were never
  upgraded that way, so participants could leave these fields blank. The sample
  protocol, the development protocol and the Colored Eco-Genetic Relationship Map
  (CEGRM) template now require an answer in those fields again.

- e6dbaac: Canvas, pedigree and anonymisation fixes in the stage editors:

  - Narrative presets again offer attributes another interface records, such as
    the participant marker a Family Pedigree keeps. A preset positions, groups
    and highlights by an attribute without writing it, so these are exactly the
    attributes it exists to look at.
  - The Family Pedigree's family-building prompt takes full markdown again, so a
    link or a second paragraph in a stored prompt survives being opened and
    edited instead of being flattened to one line.
  - Choosing "let the participant choose" for a pedigree's framing and then going
    back to a fixed framing puts the terminology the stage was saved with back,
    rather than leaving the control empty and refusing the save.
  - A geospatial prompt is refused at save when its location attribute is one a
    form elsewhere collects, instead of saving a stage only protocol validation
    would object to. A prompt re-saved on the attribute it arrived with still
    saves.
  - The geospatial starting-view map is drawn on the basemap the stage is set to,
    so the view is framed on what the participant will see.
  - Each node type in the Anonymisation stage now has its own switch, and
    switching one off stops encrypting every attribute of that type at once,
    after confirming. A type's switch follows the protocol while the editor is
    open, so an attribute a collaborator starts or stops encrypting shows up on
    the switch and in its list rather than leaving the stage saying that type
    protects nothing. An editor that loses its lock while that confirmation is on
    screen no longer carries the change out, and says why.
  - The Anonymisation stage's remaining sentences are Architect's own again: the
    section says values for encrypted attributes are not stored in the database,
    a type's switch says it enables encryption for attributes belonging to that
    node type, and the confirmation before a whole type is cleared reads as it
    did in Architect, in English and in Spanish.

- e87f8f5: The last four dialogs that vanished instead of closing now animate out, and a
  CI guard keeps the next one from regressing.

  Dismissing a dialog used to remove it from the screen instantly, which read as
  the screen flickering rather than as the dialog going away. Four were left after
  the first pass: Interviewer's export dialog, its unlock and passphrase-recovery
  dialogs, and Architect's report that a protocol has become invalid. All four now
  close the way every other dialog does.

  Nothing of a passphrase now outlives the dialog it was typed into. The unlock
  dialogs hold their form outside the dialog itself, so keeping the dialog on
  screen long enough to animate away also kept what had been typed into it; the
  form is now emptied as the dialog closes.

  Internal only: the repository's build-time scripts and CI guards move from
  `scripts/build/` to `scripts/buildtime/`. Three separate ignore rules — git's,
  the linter's and the formatter's — all match `**/build`, which meant those
  fourteen files needed a forced `git add` to be committed at all and were never
  linted or formatted; eight of them had drifted. Nothing emits to a `build`
  directory in this repository, so the collision was the name alone.

- 90b08cd: A removed row of an `ArrayField` stays mounted while it animates away, and for
  that moment it was still a row: in the accessibility tree, in the tab ring, and
  answering to every query for one of its controls. It is `aria-hidden` and
  `inert` for the rest of its life now, so nothing that asks the list what it
  contains can reach a row that has gone.

  That window was long enough to send focus to a control that no longer exists.
  Architect's list field decides where focus goes after a removal by asking the
  list which Remove controls it holds — the row that took the removed one's place
  — and asked inside the window it counted the dying row and answered with its
  own Remove button. Focus landed on a node destroyed a fraction of a second
  later and fell back to the page header, which is the outcome naming a target
  exists to prevent.

- 64c7891: `Badge` is now the one label chip, replacing three overlapping components that
  rendered the same kind of object differently depending on which one a call site
  happened to pick.

  `Badge` gains semantic `tone`s (`neutral`, `primary`, `secondary`, `accent`,
  `info`, `success`, `warning`, `destructive`), each painted in a `filled` or
  `outline` `appearance` from the theme's colour pairs so it follows light and
  dark mode; three sizes (`sm`, `md`, `lg`); `mono` and `uppercase` typography
  options; a leading `icon` slot; the palette `color` prop for taxonomic
  colouring; and a Base UI `render` override for rendering as a button, toggle
  or animated element. Its default look is unchanged.

  `Tag` keeps its name, API and look but is now a `Badge` with a toggle state
  and palette dot, so the two can no longer drift.

  **Breaking:** `Pill` and the `@codaco/fresco-ui/Pill` subpath are removed —
  use `Badge` with `mono` (and `appearance="outline"` for the outlined look).
  `Badge`'s `variant` prop is replaced by `tone` and `appearance`:
  `variant="secondary"` → `tone="secondary"`, `variant="destructive"` →
  `tone="destructive"`, `variant="outline"` → `appearance="outline"`; the
  default needs no props.

  The interview runtime's offline map banner; Architect's codebook usage chips, library counts, asset cards and the
  requires-internet label on protocol cards; Interviewer's deck card label;
  Background Creator's zone pills; and Fresco's activity feed, interview,
  participant and passkey chips all render through it.

- a382c6b: Add `Tag`, a compact uppercase label with an optional palette-coloured dot that becomes an `aria-pressed` toggle button when given `onPressedChange` — the shape used for multi-select facet filters. Architect's New Stage capability filter now uses it.

  `GridLayout` accepts `maxColumns`, so a collection can cap its column count while wider containers grow the items instead. Internally, `Badge` and `Tag` now read the named palette from one shared map.

  New typographic levels for compact secondary text: `Eyebrow`, a bold uppercase monospace label with `muted`, `default`, `primary` and `subtle` tones, the last dropping the bold face for a classifier set beside its subject; `Paragraph` intents `caption` and `meta` (tight-leading small text, the latter monospace); and a `Heading` `subtitle` variant that keeps the level's size but sets a semibold face on snug leading for long titles. `Paragraph` also accepts a `render` prop, like `Heading`, to substitute the rendered element.

  `STAGE_TYPE_COLORS` and `STAGE_TYPE_ICONS` map every protocol stage type to a palette colour and a Lucide icon, both keyed by the schema's stage union so a new interface cannot ship without either. Each icon is chosen for what its interface does, and — where Network Canvas already drew that interface its own icon — for the closest silhouette to it, so the set still reads as Network Canvas. `isStageType` narrows a type read from protocol JSON; `stageTypeColorStyle` gives the colour as CSS variables and `stageTypeIcon` the icon component. `StageBar` draws a stage sequence as a colour strip from the colour map; the website's protocol gallery uses both.

- 1dac91b: The interview runtime's optional analytics no longer use the interview session id as the per-event `distinct_id`. In Fresco that id is the participant's unauthenticated access link, so it must not leave the deployment. Events are now grouped under a random per-session pseudonym generated in the browser, held in memory for the life of the session alongside the existing entity-id pseudonyms. Analytics still group one session's events together; a page reload starts a new pseudonym. Errors the Name Generator raises for a malformed encrypted attribute no longer embed the node's id in their message, since error reports can be captured by analytics and a node id is a participant-network identifier the runtime otherwise pseudonymises. The same is true of a duplicate-relationship error the Family Pedigree interface throws, which no longer names the two node ids it connects.
- 23dcf99: Analytics now reports a session-scoped pseudonym for every entity id, rather
  than the interview's own `_uid`.

  The event taxonomy admits `node_id` and `edge_id` on the premise that they are
  random values minted at creation time, derived from nothing a participant
  supplied. Roster nodes break that premise: an external-data row is keyed as
  `${subjectType}_${hash({ node, index })}`, a deterministic, unkeyed digest of
  the row's own content, and the node is added to the network under exactly that
  key. Anyone holding the roster could recompute the digest and so recognise
  which roster row an event was about, and because the digest does not vary the
  same person carried the same identifier in every interview — so events from
  separate sessions about one person could be joined together.

  Each session now mints a random pseudonym per entity, held in memory and never
  persisted or transmitted. Events within a session still join on the entity,
  which is all these properties are for; nothing joins across sessions or back to
  a roster row. The substitution happens at the tracker, the single boundary every
  event passes through, so no emitter can reintroduce a raw identifier. When
  events fire, and which events fire, is unchanged.

- a13f261: Every module that runs a React hook now declares `'use client'`, so a Next App
  Router application can import this runtime from a Server Component.

  Seventy-four modules were missing the directive: the navigation, node list, node
  drawer and panel components, the canvas layers and their layout hooks, the
  protocol form, and the Anonymisation, CategoricalBin, DyadCensus, EgoForm,
  FamilyPedigree, Geospatial, NameGenerator, NameGeneratorRoster, Narrative,
  NarrativePedigree, NetworkComposer, OneToManyDyadCensus, OrdinalBin, SlidesForm
  and Sociogram interfaces. An unmarked module is treated as server code, so
  reaching one from a Server Component's import graph failed the build rather than
  rendering.

  The published bundles now carry the directive too. Bundling had been erasing it,
  so even the modules that already declared it arrived at npm consumers unmarked.
  `dist/index.js` and the lazily loaded Geospatial chunks are now marked;
  `dist/contract.js` and `dist/protocol-schema-version.js` are unmarked, as their
  server safety intends, and stay that way only for as long as no module carrying
  the directive is reachable from them.

  Architect, Interviewer and Fresco are released alongside because each bundles
  this runtime. Nothing about how an interview looks or behaves changes.

- c5758a4: Fix text in the Information interface being unselectable. It carried an `allow-text-selection` marker class meant to override the host app's global `user-select: none`, but the shared-theme migration dropped the CSS utility that implemented it (as an apparent "zero consumers" cleanup) without noticing this interface still relied on it, so the override silently stopped doing anything. Participants and researchers previewing an Information stage could not select or copy its text. Now uses Tailwind's built-in `select-text`, which restores the original behaviour by inheritance since nothing inside the interface sets its own `user-select`.
- a78b7c2: A video on an interview screen now announces itself with the description the
  researcher wrote for it, and falls back to the asset's file name only when
  nobody has written one. An image has always read that description as its alt
  text and an audio player as its own name; the video player was the one place
  that ignored it, so a participant listening to the screen heard a filename
  where every other medium said what the thing was.

  A description a researcher left blank now counts as no description at all, for
  pictures and audio as well as video. A protocol written by hand or brought in
  from elsewhere can carry a description of nothing but spaces, and every medium
  used to pass it straight through — so a participant using a screen reader was
  told a run of whitespace instead of what the file was called.

- fe6af95: Stage editors: generator and composer fixes

  - The Quick Add name generator no longer offers an attribute one of the same stage's own prompts stamps on the people it names, which the protocol refuses.
  - A Tie-Strength Census prompt now shows the points of the scale it records into, and lets you change them without leaving for the codebook screen; points an interface owns are shown read-only.
  - Pointing a Network Composer connection at a different connection type now clears the questions it used to ask, instead of keeping questions about attributes the new type does not have, and says how many questions it removed. This includes a connection that arrived naming no type at all.
  - A Network Composer form field whose attribute has been deleted now names the missing attribute, instead of reading as an empty field.
  - A Network Composer refuses to save while the box that adds a node, or the attribute nodes are grouped by, names an attribute another stage claims the opposite way — including a conflict that arrived with the protocol.
  - The rules set on a Network Composer form field are now checked against the input controls and settings every field of that form will actually use — including for an attribute the field is creating — so a comparison the saved form makes impossible is no longer offered. A comparison is offered only when the attribute's own settings in the codebook can hold it as well, which is where the rule is saved; where only those refuse it, the rules editor says so rather than letting the save fail.

- 0030df8: Bumps the `cva` dependency behind `cva`/`cx`/`compose`/`VariantProps`
  (`@codaco/fresco-ui/utils/cva`) from `1.0.0-beta.4` to `1.0.0-beta.10`.
  Rendered class output is unchanged.

  One narrowing worth knowing if you import `compose` directly: `cva`'s
  `compose()` no longer type-checks a composed component passed into another
  `compose()` call (its declared return type doesn't carry the internal
  property the check needs), so composing an already-composed variant function
  now needs its own constituents listed directly rather than nesting the
  composed function itself.

- 9806169: Asset previews, the codebook variable list, the timeline and the issues panel now update in the same step as the change that caused them, rather than one frame later.

  Switching a stage's roster or network asset while its variables are still being read no longer leaves the attribute options stuck on an empty list, and a slow read that finishes after you have already moved on can no longer overwrite the current asset's answer.

- 98063fb: Attribute pills in the codebook no longer have an animated border. The moving
  border marks the attribute a picker is holding, and the codebook's list of
  attributes is a list rather than a choice, so its pills are now drawn in their
  type's colour without it.

  Rows of a list no longer scale into place when the editor or dialog holding
  them opens. The animation is for a row that has just been added, and a row that
  was simply there is now drawn at rest from the first frame. Adding, deleting,
  reordering and opening a row's editor animate exactly as before.

  Asking the attribute window to create an attribute whose kind of answer needs
  more than a name now brings the attribute editor to the front. The window that
  opened it was being drawn over it, so the editor looked like it had not opened
  at all. The codebook’s own attribute window, which could have been drawn over a
  dialog the same way, is stacked like every other window now too.

- f6565fe: Interview screens now settle in one step where they previously took two. Moving to the next pair in Dyad Census or Tie Strength Census, changing prompt in Categorical Bin, Sociogram or Geospatial, and opening a name generator's edit form no longer render a frame that still carries the previous item's state.

  Place search is more accurate about what it tells a screen reader: a status that has been superseded is no longer read back when a query starts matching again, and a search still in flight when the participant moves on can no longer repopulate the next person's suggestions.

  An encrypted name that could not be decrypted after the passphrase changed now shows the locked indicator instead of the name read earlier under the old passphrase.

- f39dd28: Stage editors are laid out the way the released Architect laid them out. The
  network composer's node settings divide into Quick add attribute, Node
  positions, Automatic layout and Group hulls, each saying what it is for; its
  edge types sit under Connection types. Geospatial prompts, family-pedigree
  nomination prompts and narrative-pedigree diseases group their fields under a
  heading, as do the family pedigree's family-member and relationship attribute
  mappings. A geospatial stage's starting view is one control, "Initial map
  view", holding the longitude, latitude, zoom and the map together. Automatic
  layout is a switch on the narrative and network-composer stages rather than a
  pair of cards. A sociogram prompt's node interaction is a section that can be
  switched off, instead of offering "Nothing" as a third thing tapping can do. A
  roster's search settings divide into Search matching and Match tolerance, each
  with its own guidance. A tie-strength prompt's connection, scale and decline
  option sit together under Tie-strength response. The two bin editors no longer
  show a notice above the prompt box.

  A form that asks nothing, and a form field pointed at an attribute a sibling
  field already collects, are refused in the released Architect's words again,
  in English and in Spanish.

- 01aaed2: Use `libro de códigos` for the codebook throughout the Spanish catalogs.
- e47d985: The printable protocol summary now lists a Family Pedigree stage's nomination prompts, with the attribute each one records. Previously the section was printed only for a legacy key no current protocol carries, so a pedigree's nomination prompts were missing from the summary.
- e4a0e7f: Stage editors now use Architect's own button styles and colours throughout: creating a node type, an edge type, an attribute or a variable is a filled primary button with a plus, cancelling a codebook editor is the plain button, and removing or discarding a resource is coloured as the destructive act it is. The hollow and dashed buttons that had appeared in the rebuilt editors are gone.

  The stage title gets its breathing room back — the same gap Architect has always had between the title and the first section of an editor — and the interface's own picture is shown beside the title again, so which of the nineteen interfaces is open is visible at a glance.

  A canvas background image is now previewed as the canvas a participant will see it on, in the interview's own colours and at its shape, rather than as a thumbnail of a file.

- Updated dependencies ([486ad48](https://github.com/complexdatacollective/network-canvas-monorepo/commit/486ad489e5d6387d418f621a168b0f941021353e), [026b518](https://github.com/complexdatacollective/network-canvas-monorepo/commit/026b5188636452e20570bb4c15e055c8d6d000e8), [043c098](https://github.com/complexdatacollective/network-canvas-monorepo/commit/043c098386556fdc0d28c9ef77f398a712e49bb2), [55bf4da](https://github.com/complexdatacollective/network-canvas-monorepo/commit/55bf4daf8554976b31f8e1400b2c38216ef8a2f2), [91a25de](https://github.com/complexdatacollective/network-canvas-monorepo/commit/91a25ded87f6348e9fc14b5d5b84303f658a0792), [ce5e872](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ce5e87292186a22123dc21411411ffd13aa79992), [2eafe92](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2eafe92060cd4aa1dbcde5c2b79d00d87bba9159), [88f4d4b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/88f4d4bb1d6c0863b6d201f614fcd208efa642da), [0968b01](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0968b014c202284d3c40da0eb71a4f4f13a62d01), [fb1b7ed](https://github.com/complexdatacollective/network-canvas-monorepo/commit/fb1b7ed0986d7b9db0eb7444c2f49c2061376d0d), [8a91585](https://github.com/complexdatacollective/network-canvas-monorepo/commit/8a91585f808df2422377e3cb1ae154bc40ebec13), [e322f90](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e322f9040c9f5f4218ea8d7da1aa286ef4e719e9), [e87f8f5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e87f8f59a9c05eac7219631a4dc002dfed65efcb), [5a19894](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5a19894e03e1aa5bd176b012a342d20c50398c86), [ca83424](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ca8342421dda342d1722ad838bbbe58837212022), [e4dad7e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e4dad7ef5a96a1f09257483c4f99fccffc0dcaa5), [90b08cd](https://github.com/complexdatacollective/network-canvas-monorepo/commit/90b08cd133b8555408329acdfe1ea00e0a7fff37), [1376c6a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1376c6a817e093ce220c9397492290a0f7d6a57f), [b0fa87a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b0fa87ac6614959484cdb1e4d6457513e9898a56), [64c7891](https://github.com/complexdatacollective/network-canvas-monorepo/commit/64c7891c377b734e8b5f9df2e360884bf4848f4e), [ab25ed6](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ab25ed6be06f2e4f983f2a5c5915e962caed5970), [15c8259](https://github.com/complexdatacollective/network-canvas-monorepo/commit/15c825972e5097cd8d8559d47e5ba4584398edee), [484c9e0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/484c9e0efeac6e55506d56504a79c37e00f9f687), [1abd707](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1abd707d0894dfad3eaf0eb5a79e76ffc3e7932c), [154d2ab](https://github.com/complexdatacollective/network-canvas-monorepo/commit/154d2ab5ad89ce4a5d370d1fb818135ab7fbb62d), [c100092](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c100092b303b1b02afe2876d8dbbc84af06865b2), [65d2583](https://github.com/complexdatacollective/network-canvas-monorepo/commit/65d2583c12a2af634080b466f95793f3cc8032d4), [4749625](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4749625620599802f85560ec1ba54fc7873a2ecc), [57c74ae](https://github.com/complexdatacollective/network-canvas-monorepo/commit/57c74ae5a36b8e5c1d8efd3863cbfeaf412ba1b4), [c358132](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c3581329466d44b3733a09bb459d07a1787486ef), [df21eec](https://github.com/complexdatacollective/network-canvas-monorepo/commit/df21eece0b9a9e6393f694c07374e7d10d66dabc), [c563d9f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c563d9f0815df12f618c06548e1281fec95bb656), [4e808e1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4e808e1172f91fb6d78a3ebc6e0b65dbc2096ad3), [208fcea](https://github.com/complexdatacollective/network-canvas-monorepo/commit/208fceaf736d8354d16046b6e9953b1d598f65a1), [a382c6b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a382c6bfa34cbe04e6e79143526bf2f3215baa59), [3abf9e4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3abf9e4442b6086c5c5937d16212a9bdc8425cab), [45a30fa](https://github.com/complexdatacollective/network-canvas-monorepo/commit/45a30fae119ebf52d31738fa98e61b707d1d4c54), [1dac91b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1dac91b131db3740117aaf7977c9ff9bd697241e), [23dcf99](https://github.com/complexdatacollective/network-canvas-monorepo/commit/23dcf99e80d3e95b9e71543afb2e40842d1527e1), [a13f261](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a13f2610b7834e2fe27ae4e1e8423612b990c304), [c5758a4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c5758a447125e840b91d81e9b2e9ed6acdf1583e), [29b11be](https://github.com/complexdatacollective/network-canvas-monorepo/commit/29b11be8da6cfb65b8c9cce5d6f1d8711889d4f1), [a78b7c2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a78b7c20034648fffcee4202a143481178f8637b), [aa4693a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/aa4693a1e221515381058229d7fbf61d7807dfe3), [bb8e755](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bb8e7550160683d76d359b0d0c7093e6d128b9e2), [693655f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/693655f3d388e7ef91cb0e2324a10bb201a5f96c), [0030df8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0030df8ab94984e8ca6666da03ec0ae02d6bdbf4), [ed91f97](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ed91f9759c0d12bc6940d61800b816a2f482d4dc), [98063fb](https://github.com/complexdatacollective/network-canvas-monorepo/commit/98063fb115deb11852910ca7ef7583d278207f4b), [f6565fe](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f6565fe3f11ddfa004d1ea5d37a7b97401a53db4), [139de02](https://github.com/complexdatacollective/network-canvas-monorepo/commit/139de022e376c743c1944ffad36c4cc994e0716b), [4ea797d](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4ea797d7159622173f7a605cf2ce6cac1884e854), [d7e93c5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/d7e93c571df1fea1a8fc71d8c9d4f6692e2dbe7c), [55f5549](https://github.com/complexdatacollective/network-canvas-monorepo/commit/55f554975bc6731a7f5bc94dde0a7000b64ce2da), [2bea7ee](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2bea7eed99b1f0f5056144a1d6ac30855c36513e), [02ead76](https://github.com/complexdatacollective/network-canvas-monorepo/commit/02ead76454267cb9fcc8e2810eb6189e6d3aabc9), [f84eb32](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f84eb32e7c776a088c412511183baf7e3b635021), [eea0b5a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eea0b5acf7c4b852a57c6b57c5a504a34a7d11c0), [eee19fb](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eee19fb93d4cb57d3c4d256971da78df15730a88), [a5626f5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a5626f51040d092c56417694296bcde8d51faad9), [06ffe9f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/06ffe9f4e0154e34633c9981e94f3c5919acac87), [b2ca402](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b2ca402a852b5527e0455c7ff2949da3be50dccd), [aab7516](https://github.com/complexdatacollective/network-canvas-monorepo/commit/aab75165be13439838568f8d393189f9ceacfe0b), [3ae3a94](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3ae3a9438da400fc357a0c71721d45cd32f3a7ac), [01aaed2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/01aaed2d0bcd7ce203f50952ddd3e4ddeaed143a), [d356513](https://github.com/complexdatacollective/network-canvas-monorepo/commit/d3565138de36477aa2fffe7638105e67d18d2d29), [3f54d21](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3f54d2102e9489ae65cb164466fe71de05901ddd), [553d580](https://github.com/complexdatacollective/network-canvas-monorepo/commit/553d580c548e86730faecd95a18b6bf29868807f), [9d9f310](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9d9f310867e490c073374df20689def7be163f47))
  - @codaco/fresco-ui@7.0.0
  - @codaco/app-i18n@0.2.0
  - @codaco/shared-consts@6.1.0
  - @codaco/interview@9.1.0
  - @codaco/tailwind-config@1.5.0
  - @codaco/protocol-validation@14.0.0
  - @codaco/art@0.1.5
  - @codaco/protocol-utilities@4.1.0

## 8.2.5

### Patch Changes

- 83c17e7: Fix "Must be unique" accepting a duplicate value for a number variable in interview preview. A number typed into an interview form was compared as text against the numbers already stored on the other alters, so an Alter ID that another alter already held passed the check and the duplicate was added. The same mismatch let a "same as" or "different from" rule misjudge a number answered on an earlier stage. Number values are now compared as numbers wherever a rule reads what the network already holds.

## 8.2.4

### Patch Changes

- f217425: Rotate the shared Mapbox testing token embedded in the Transnational Networks template. The new token is URL-restricted to networkcanvas.com, networkcanvas.dev and localhost; it will not render maps on other domains or in Fresco, so researchers must add their own Mapbox token before fielding a study. Architect now shows an error banner when a protocol still carries the retired testing token, which was revoked on 2 September 2026, so researchers know to replace it.
- Updated dependencies ([b387946](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b387946d706f5779779e11956af04e0e4904d474), [b4b21ed](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b4b21ed955b96bc3c59aeefd18f6f7d5bc3ea19a), [05ea832](https://github.com/complexdatacollective/network-canvas-monorepo/commit/05ea8325b4a5c93e2f8081309db45e3ecba948b2), [0666674](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0666674c95a4865227bddc103b131720926ab7c8))
  - @codaco/protocol-validation@13.0.1
  - @codaco/fresco-ui@6.4.0
  - @codaco/tailwind-config@1.4.0

## 8.2.3

### Patch Changes

- 77c3736: Replace the interview text-size choices with an accessible percentage input that supports plus and minus controls, arrow keys, and direct entry.
- Updated dependencies ([080d355](https://github.com/complexdatacollective/network-canvas-monorepo/commit/080d355e7bb30b7d9cf7c8653582a81103b6b8b5), [cead6fc](https://github.com/complexdatacollective/network-canvas-monorepo/commit/cead6fca6412f9322403896d09606bfcb1be1e58), [77c3736](https://github.com/complexdatacollective/network-canvas-monorepo/commit/77c37364a043f12fa38d97ec0004514c77636b88), [0584c69](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0584c69b1b210e533c1a18d7456a7808934989e7))
  - @codaco/fresco-ui@6.3.0
  - @codaco/interview@9.0.1

## 8.2.2

### Patch Changes

- a5b028b: Show the full shadow around the Recent and Templates panel on Architect's start screen.
- a6f0723: Keep screen preview images available when the installed Architect or Interviewer app is used offline.

## 8.2.1

### Patch Changes

- 2f8fcdc: Make app updates reliable without reloading open work automatically. Fresh launches now activate an available update before the interface appears, updates found after rendering wait for an explicit install action, and the post-reload state reliably links to the release notes.
- Updated dependencies ([2f8fcdc](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2f8fcdc0c202678060501d2942645462c9cca77b), [301e8fe](https://github.com/complexdatacollective/network-canvas-monorepo/commit/301e8fefdf74b563545ef9c1ac3a0dd098a14bbc))
  - @codaco/fresco-ui@6.2.0

## 8.2.0

### Minor Changes

- Architect's editors now use the shared Fresco UI form system instead of redux-form.

  - Fields have consistent labels, descriptions, required states, and errors that are announced with the control and focused when saving is blocked.
  - Disabling a feature or changing a roster, entity type, or source stage clears settings that no longer apply. These multi-field changes are recorded as one Undo step rather than a sequence of invalid intermediate states.
  - Repeated sections and editor dialogs retain the correct options, identifiers, and values when items are added, removed, reordered, or reopened. Newly created variables and entity types start clean instead of inheriting the previous editor's state.
  - Unsaved edits are detected when navigating, refreshing, closing the browser, or applying an app update. Undo and Redo also cover collapsed sections, backgrounds, side panels, and automatic stage naming.
  - Half-finished sort, display, assignment, and option settings can no longer be saved as a misconfigured protocol.

  Existing protocols containing option values with spaces or blank display labels must be corrected before those variables can be saved. Changing an option value also changes its column name in exported data, so projects already collecting data should choose the replacement carefully.

- 4dcd18f: Architect's form field editor now uses a two-pane workspace. Field settings remain on the left while a live participant-facing preview on the right shows the current input control, interview theme, and validation behaviour. The panes begin at an even split and can be resized, while narrower windows switch cleanly to a stacked layout.
- c37a801: Applications now derive their protocol schema compatibility from the interview runtime they embed, instead of hard-coding a version number, and each application can upgrade stored protocols when a future schema version ships.

  - `@codaco/interview` exports its supported protocol schema version as `COMPATIBLE_PROTOCOL_SCHEMA_VERSION` (from `@codaco/interview/protocol-schema-version`). Fresco and Interviewer read it for import limits, stored-data migration, and interview payloads; Architect derives its own compatibility from `@codaco/protocol-validation` directly.
  - Interviewer checks stored protocols at launch. A protocol saved under an older schema version is migrated, re-identified under its new content hash, and its interview sessions and media follow it in a single transaction, with a notification when this happens. A protocol that cannot be migrated is left untouched, with a message directing you to repair it in Architect.
  - Architect upgrades a library protocol automatically when you open it, with a notification, leaving the protocol untouched if the upgrade cannot complete. Protocols made with a newer version of Architect are refused with an explanation instead of opening incorrectly.
  - Fresco's deployment migration targets the runtime's supported version rather than a fixed number, and an interview can no longer start from a protocol stored under a version the runtime does not support — it reports the mismatch instead.

  Nothing changes for existing data today — every stored protocol is already at the current schema version. This machinery exists so a future schema version change cannot orphan interview sessions or mislabel stored protocols.

### Patch Changes

- e9a6522: Undo and Redo now remain keyboard-focused when the control becomes unavailable at the end of the protocol history, so the next key press no longer starts again at the top of the page.
- 17aeca4: Architect and Interviewer now load analytics and automatic error-reporting modules through the Network Canvas relay without Content Security Policy errors.
- c599dac: This release improves the reliability, accessibility, and recovery of protocol editing in Architect.

  - Stage edits are now transactional: cancelling restores Codebook changes, incomplete settings remain open with actionable errors, and Information blocks retain their drafts while switching media types.
  - Forms, rule builders, the Codebook, timeline, dialogs, and resource library now provide accurate labels, keyboard operation, focus restoration, and layouts that work on smaller screens. Undo and Redo operate one change at a time without recording no-op edits.
  - A second tab now shows a read-only protocol instead of accepting changes it cannot save. Closing the editing tab restores editing from the saved copy, and deleting a protocol clears its history and releases associated resources.
  - Protocol names, resource cards, variable identifiers, and stage editors are bounded on narrow screens. Duplicate resource filenames are distinguishable without changing the names stored in the protocol.
  - Invalid imports, blocked edits, migration conflicts, preview completion, and deleted protocol routes now explain what happened and provide a safe recovery path.
  - Recent protocols in the library now show their description, and starter templates show their stage, node type, and edge type counts.
  - The CEGRM starter template now uses an available color for its Narrative Pedigree condition. Protocol colors are constrained to typed node, edge, ordinal, or categorical palette references; Narrative Pedigree and Geospatial resolve those references through the active theme. A protocol created from the previous release's CEGRM template will report a validation error on its condition color — open the stage editor and select one of the available colors to fix it. A downloaded protocol file with this problem must be corrected before it can be imported again. Neutral dialog actions remain distinct from white dialog surfaces.

- e5d4fd3: A stage name longer than the width of the stage editor's heading was cut off at the right-hand edge, with nothing to show that more of it existed. Long names now wrap onto as many lines as they need, and stay editable in place.
- 2d59b10: Standardize Architect editor settings into single-panel sections with concise headings, guidance, and field labels, including collapsible settings that discard their values when closed. Give repeated form items and their nested sections a consistent slate-blue accent surface hierarchy. Size attribute pills to their labels by default, with container and Tailwind maximum-width constraints for narrow and printable layouts.
- b51ef59: Prevent malicious form field paths from modifying object prototypes while preserving dotted protocol variable identifiers and nested field namespaces.
- 43c7746: Fresco UI now owns two answers its consumers were each working out for themselves.

  **`stripManagedProperties`.** `ArrayField` adds its own bookkeeping properties to every item it hands out, and a consumer that saves an item has to take them off first. Three consumers were doing that with their own inline copy of the list, each frozen on the properties that existed when it was written — so a property added to `ArrayField` would have started arriving in saved data. The strip is now exported from `@codaco/fresco-ui/form/fields/ArrayField/ArrayField` and derived from the property definitions themselves, and adding a managed property without listing it is a compile error.

  **`selectIsFormDirty`.** Exported from `@codaco/fresco-ui/form/store/formStoreProvider`, this answers whether a form currently holds values that differ from the ones its fields registered with. It is a live comparison, unlike the `isDirty` flag beside it in the same store, which is set by the first keystroke and cleared only by a reset — so anything guarding unsaved work on that flag keeps asking about a form the person has already put back by hand, and treats a form that normalised its own values at mount as edited before it was touched.

  No visible change for anyone using Architect: it consumed both from its own copies and now consumes them from here.

- 59f131c: Fixes interactions that were advertised to assistive technology but did nothing when activated.

  `ArrayField` now omits `onDelete`/`onEdit`/`onChange`/`onUpdate` (and the editor's `onSave`) entirely while disabled or read-only, instead of substituting no-op stand-ins. An `itemComponent`/`editorComponent` that renders its edit/delete/save affordance from handler presence — the normal pattern — now correctly hides that affordance rather than drawing a live-looking control wired to nothing.

  `SegmentedToolbar`'s toggle and group segments now forward `onPressedChange`/`onValueChange` straight through to Base UI, the same way button segments already forward `onClick`. This also fixes those callbacks silently losing Base UI's `eventDetails` argument, which a consumer needs to veto a change via `eventDetails.cancel()`. A controlled toggle or group segment supplied without its change callback — which can never change state once controlled — is now disabled outright instead of staying tappable for nothing.

  Architect's library panel gallery promo card no longer announces itself as a selectable option — clicking or activating it never did anything, since the collection it sits in doesn't support selection. It's now rendered as its own labelled group alongside the templates list rather than as one of the list's items, so its Dismiss button and gallery link stay independently operable without the collection's listbox/option structure being misapplied to a card that isn't a selectable option.

- 7be223c: Interface cards in the "Select an Interface Type" dialog are now announced by
  their interface name alone. Each card previously announced its title twice,
  followed by its whole description and every capability tag, as one unbroken
  button name — so moving through the dialog with a screen reader meant hearing a
  paragraph per card before reaching the next name. The description and tags are
  still announced, as the card's description, after its name.
- 06d26fb: Display complete attribute names in pickers whenever the available field width can accommodate them.
- 54650ab: Prevent null form field values from crashing Architect when changing the node type of configured ordinal or categorical bin stages.
- Updated dependencies ([c599dac](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c599dacf78b18efb7d0c5c5fad4d38644a57e775), [9a34469](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9a3446969d5fcc7a3640d8eb5597f807a4fee810), [e3e7b2c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e3e7b2c9cfbc1758754afc0c3959c50ae6518363), [eec63f8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eec63f8c62bd6cfb030c88e396933c4aab384be9), [3e10128](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3e10128db1d1a1abc56f8293d66bf9f7dd75c722), [b51ef59](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b51ef598343c67c95edd4e165c0bac91a7a82571), [43c7746](https://github.com/complexdatacollective/network-canvas-monorepo/commit/43c774665b781cb5cc71acf8ed8c8ca48838ca64), [eb73319](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eb7331942683e879328530e997e554fb12fef52a), [e08ebbf](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e08ebbf8547c2507f5f2a37f7cbab1169dd392cd), [88d7db0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/88d7db04ea3ba323be2fb18f55f6b11d6274740f), [ae3c616](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ae3c616ed4edc55c294be9097e4ae724b249601e), [e9a6522](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e9a652266ef9ddfa7fc42de1c8123bd7011c52a1), [23d0fab](https://github.com/complexdatacollective/network-canvas-monorepo/commit/23d0fab63d4de8da1ba3574cb151ac1c76580d9a), [59f131c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/59f131c2af206c8b1f668b90edf21fbcb3b0b7b7), [06bc1e9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/06bc1e991df40ab3e115da361cfe0ebfe391bbd8), [bd06a52](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bd06a5256b64b82b2718c15b6d3bc825b4ba95c5), [7ca985f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7ca985fe57ca03dda02a96a6013c5dac55dc0123), [c78135c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c78135cd461d1e482ce248b1eb6337359bafc189), [dcbc7aa](https://github.com/complexdatacollective/network-canvas-monorepo/commit/dcbc7aad21ec995bf3a598eb5b208a681789eb4f), [4ea26a7](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4ea26a74dfab5bc02495bc8fa03c31aa5f987dad), [c37a801](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c37a801a3a0a8e6cc82fce3cfe64d031003af207), [0f20ff5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0f20ff594e3fd9b38f393d3d71e9f7bdcc078955), [4a4a9f4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4a4a9f49d4c449e09e07558a0032d6a3b8015743), [fdb3b56](https://github.com/complexdatacollective/network-canvas-monorepo/commit/fdb3b56440f6cad89a44718d24ff725be3bb5e15), [71baa6c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/71baa6c3c376bc287958e5f06659daa1df617e08), [54650ab](https://github.com/complexdatacollective/network-canvas-monorepo/commit/54650ab4bb357d39db88a46f5c3ab8b82375f647), [469d404](https://github.com/complexdatacollective/network-canvas-monorepo/commit/469d4041bd1c86fbfc92eaf2a368f1689858bbd2), [a9825f4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a9825f4067cc6cddd08b64a76e8d88a4b96ae998), [1391fa8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1391fa879011e988a1e8c250a4c80a96797d5d47), [f03b1e4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f03b1e45f425cf3c97ba2137765073a462ee9c9f))
  - @codaco/interview@9.0.0
  - @codaco/protocol-utilities@4.0.0
  - @codaco/protocol-validation@13.0.0
  - @codaco/fresco-ui@6.1.0
  - @codaco/tailwind-config@1.3.0
  - @codaco/shared-consts@6.0.0

## 8.1.0

### Minor Changes

- fec9536: Add a Colored Eco-Genetic Relationship Map (CEGRM) template for families living with an inherited condition. It combines a family pedigree with the participant's wider social network, records relationship closeness and contact frequency alongside exchanges of information, practical help, emotional and spiritual support, and closes on a visual map and an inheritance view.

  Treat the Family Pedigree node label as a validated codebook field, apply its rules to every family-member name entry point, and expose those rules beside the label-variable selector in Architect. Keep the iconically rendered ego node outside label and additional family-member form collection, including in synthetic previews. Reduce the default synthetic Sociogram edge density so preview networks remain legible as their node count grows.

  Keep optional unique fields empty without false duplicate errors, scope comparison rules to the active field namespace, and prevent dormant or duplicate pedigree name controls from affecting validation.

### Patch Changes

- 52a3fbb: Honor reduced-motion preferences in Architect and expose a shared provider for disabling Motion and Base UI animations together in automated hosts.
- d5723ec: Prevent the Sociogram editor from showing Finished Editing until the stage has actually changed.
- e349137: Update runtime dependencies to resolve security vulnerabilities in analytics sanitization, uploads, and form state handling.
- 8920223: Add a default-off Respect skip logic preview setting so disabled previews show every stage and enabled previews retain routing after the initially force-shown stage.
- ea06b66: Validation rules now save what the editor shows.

  Nudging a rule's value with the plus or minus button changed the number on
  screen without saving it, and if the value was being edited at the time, the
  older number was saved instead. Switching on a rule that needs no value — such
  as Required — saved it even where it could never be satisfied, for instance
  alongside a maximum length of zero. A rule held back because it clashed with
  another one stayed unsaved even after the clash was resolved, so a rule could
  sit switched on with a sensible value that was never written. And undoing a
  change left the rule switched on with the old value still showing, ready to be
  written out again.

  A rule whose value was still being typed is no longer dropped when a different
  rule in the same list is saved: changing a minimum and then nudging the maximum
  now saves both, rather than putting the minimum back to its old number. And
  switching the whole Validation section off and then undoing reopens the section
  with the restored rules in view, instead of leaving rules that will be saved
  hidden behind a switched-off section.

  Each rule's plus and minus buttons are also now named after that rule, so a
  screen reader announces "Increase Minimum value" rather than "Increase value"
  on every numeric rule on the screen.

  `InputField` gains two optional props to support this: `onStep`, which reports
  a value settled by a stepper button or arrow key, and `stepperLabels`, which
  names the stepper buttons. Both default to the previous behaviour.

- Updated dependencies [52a3fbb]
- Updated dependencies [fec9536]
- Updated dependencies [90e0178]
- Updated dependencies [90e0178]
- Updated dependencies [e349137]
- Updated dependencies [13e5e99]
- Updated dependencies [673d5f3]
- Updated dependencies [ea06b66]
  - @codaco/fresco-ui@6.0.0
  - @codaco/interview@8.0.0
  - @codaco/protocol-utilities@3.2.1
  - @codaco/protocol-validation@12.1.1

## 8.0.2

### Patch Changes

- 3c8fe35: Generate realistic, source-backed family pedigrees with reproductive scenarios and multi-generational disease lineages, while respecting each stage's collected variables, keeping pedigree membership isolated from other interview stages, correctly rendering shared and multiple unions, widening partnership response columns, and warning participants before discarding onboarding progress.

  Improve pedigree editing and parentage capture by confirming destructive deletions, preserving biological-sex values, allowing current/ex-partner status changes, and recording reproductive roles independently from sex recorded at birth.

- Updated dependencies [3c8fe35]
- Updated dependencies [fa88ae4]
- Updated dependencies [2325d34]
  - @codaco/protocol-utilities@3.2.0
  - @codaco/fresco-ui@5.1.0
  - @codaco/interview@7.1.1
  - @codaco/shared-consts@5.6.1

## 8.0.1

### Patch Changes

- c5f30fd: Restore the full-size interview type scale on tablets.

  The interview's viewport ramp for `--theme-root-size` rendered below the full
  `1rem` base for every viewport narrower than 1280px — sitting at its `0.9rem`
  floor (14.4px) up to tablet-portrait width and only climbing to 15.7px by iPad
  Pro landscape width — so tablets rendered the participant interview at the
  smallest text sizes in the product, with spacing and touch targets
  (checkboxes, radios) shrinking in lockstep below recommended minimum sizes.
  The ramp is now piecewise: phones keep the dense `0.9rem`-floored curve in
  both orientations, tablets (768–1280px) get the full `1rem` base — matching
  the interview's pre-July size and returning default form controls to the 24px
  WCAG 2.5.8 minimum — and displays at 1280px and above are unchanged.

  The interview theme also gains a 16px font-size floor for text-entry elements
  (text inputs, textareas, selects, and rich-text editors), expressed as
  `max(16px, 1em)` so explicitly larger sizes pass through. iOS Safari zooms the
  page when a focused editable element renders below 16px; with the phone-width
  type scale this made every form field a zoom trigger in browser hosts. Editable
  text in the interview now never renders below 16px at any viewport size. To
  support this, `SegmentedCodeField` now carries its text-size class on the
  segment group wrapper (segment inputs inherit), so the floor preserves its
  `lg`/`xl` sizes; computed sizes are unchanged.

- Updated dependencies [ea589ec]
- Updated dependencies [48572ed]
- Updated dependencies [8ff0e2d]
- Updated dependencies [c5f30fd]
- Updated dependencies [8ff0e2d]
- Updated dependencies [b95af22]
- Updated dependencies [66da138]
- Updated dependencies [d985cd3]
- Updated dependencies [cd974f7]
  - @codaco/fresco-ui@5.0.3
  - @codaco/interview@7.1.0
  - @codaco/tailwind-config@1.2.2
  - @codaco/protocol-utilities@3.1.1

## 8.0.0

### Patch Changes

- cd88c3e: Architect 8 and Interviewer 8 are now stable releases. Future app versions follow standard semantic versioning and deploy to production when the Version Packages release PR is merged.
- Updated dependencies [fde9bb4]
  - @codaco/fresco-ui@5.0.2
  - @codaco/interview@7.0.2

## 8.0.0-beta.13

### Patch Changes

- Marking a boolean option as negative now takes effect during an interview — the option is shown in red once a participant selects it. The BooleanChoice help text has been corrected to describe what participants actually see.

## 8.0.0-beta.12

### Minor Changes

- Improve variable pills with clearer static and editable states, full-name details, and a focused variable rename workflow.

### Patch Changes

- Polish stage editing and preview workflows across Architect. Variable, subject,
  color, and shape pickers now share consistent field styling; variable pills
  offer a clearer accessible rename interaction; quick-add and categorical-bin
  variables expose their validation rules; and newly created quick-add variables
  are required by default. The stage editor now avoids false unsaved-state and
  preview-settings transitions, while preview-only notices and the obsolete
  relationship question in the Life Transitions template have been removed.
- Fix being able to save an option that has no label or no value. Confirming an
  option you had not filled in used to collapse it into the list with nothing to
  show it was incomplete, leaving a protocol that failed validation later. The
  option's editor now stays open and marks whichever field is still missing, and
  an options list containing an incomplete option says so.
- Fix the Input Control picker vanishing after you choose an input control for a
  newly created variable, which left the field impossible to complete.
- Previewing a protocol whose validation rules cannot all be satisfied now
  explains why. The preview lists each clash — naming the entity type and the
  variables involved, and describing the conflict — so you can go back, correct
  the rules, and preview again. Previously this showed the same generic
  "couldn't build the preview" screen as any other failure, with a "Try again"
  button that could only fail in exactly the same way.

  A preview that fails to rebuild also clears what was on screen, so an earlier
  successful preview is never left showing as though it were the protocol you
  just changed. Each attempt reports only its own reason for failing: a list of
  rule clashes from an earlier attempt is never left up next to a failure that
  had nothing to do with those rules, and a slow protocol that arrives after the
  preview has given up waiting now reports what actually happened to it — the
  rule clashes to correct, or the preview itself — instead of continuing to
  blame the connection to Architect.

- Fix a link that spans bold, italic, and plain text being saved as several
  separate links. Adding one link across mixed formatting used to write out one
  link per run of formatting, so a single citation became three links to the same
  place — three things to hover, three underlines, and three links announced by a
  screen reader. Such a link is now saved as one link, and the affected references
  in the Life Transitions template have been repaired.
- Prevent invalid protocol edits from being saved, and require authors to revert or return to the start screen before continuing.
- The variable validation editor now prevents contradictory rules at authoring
  time: contradictory drafts cannot be saved and explain why, reference pickers
  only offer targets that keep the rules satisfiable, the whole field dialog is
  checked on save (e.g. deleting an option out from under `minSelected`), and a
  hint appears when `unique` is applied to a variable with only a few possible
  values. Codebook edits are also checked against the current shared form and
  every NetworkComposer stage-effective control overlay, and integer validation
  bounds reject fractional values directly in the editor. Network Composer group
  variables are kept separate from validated form fields, including in the Life
  Transitions template.

  Relative date anchors in years 0001 through 0099 now remain selectable and
  valid in the editor, matching the protocol schema and interview runtime.

- Keep the confirm and cancel buttons reachable when renaming a variable with a long name.
- Variable pickers no longer offer variables that would end up written both with and without validation: form-field pickers exclude variables already written by a bin, sociogram highlight, census, or other direct writer, and those stages' pickers exclude form-collected variables (the current selection always stays available). Saving a stage that would create such a pairing is refused with an explanation of why, including conflicts between a Name Generator's still-unsaved form fields and prompt assignments. Protocols that already contain one show a warning on the protocol timeline listing each affected variable and the stages involved, with a badge on the Stages tab — nothing blocks opening, editing, or exporting. Newly created "other" and quick-add variables default to required.

## 8.0.0-beta.11

### Patch Changes

- Refine the Codebook screen layout: the search bar, entity tables, and the
  unused-variables alert now share a single width; the "Show unused only" toggle
  moves onto the search row with its label beside the checkbox; and there is more
  separation between entity types and between individual entities.
- Fix two variable dropdowns that could produce protocols failing validation. The
  sort-order rules for the sociogram bucket and bin (ordinal bin, categorical bin,
  and one-to-many dyad census) now offer Ascending/Descending in the direction
  dropdown instead of a list of variables. Scalar (visual analog scale) variables
  now offer only the validation rules that scale supports — Required alongside the
  comparison rules — and no longer offer "must be unique", "different from", or
  "same as", which the schema has never accepted for a scale.
- Reduce spacing around editable list item previews.
- Protocol previews now reflect the refined interview typography, which scales
  smoothly with the window size instead of stepping between fixed sizes.
- Use medium-sized edit and delete buttons throughout editable lists.
- The installed app's icon now fills its tile on the dock, home screen, and task
  switcher, instead of sitting inside a white border, and renders at a consistent
  size whether the app was installed from Safari or Chrome.
- Protocol validation failures during import and stage preview now show a readable list of problems (one `path: message` line per issue) instead of raw JSON.
- Add the Life Transitions & Turning Points protocol to Architect's built-in templates.

## 8.0.0-beta.10

### Minor Changes

- Open protocol previews in a dedicated window instead of a browser tab. When Architect is installed as an app, the preview opens in its own app window.
- Synthetic preview sessions now draw roster-stage people from the protocol's
  actual roster assets instead of inventing them, so a preview lines up with the
  roster file the way a real interview would. A roster that is missing or
  unreadable — including a half-built draft stage — falls back to generated
  people, so a roster problem never blocks a preview.
- Allow Narrative stages to use custom image backgrounds, accept SVG image resources, preview canvas backgrounds at their full interview size and color, render resource cards responsively with contextual surface shading, and link every canvas background selector to responsive SVG guidance.

### Patch Changes

- Stop the stage editors from silently discarding variable settings they don't manage. Adding an editable attribute to a Network Composer stage no longer clears the input control from the variable in your codebook, which previously broke every other stage that used the same variable. Interface-owned option sets, such as the Family Pedigree biological sex values, also keep their locked state when you edit a form field that uses them.

  Day offsets on a relative date picker can no longer be set to a negative number, and edge rules are no longer offered on side panels that draw their data from an external file, where they can never match. Switching an existing panel to an external file now offers to remove any edge rules its filter already contains.

- Renaming an ego variable to a name already in use now shows an inline "already in use" message on the field, matching how node and edge variables behave. Previously it slipped past the inline check and surfaced a confusing "Misconfigured Protocol" dialog instead.
- Closed several ways a protocol could be left in a state the validator rejects, where saving previously appeared to work but the stage silently reverted:

  - Mapping a variable to a node shape now requires a variable to be chosen, and a breakpoint mapping requires at least one threshold with strictly increasing values. New thresholds start above the previous one, and an incomplete mapping blocks saving with an explanation instead of reverting without warning.
  - Changing the node type of a Family Pedigree stage is now blocked, with an explanation, while a Narrative Pedigree stage depends on it — preventing a broken reference to a variable that no longer exists on the new type.
  - The map stage now reads feature properties from every feature in a GeoJSON file rather than only the first, so the property selector appears whenever any feature has properties. When no feature has any, saving is blocked with a clear message rather than failing validation later.
  - The codebook's "used in" display now names shape settings as a place a variable is used.

- Make Architect's large startup spinner match the motion and colours of the loading indicator used throughout the app.
- Fix the loading spinner covering the protocol upgrade dialog, which made the "Create upgraded copy" button unclickable when opening an older protocol.
- Fix the update dialog so Install and reload opens the new version immediately and shows progress while the update is applied.
- Clarify that protocols and settings are saved locally on this device, whether Architect is open in a browser tab or installed as an app.

## 8.0.0-beta.9

### Patch Changes

- Prevent the browser Back button from opening an empty, invalid protocol after returning to the start screen.
- Bundled template protocols now set an explicit dialog title on their name
  generators ("Add Person") and an explicit scale color and canvas background
  where these were previously implicit defaults, so they satisfy the tightened
  protocol schema.
- Ensure automatically generated stage names start with a capital letter when they begin with user-defined text.
- Add a “Return and download now” option when leaving the protocol editor, so researchers can download the active protocol and return to the start screen in one step.
- Remove the redundant skip-destination note from timeline stages while retaining the skip-logic icon.
- Show browser-specific protocol storage risk in the install banner, request
  persistent storage after the first user interaction, and keep the Install action
  matched to the warning level.

## 8.0.0-beta.8

### Minor Changes

- Let researchers choose where an interview continues when a stage is skipped:
  the next available stage, a specific later stage, or the interview finish
  screen.
  Architect now shows these routes in the timeline and protocol summary and
  protects referenced destinations from invalid deletion or reordering.
  Preview only applies its one-stage skip override when routing could actually
  make the selected stage unavailable.
  The bundled Mental Health Networks and Transnational Networks templates now
  collect explicit consent and route declined consent to the finish screen.

  Interviewer follows the live route as answers change, keeps unavailable screens
  from flashing during recovery, and allows a skipped or bypassed screen to be
  opened once after confirmation.

### Patch Changes

- Show the install prompt with a warning palette, restore the Home screen action hierarchy with medium sea-green Create and slate-blue Open buttons, and keep filled Download and Finished Editing toolbar actions sea green when hovered.
- Update Architect action toolbars to use the shared SegmentedToolbar default theme, medium sizing, restrained floating shadow treatment, and explicit colors for primary preview/download actions. Apply the same restrained shadow to the top navigation bar, remove redundant shared theme overrides, set Architect primary actions to sea-green while keeping neutral buttons visually neutral, align timeline row interaction states with the selected token, let shared dialogs keep their default white popover surface, and refactor stage editor sections onto the shared Surface nesting system.
- Migrate Architect's dynamic list editors to fresco-ui ArrayField, preserving Redux Form state, validation, animated rounded dialogs, reordering, limits, dependent controls, and semantic Fresco fields throughout array rows.
- Color and resize Codebook edge type icons to match the selected edge type.
- Fix three protocol-editor bugs surfaced while building end-to-end coverage: selecting a node or edge type no longer clears when the field loses focus; creating an edge type inline within a Tie-Strength Census prompt no longer writes an invalid value that corrupts the codebook; and choosing a roster data source no longer force-expands the optional Search Options section and blocks saving.
- Fix the Family Pedigree stage delete guard. It previously read a pruned stage list that never contained the reference field, so deleting a Family Pedigree stage that a Narrative Pedigree depends on silently did nothing; it now correctly shows a blocking dialog instead.
- Audited and hardened Architect's migration to the fresco-ui field system, and reworked the "map variable to shape" editor.

  Form fixes: clearing a numeric field (e.g. a maximum-alters limit) no longer stores an empty string over the intended empty value; integer fields reject exponent/decimal input that previously stored a silently wrong number; categorical rule operands in filters and skip logic keep their selected values instead of being dropped on save; and dialog editors no longer let a native browser validation bubble pre-empt the styled, scrollable error display. Rule editors, protocol notes and stage previews now render markdown through the shared renderer, and the query-rule editors use a lighter controlled field wrapper.

  Styling and accessibility: field error states use a border cue rather than repainting whole rows, several date and relative-date inputs gained accessible names, and dead legacy styling was removed.

  Map variable to shape: the threshold editor is now a fresco editable list — add, remove, and inline-edit thresholds, capped by the number of available shapes. Threshold inputs are configured per variable type (scalar variables step across their normalised 0–1 range; number variables use their own range). The default-shape row, threshold rows, and shape choosers were restyled to match, with a node-coloured selection ring on the shape and colour pickers.

  Field labels: across the stage and codebook editors, a field label that merely restated its section heading (e.g. a "Prompts" list under a "Prompts" heading, or "Node type" under "Node Type") is now visually hidden while remaining the control's accessible name, so each field is named once instead of twice. Where a section holds several fields, duplicated labels were renamed to add information rather than hidden, and a couple of fields that had an empty or missing label gained a proper accessible name.

- Complete the fresco form-field migration with consistent custom chooser styling and accessibility, reliable validation, and correct add, edit, remove, and reorder behavior.
- Replace additional Architect form controls with fresco-ui field components while preserving redux-form state.
- Move Architect heading and lead text styling onto shared fresco-ui typography components and variants, retire the local heading utility classes from the Architect theme, switch codebook variable tables to the shared DataTable, tune variable pills to match shared button sizing with surface-token colors and an animated accent border, and color the finished editing action sea-green.
- Align the start screen library metadata with the Recent and Templates tabs, restore the panel to the base white surface, and publish that surface color so collection scroll fades match the panel background.
- Fix creating a new layout variable from a Narrative stage preset. The handler destructured a `dispatch` prop that react-redux's object-shorthand `mapDispatchToProps` never provides, so the action threw; it now calls the already-dispatch-bound action creator directly.
- Remove the unintended green tint from tables in printable protocol codebooks while preserving the intended row and column striping.
- Render Resource Library media previews on the interview background so transparent image and video assets keep their interview-time contrast.
- Fixed a range of protocol-editor UI issues:

  - The install banner and the "this protocol is already open in another tab"
    banner now both appear as strips at the top of the screen, with white,
    intent-coloured action buttons.
  - The "Create/Edit Field" dialog is split into distinct sections (Variable,
    Question, Input Control, Categorical/Ordinal Options, Validation), and the
    Validation list now uses inline editing with a collapsed summary per rule.
  - Categorical/ordinal option rows and the protocol description field use cleaner,
    consistent styling with no clashing background or border layers.
  - Empty toggleable sections centre their "enable this feature" message correctly.
  - Selecting a node type for a stage no longer clears itself when you edit another
    field or save, so stages can no longer be saved in an invalid state.

- Use the fresco-ui RichSelectGroup for choosing sociogram background types.
- Show linked text as plain text in item previews to keep it readable against colored backgrounds.
- Use the fresco-ui Likert scale for roster search accuracy settings.
- Load the newest app shell on fresh online launches while preserving the precached offline startup path and keeping in-progress interviews on the active offline-safe shell.
- Improve printed protocol summaries with neutral table colors.
- Replace Architect alert-like panels and editor tips with the shared fresco-ui Alert component.
- Use responsive shared dialogs throughout Architect while preserving Interviewer's purpose-built home modal sizing.

## 8.0.0-beta.7

### Minor Changes

- Add a developer authoring mode for source-linked template protocols, including a toolbar action that saves edited template, sample, and development protocols back to the canonical protocol source package.
- Use the shared rich text editor for protocol text fields and add support for inserting hyperlinks.

## 8.0.0-beta.6

### Minor Changes

- Architect now uses the shared Network Canvas design system — the same theme foundation as Interviewer. Interface elements shared between the apps, including the app update dialog, confirmation dialogs, and form fields, now display correctly. Architect's appearance is otherwise unchanged, with a few small refinements: fonts are bundled with the app rather than loaded from Google Fonts (better offline support and privacy), timeline stage cards show a subtle highlight when hovered, and badge text on dark backgrounds is easier to read.

### Patch Changes

- The Narrative Pedigree stage editor's at-risk help text no longer references the removed "may be affected" (homozygous) marker. At-risk relatives are now described only as "may develop" or "may carry" a condition, and the copy clarifies that a solid, filled symbol indicates a clinically affected individual (per Bennett et al., 2022 nomenclature), so at-risk relatives always appear as unfilled symbols marked with a "?".

## 8.0.0-beta.5

### Minor Changes

- Replace the update toast with a version indicator that shows when an update is available or has just been applied, and displays the release changelog. Updates now apply automatically on a fresh load when no work is in progress.

### Patch Changes

- Fix minor styling from invalid Tailwind classes: button colour transitions, the
  search field's clear-icon colour, and the ordered-list error text colour.
- Close a batch of data-durability, privacy and safety gaps surfaced by the pre-release audit follow-up:
  - **Encrypted variables:** editing a field in the Network Composer or Family Pedigree editors no longer strips the variable's `encrypted` flag.
  - **Analytics privacy:** import-validation failure analytics no longer embed protocol-derived strings (codebook keys, variable names, entered values) — only structural error codes/paths are sent.
  - **Asset export:** distinct assets whose names sanitise to the same archive entry no longer silently overwrite each other, and the primary Download button now warns when a `.netcanvas` is exported with unresolved assets.
  - **Validation timing:** an edit that lands while a validation is in flight is no longer dropped, and auto-undo no longer reverts a valid newer edit or stacks dialogs.
  - **Undo/persistence:** inline-created variables with an invalid name show a friendly error instead of throwing; a mismatched rehydrated protocol id/content pair can't autosave the wrong content into a library row; a `sessionStorage` quota failure now surfaces the storage-unavailable banner instead of silently going in-memory.
  - **Preview:** assets held in the Safari-private in-memory fallback are now transferred to the preview tab, so media/roster protocols preview correctly.
  - **PWA updates:** the update auto-apply now also defers during the autosave-debounce window after a stage edit and during bundled-template imports, so a fresh-load auto-update can't reload mid-write.
  - **Storage GC:** orphaned asset blobs are now removed within a transaction that includes the assets table, so the delete no longer throws and leaves the blob behind.
  - **Stage editor:** a multi-step browser Back from a dirty stage editor now prompts before discarding the draft, and the unsaved-variable dialog confirms before a backdrop dismiss.

## 8.0.0-beta.4

### Patch Changes

- Fixed a memory leak in the protocol summary where an asset preview's object URL was never released if the asset finished loading after the preview had already closed or switched to a different asset.

## 8.0.0-beta.3

### Minor Changes

- Renamed the app from "Architect Web" to "Architect". The browser tab now reads **Architect** and the package is `@codaco/architect`. Your protocols, saved work, and workflow are unchanged.

## 8.0.0-beta.2

### Minor Changes

- You can now work on more than one protocol at a time in separate browser tabs.
  Each tab keeps its own open protocol and edits, so opening a second protocol in a
  new tab no longer disturbs the first, and reloading a tab keeps the protocol you
  were editing. Opening a fresh tab starts at the start screen. If you open the
  same protocol in two tabs, the second becomes a read-only view that tells you the
  protocol is already open elsewhere, so the two tabs can't overwrite each other's
  changes.

### Patch Changes

- Pre-release audit fixes across the protocol designer. Your work is protected in
  more places: the undo history no longer quietly fills up browser storage, an
  interrupted export now tells you which resources were skipped instead of failing
  silently, exported protocols keep same-named resources distinct, and reloading
  for an update warns you before discarding an in-progress edit. Deleting and
  editing entries in the codebook is safer — encrypted variables stay encrypted,
  in-use resources can no longer be removed by mistake, and clearer prompts appear
  when a change would affect another part of your protocol. The Family Pedigree,
  Narrative Pedigree, and Network Composer editors handle diseases, edge types,
  labels, and source-stage changes correctly; Family Pedigree's fixed value sets
  (such as biological sex) stay read-only after they're created; and previewing is
  more robust (clearer errors instead of a preview that never loads). Option labels no longer
  pick up stray blank lines. Privacy is tightened: analytics no longer transmits
  your protocol's text, and a Content-Security-Policy is applied to the deployed
  app.

  Starting up is nicer too: a loading animation now appears while the app opens
  instead of a blank screen, and the "install Architect" banner disappears on its
  own as soon as you install the app, without needing to refresh.

## 8.0.0-beta.1

### Patch Changes

- Fix the Information stage editor producing invalid protocols. Text blocks could previously be resized, which set a display size that is no longer valid for text. Content blocks are now managed as a reorderable list with no limit on how many you can add, and a display size (Small, Medium, Large, or full size) can be set on image and video blocks only.

## 8.0.0-beta.0

- Start of the changeset-driven beta release line.

## 7.0.0-beta.1

### Patch Changes

- Updated dependencies [02c4314]
  - @codaco/fresco-ui@2.12.2
  - @codaco/art@0.1.0

## 7.6.0

### Minor Changes

- 7775d5f: Replace FamilyTreeCensus stage editor with FamilyPedigree, matching restructured protocol schema. The new editor organizes configuration into Node Configuration and Edge Configuration sections, simplifies the census prompt, and generalizes disease nomination prompts into generic nomination prompts.

### Patch Changes

- Updated dependencies [f1dbd8d]
  - @codaco/protocol-validation@11.4.0

## 7.5.2

### Patch Changes

- Updated dependencies [b8b9fb0]
  - @codaco/protocol-validation@11.2.0

## 7.5.1

### Patch Changes

- Updated dependencies [4f2d778]
  - @codaco/protocol-validation@11.1.1

## 7.5.0

### Minor Changes

- 273bcbe: Add optional showTransit and allowSearch configuration options to geospatial interface mapOptions:

  - showTransit: When enabled, Fresco displays transit layers on the map
  - allowSearch: When enabled, participants can search the map for locations

  Both options default to false (disabled).

- Updated dependencies [273bcbe]
  - @codaco/protocol-validation@11.1.0

## 7.4.0

### Minor Changes

- 8f91391: Remove `introductionPanel` from Geospatial interface schema.

  This is a breaking change for existing protocols that include an `introductionPanel` on Geospatial stages. Protocols with Geospatial interfaces no longer support or require an introduction panel.

### Patch Changes

- Updated dependencies [8f91391]
  - @codaco/protocol-validation@11.0.0

## 7.3.0

### Minor Changes

- b713317: Add greaterThanOrEqualToVariable and lessThanOrEqualToVariable validations for number, datetime, and scalar variable types

### Patch Changes

- Updated dependencies [b713317]
  - @codaco/protocol-validation@10.1.0

## 7.2.0

### Minor Changes

- 23b675c: Migrate from direct PostHog usage to @codaco/analytics package for consistent analytics across all Network Canvas apps

## 7.1.0

### Minor Changes

- 01448c8: Split Family Tree sexVariable into egoSexVariable and nodeSexVariable.

  This is a breaking change for existing protocols that reference the old sexVariable field. Protocols with Farmily Tree interfaces require that the egoSexVariable and nodeSexVariable be defined separately.

### Patch Changes

- Updated dependencies [01448c8]
  - @codaco/protocol-validation@10.0.0

## 7.0.3

### Patch Changes

- Updated dependencies [cc2adc3]
  - @codaco/protocol-validation@9.0.0

## 7.0.2

### Patch Changes

- Updated dependencies [9958b67]
  - @codaco/protocol-validation@8.0.2

## 7.0.1

### Patch Changes

- Updated dependencies [84d09e3]
  - @codaco/protocol-validation@8.0.1
