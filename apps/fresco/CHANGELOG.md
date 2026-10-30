# fresco

## 5.0.0

### Major Changes

- 2ae2172: Fresco now keeps schema 8 protocols and their interviews as they are, and runs
  them in the schema 8 interview, which comes with Fresco. Studies running a
  schema 8 protocol carry on exactly as before.

  - Fresco never upgrades a protocol to schema 9. A schema 8 protocol is
    imported exactly as it is, and a schema 9 protocol likewise. A schema 7
    protocol is still brought up to schema 8 on import, as before, and runs as a
    schema 8 protocol. To use schema 9 features, upgrade the protocol in
    Architect and import the saved file.
  - Updating Fresco no longer upgrades the protocols and interviews it already
    holds. A schema 8 protocol is marked with its schema version in the protocols
    table, and its interviews open in the schema 8 interview, at
    `/v8/interview/<id>`. Onboarding links, participant links and resumed
    interviews go there on their own.
  - Exports, the interview API and generated test interviews read schema 8
    interviews with schema 8's own code, so their exported files are the same as
    before. An export can mix schema 8 and schema 9 interviews.
  - A deployment still running a Fresco release before 4.0, which stored schema 7
    protocols, must update to the latest 4.x release before updating to this one.

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

- 151e511: Exported data keeps every answer when names use any language, and tells you
  when it had to change something to do so.

  - Export file names keep the node or edge type's name as you wrote it, in any
    language and with spaces. Only characters a file system can't store, such as
    `/` or `:`, are left out. A type name with a hyphen or a dot now keeps it, so
    a "Close-Friend" type exports to a file ending `_Close-Friend.csv` rather than
    `_CloseFriend.csv`. If you have analysis scripts that find export files by
    name, check them.
  - Two types whose names would give the same file name, such as "Friend/Family"
    and "FriendFamily", or "Friend" and "friend", now get the type's ID added to
    the end of each file name. Before, one type's file could replace the other's,
    and its data was then missing from the export. If two files in one export
    would still have the same name, the export now stops with an error rather
    than lose one of them. In Fresco, a large export is made in parts, and a
    file from a later part that has the same name as one already exported is
    given a number at the end of its name, such as `_2`. Before, the later file
    was left out of the export.
  - When two columns in one file would have the same name, the later one is
    written under a numbered name, such as "age_2", and the export tells you
    which columns were renamed. Before, the columns were merged and one
    attribute's answers were lost.
  - In GraphML, a column name can't contain spaces and some punctuation, so those
    characters are written as `_`, and the name as you wrote it is kept in the
    column's description.
  - GraphML can't store some invisible control characters. When an answer, or a
    name in an older protocol, contains one, it is removed from the GraphML files
    only, and the export lists the interviews and attributes affected. The CSV
    files keep every answer unchanged.
  - CSV column headers are written exactly as the attributes are named. Answers
    that begin with `=`, `+`, `-` or `@` are still written with a leading `'`, so
    that spreadsheet programs don't run them as formulas.

  Interviewer shows these notices in the export dialog, and as messages that stay
  until you dismiss them. Fresco shows them as messages that stay until you
  dismiss them.

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

- dfcee00: Node types, edge types and attributes have only a name again. Architect no
  longer asks for a separate label when you create or edit one, because
  participants never see either. Where a stage does show an edge type to
  participants, the stage gives it its own translatable label: in a Narrative
  preset's legend, and in a Network Composer stage's toolbar. A node with no
  name is shown as "Unnamed".
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

### Patch Changes

- 50cc7c9: In the Family Pedigree, adding a sibling as an adopted child of the parents they share no longer asks whether they are a twin or who carried the pregnancy. Someone else carried them, so the parents who adopted them are recorded as not having carried them, and they are not anyone's twin. The twin question still appears when the participant was adopted by the same parents, since twins can be adopted together. If a parent who adopted someone is later changed to another kind of parent, the recorded answer that they did not carry the pregnancy is cleared and the question is asked again.
- bc7e02b: The Next button on Ego, per-person and per-connection forms now lights up as soon as every question has an answer, or once every required question is answered and the participant has scrolled to the end of the form. Answers already given, and an answer typed into the last question, now count without the participant first leaving the question.
- 24c3716: On the Network Composer, the names of groups now show their formatting in the Groups list and on the buttons that add selected people to a group. Bold and italic text appear as formatted, and characters such as `<`, `&` and `'` appear as typed.
- 5669fa1: Menu, select and combobox items now have a small gap between them, so a run of checked or selected items no longer merges into one block.
- e28359f: Leaving or finishing an interview now waits until the latest answers have been
  saved. If saving them fails (for example, because the connection dropped), the
  interview stays open and the confirmation explains that the answers could not
  be saved, so the participant can try again. Previously the interview closed or
  finished anyway, and the answers given since the last save could be lost.
- 212e2a1: Cancelling an export while Fresco is putting together the ZIP file now cancels
  it. Before, the file was still downloaded and the interviews were marked as
  exported.
- f965774: Participants now see the interview pages in their own language. The browser tab title, the "screen size too small" notice, and the onboarding error pages (a problem during onboarding, an invalid link, and anonymous recruitment disabled) follow the language Fresco negotiated for the visit instead of always appearing in English, and the interview wrapper no longer declares itself as English when it is not.
- 4be7416: The keyboard focus ring on the dashboard's navigation items now animates into
  place like the focus ring on every other control.
- 1432069: When Fresco cannot upgrade a protocol made with an older version of Network Canvas, it now reports it to analytics both as a refused protocol and as an application error, so failed upgrades can be counted and fixed. Damaged files are still reported only as refused protocols. Nothing is reported when analytics are disabled, and no protocol names or contents are sent.

  For developers: `@codaco/protocol-validation` exports `toReportableProtocolError`, which copies an error that failed to open or upgrade a protocol without its message, keeping its name, its stack frames and its cause chain, so it can be sent to exception tracking without quoting the protocol.

- bec9b59: Add `OptionLabel` and `optionLabelText` (`@codaco/fresco-ui/OptionLabel`), the shared way to show an option label: the component renders its markdown, and the helper gives the same label as plain text for an accessible name or other attribute. Every Fresco UI option field now renders its labels through them.

  Screen readers now read a toggle-button option and the chosen value of a Likert scale as the words shown, rather than as their markdown or escaped characters.

- 2b95dd1: The version shown in Settings now includes the commit the release was built
  from. Before, a Docker deployment always showed "Unknown commit hash".
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

- 0912a1f: In the Narrative Pedigree, the highlighted line for a focused person no longer has gaps where it meets a dimmed line: where it turns at a line that carries on, or where a relative's dimmed line joins it. Every dimmed line is now drawn underneath the highlighted ones, in the interview and in saved snapshots.
- 3d1b535: In the Narrative Pedigree, the button that clears the focus on a person now sits in the toolbar instead of above it, and the toolbar's labels use smaller text.
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

- 7d2293b: The Family Pedigree asks fewer questions whose answer it already knows:

  - Adding an adopted child or an adoptive parent no longer asks who carried the pregnancy; the adoptive parent is recorded as not having carried it. A parent who did carry it can still be recorded from their panel.
  - Someone born to a couple is no longer offered as the twin of a child they adopted, whichever of the two is added, and the person panel's twin list leaves them out too.
  - When two twins cannot be identical, the sibling form offers only "No" or "Yes, fraternal", and the person panel records them as fraternal without asking. In the sibling form that is when they differ in sex at birth or do not share both genetic parents; in the person panel, where answering identical brings the twins' genetic parents into line, it is when they differ in sex at birth or their parents cannot be brought into line. The question returns, unanswered, if a change makes identical twins possible again.
  - A new twin is recorded as carried by whoever carried their twin, without being asked. If the twin answer is changed to "No", the question comes back.
  - The twin question appears only once the new sibling shares whoever carried the participant.
  - When adding a parent, the question about their partner waits until the kind of parent is chosen.

- df1708b: In the Family Pedigree and the Narrative Pedigree, Show the whole family (and every automatic reset of the view) now zooms in as far as the family fits, up to a fifth larger than its natural size, instead of stopping at its natural size.
  The Family Pedigree no longer keeps empty room around the family for the add-relative buttons, so the family fills the space between the prompt and the toolbar.
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

- 624a6f8: Every Family Pedigree toolbar button now has a tooltip that names it and says what it does, including the Show the whole family button, which had no tooltip before.
- a8c2a11: Family Pedigree: choosing an item from the "what's still needed" list now
  puts the list away, so it no longer covers the details panel it opened. The
  notice listing missing details no longer ends a question with "?.".
- 6cc9d9d: The Family Pedigree's add-person steps no longer pre-select any answer: the kind of parent, child or sibling, the other parent, whether two people are still together, shared parents and twins all start unanswered. A step's button reads "Skip" only while nothing on it is answered, and "Continue" once anything is. The "Some details are missing" notice is removed, along with its `missingDetailsList` wording. When participants add their own child, the step-child, donor and surrogate options now say "you" ("A child you carried as a surrogate"), through a new `isYou` argument on the `childKindSocial`, `childKindDonor` and `childKindSurrogate` wording.
- 72b189a: In the Family Pedigree, twins share one carrier: answering who carried one twin answers it for the other, and the add-child and add-sibling forms now require "Who carried the pregnancy?" to be answered. Continue on a step with a required question left unanswered now shows the same error Save does, instead of doing nothing visible. When participants add a partner, "Are they still together?" names the person ("Are they still together with “Dina”?"). Two people recorded as female and male at birth are not offered as identical twins. Questions no longer put a possessive after a quoted name ("Are they a twin of “Cara”?" instead of "Are they “Cara”’s twin?"). A new sibling who would not share the person who carried someone cannot be their twin. When editing someone's twins, a twin recorded with a different sex at birth from another twin already answered identical cannot be identical too, since all of them would then be identical. Editing someone no longer offers as their twin a sibling someone else carried, and adding a sibling checks "Yes, identical twins" against the sex at birth of every twin identical to the person. Whoever is recorded as carrying one twin counts as having carried them all, so adding or connecting a parent cannot record someone else as carrying another twin. When someone recorded as male at birth cannot be a surrogate, the hint gives only that reason, not also who else carried the pregnancy. Adding a parent asks whether they carried the pregnancy only once their kind of parent is chosen. `validateField` in `@codaco/fresco-ui`'s form store takes a `showErrors` option that marks the field touched so its error shows.
- 7d6ebb8: In the Family Pedigree, the view now goes back to the whole family, centred, whenever the participant presses Show the whole family, moves to another prompt, or finishes adding or editing someone, instead of keeping where they had dragged or zoomed it. The zoom fits the whole family, no larger than its natural size and no smaller than the furthest the zoom buttons go.
- b7a7d08: The Family Pedigree opens framed as Show the whole family frames it, and moving between prompts keeps the participant's zoom and pan. Show the whole family frames the same family the same way on every prompt, and, like the opening view, zooms out no further than names stay legible, centring on the participant when the whole family would be drawn smaller.
- 92cf293: Reduced motion now follows `AnimationProvider`'s `reducedMotion` setting everywhere, not only in Motion components. `@codaco/fresco-ui/reducedMotion` adds `usePrefersReducedMotion()` (use it instead of Motion's `useReducedMotion()`, which reads only the operating system) and `prefersReducedMotion(node)` for code outside React. The provider marks the document root with `data-reduced-motion` when it overrides the system, and `@codaco/tailwind-config`'s `motion-reduce:` / `motion-safe:` variants and its global reduced-motion rule follow that mark. With the default setting nothing changes: motion follows the operating system's preference as before.
- 01189fd: Clearer German, Spanish, French, Italian, Dutch, Brazilian Portuguese and
  Chinese wording for the schema 9 text. Every translation added since the last
  release was checked by blind back-translation and adversarial review, and
  fixed where it read differently from the English: participant messages now
  use the polite form throughout in Chinese, the pedigree uses the same words
  for relatives in the editor as in the interview, and several labels no longer
  read two ways.
- 9fdb4ff: When an interview task cannot be displayed, the error screen's copy button now reads "Copy" and changes to "Copied" for a moment once the debug information has been copied, which screen readers also announce. The message above it is now set out as a heading and short paragraphs instead of one block of text, in every language the interview ships. New protocols get the new wording; a protocol that already holds its own wording for this message keeps it.

  In Architect, the Languages page now offers the translation table even when a protocol has only one language, since that is where the protocol's own words for the interview, such as this error message, are edited.

- 332df6a: Rounded corners now always come from the theme's radius tokens, including on elements that animate their size. The segmented toolbar is a full pill at every screen size, so its ends match its round buttons on large screens too, and its corners stay round while tools appear and disappear. Lists of items in forms, the expanded category in the categorical bin interface, and dialogs that open out of a list row keep the theme's corner radius throughout their animations.

  `@codaco/fresco-ui` adds `useTokenRadius` (`@codaco/fresco-ui/hooks/useTokenRadius`), which reads the radius an element's `rounded-*` class resolves to so it can be passed to a Motion component's `style.borderRadius`. `ModalPopup` applies it itself for a `layoutId` morph.

- Updated dependencies ([50cc7c9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/50cc7c9c97a835bde5752f614b683dda7a66a9c4), [b8a5637](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b8a563797c356e3ad9091a9200d59666e8851c66), [bc7e02b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bc7e02bd1214ed20e5c5eccfe416a1ed07db7542), [0aee4be](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0aee4be0be8a8efe379ea249b47b6ca754702d21), [9fdb4ff](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9fdb4ff704487d4178d6ad5470e5440c056ebd55), [15155f3](https://github.com/complexdatacollective/network-canvas-monorepo/commit/15155f30295aadbf41691556a7251685b392ee52), [4de3f45](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4de3f45c1ecc06799211c41c1d72cee8fce7aa10), [7d8e136](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7d8e13644eaf7da31b7c2192c4faad0b7104bc10), [8b35658](https://github.com/complexdatacollective/network-canvas-monorepo/commit/8b35658a427674b37ae8fada8c4f38f6b0689b16), [8884dec](https://github.com/complexdatacollective/network-canvas-monorepo/commit/8884dec06e921f61be7ea36b5c1c81384c302d82), [716e3d7](https://github.com/complexdatacollective/network-canvas-monorepo/commit/716e3d75854022d1becf9d207eb2b159ead8185a), [dfcee00](https://github.com/complexdatacollective/network-canvas-monorepo/commit/dfcee00beb5a93d6e8ef0bea602d266091c6c5d7), [24c3716](https://github.com/complexdatacollective/network-canvas-monorepo/commit/24c371606fc81b91db9ebfe0481d08073714a73c), [5669fa1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5669fa125753a8159779edf013fa4aeb20a75db0), [c210bce](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c210bcea0f237d5e98e71921f297fb5411540f30), [9c1aeff](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9c1aeff40eca424c3ed29d3f98ff6b6b4e1a4c74), [7002c7c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7002c7c68cda62a061bc2d66869b4830a727b7e2), [e749c06](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e749c06db7d8ee60d34a06d232ebbe33b4a38ba0), [ed8fef3](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ed8fef34d368c0db913e7db78077a701bbb23144), [c8dfb28](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c8dfb284ef838c2aa54496e56d8274ee11332085), [2ff161c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2ff161cd71741a8405cef57ac08aa5b5b8ac9fd0), [e28359f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e28359fa2f44ad1ea8cb9405450c20632feb8120), [2729855](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2729855a94c6a71f68283236ddb3c5810f1b6638), [43ffe6f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/43ffe6f1680658ff475ed51bc924557f282afbd8), [38bbefa](https://github.com/complexdatacollective/network-canvas-monorepo/commit/38bbeface8c200142985951fe5d41bffa3b5aafc), [c058462](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c0584624345133246137fb4effff9920fce288ff), [1432069](https://github.com/complexdatacollective/network-canvas-monorepo/commit/14320697db5c21da818bd474ab18737d7b22d36a), [552956e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/552956e8508851acab50a881777a11f66626c883), [151e511](https://github.com/complexdatacollective/network-canvas-monorepo/commit/151e511823d3cf083db2d2bb8e98c740cb9c657d), [ca97000](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ca97000fb02653324f07343037df9cef94a1e0dd), [7050d25](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7050d258394cefd7e854858d8eb90df2bedba4cd), [bec9b59](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bec9b594e43ae07bd2c72ad476b6f243c0ec7f8f), [729c670](https://github.com/complexdatacollective/network-canvas-monorepo/commit/729c67096aa934d9fcdbf0405a864a978e39556c), [1769104](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1769104cce2773332238e4b941a6b6cae91750f9), [6956edc](https://github.com/complexdatacollective/network-canvas-monorepo/commit/6956edcc582e652c765136a4909fc7244de82de3), [66b2226](https://github.com/complexdatacollective/network-canvas-monorepo/commit/66b2226e4a8865cc003b501cced0cfbf55fb3e4b), [6d1307c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/6d1307c702f02f8c0450fdd6282088de05b9cd73), [7225b5c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7225b5cce7ec60634b21a86342682c0622f0f714), [90ddb32](https://github.com/complexdatacollective/network-canvas-monorepo/commit/90ddb329959d48ba4da0813827a7717b91988459), [0cd3a3e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0cd3a3ebbcadfdfcb19ecd8b595f0bb5f13f4ed8), [21ea84b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/21ea84bb89452b462d15b588375813bf34badf37), [97a6ca1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/97a6ca1a842063bf199a54de00a7fd9c2c5b3eb9), [b42f631](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b42f631494112610a010af7ee328d04a351a3696), [9483e9e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9483e9eff45cf51bf9790c18240e5054ac619c66), [db8a2af](https://github.com/complexdatacollective/network-canvas-monorepo/commit/db8a2afe52bcd4eebf3240b0aab2fee13a33a77a), [362070b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/362070b9ba2b90b22bee9fdf855c17fad46df202), [2408129](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2408129ceb43de2d91a0365e966cffa462afc6d0), [7fa80c2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7fa80c26ae731b2919033c33299eea5f7785695a), [630410b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/630410bedccb59e3ea94d866a3234a98abd3a78c), [1d2b623](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1d2b623e77327a01bd2e1462d288ecab5b82c23d), [0912a1f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0912a1f880c05f1e2c031294423e600a433392c6), [3d1b535](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3d1b53515231bd295897cc82e576622146266c4a), [5dda5bb](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5dda5bb0592cf4f304e3089335396e3d47380b11), [c34db26](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c34db2601b78441316b3d9c9ec8d1b839d92f3db), [277c544](https://github.com/complexdatacollective/network-canvas-monorepo/commit/277c5443c2da871038c8588abb2d0537639702fb), [ef8d925](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ef8d925f2c3ba879daeae365a4b5d16b964b332a), [7d2293b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7d2293b8fe01802c8ffe08bb934a4cf37e93bf38), [df1708b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/df1708b22c70d228605605198fccdd4cf2760445), [e31a3c9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e31a3c97a48d8c10c6b788957c68a5d4073a7512), [ab9a884](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ab9a884c73208b942a19c2e032b079e8b3f6ae98), [3c5d750](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3c5d750182d55e3aa5baa155f8e5364071adaa99), [6cc9d9d](https://github.com/complexdatacollective/network-canvas-monorepo/commit/6cc9d9de66924da47480cbf3405ac84cd16cc367), [f8bf0c3](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f8bf0c3baec102c837f3a50e79ea7ad71e7c62ad), [0e9243e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0e9243e5bd375df66f625ae1c94b62c891def082), [0336cf4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0336cf4696df7e3c6f8bbd4a7416cf87f9a46676), [84bf796](https://github.com/complexdatacollective/network-canvas-monorepo/commit/84bf796ac81ff786744bf9159f5683c87c10b8bb), [624a6f8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/624a6f85d4003d4d84763e08bdbf8f3031cea45c), [a8c2a11](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a8c2a1172919791c2854bada51ab5f7c3d68b35f), [72b189a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/72b189ae35ec66ae2cafb99ff0fe47686c72ace8), [be92228](https://github.com/complexdatacollective/network-canvas-monorepo/commit/be92228a08d3cdbd5059774e187774daf11d2a51), [7d6ebb8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7d6ebb8e761acaefc8c92555b2a7e9520a2a7509), [b7a7d08](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b7a7d0807192f2db652db16af880f7b1444d84c7), [d0118fe](https://github.com/complexdatacollective/network-canvas-monorepo/commit/d0118fe562008020c876dfceec6f31bb6f7e1dde), [92cf293](https://github.com/complexdatacollective/network-canvas-monorepo/commit/92cf293eb8b7d10d3a0d601283e3996f56eab415), [8470005](https://github.com/complexdatacollective/network-canvas-monorepo/commit/84700053a750432593dfe5df51fe1cddaf36f58e), [43acfe0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/43acfe075af1876a75051b288b72fc728a2ee0c4), [08d76d8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/08d76d8da691c536eecbb252b7f1960a79321216), [18f0696](https://github.com/complexdatacollective/network-canvas-monorepo/commit/18f06960be51e4bd2b3395393a99d92196efdafc), [7bc3d43](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7bc3d437143887b29bdafe5d880fa4a251416621), [c68530b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c68530b55e361f0276f08155f7fbef70c3422883), [40ff4e9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/40ff4e93fbd889bddf42d094e2c3a063c5955816), [2e44834](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2e448345e3221e75a5f5d6c445049279bfd2b606), [01189fd](https://github.com/complexdatacollective/network-canvas-monorepo/commit/01189fdde1a68bb8d6e53bf1e855917c39a06b21), [069c9d0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/069c9d0dad52cd17743bbb7e0ac748a9bc113c0b), [3810333](https://github.com/complexdatacollective/network-canvas-monorepo/commit/38103337561800dd4e57f96dff9c589047bd862e), [cad7309](https://github.com/complexdatacollective/network-canvas-monorepo/commit/cad7309fa78cb2609416f1f445fdc4ad8ffcf226), [20cd773](https://github.com/complexdatacollective/network-canvas-monorepo/commit/20cd773b0ef51a9a8bcf4896205216e9a6f68727), [3f3397a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3f3397ae06c56dcc4eac6ab150e922fb6b3882d7), [ad201b2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ad201b20d586082ba4f20d06961177fa74149db6), [7b38b84](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7b38b84c6df8324e1798c2c305142d72cb289c6f), [332df6a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/332df6ae2b31b24b4da8d109c8a221cab6c1e494), [b4bc4c1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b4bc4c1e8e984545ab707101ace9cba9ab8e02d7), [a7ca9c1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a7ca9c137e5031acc3744a8024edb6f23898cfeb))
  - @codaco/interview@12.0.0
  - @codaco/protocol-validation@16.0.0
  - @codaco/protocol-utilities@6.0.0
  - @codaco/app-i18n@0.4.0
  - @codaco/shared-consts@7.0.0
  - @codaco/fresco-ui@9.0.0
  - @codaco/tailwind-config@1.6.0
  - @codaco/network-exporters@5.0.0

## 4.3.3

### Bug fixes

- Older protocols that failed to import with an "Unrecognized key: parameters" error now import. This happened when an attribute's type or input control had been changed in Architect Classic, which left behind settings the new attribute type cannot use. Importing the protocol now removes those settings.

## 4.3.2

### Bug fixes

- Usage statistics now count each interview start and each protocol install once. Before, both were counted twice. The protocol-install event also no longer includes the protocol's file name.

## 4.3.1

### Interview changes

These improvements to the interview are shared with Interviewer and Architect's Preview.

- **Dragging on touch screens.** Dragging people out of a scrolling area now goes the way you'd expect. In the Sociogram's bin you can drag a person straight up or diagonally onto the canvas, and swiping sideways scrolls the bin. In the roster and name generator panels, swiping up and down scrolls and dragging sideways moves a person. To drag along the direction an area scrolls, hold the person still for a moment first.

### Bug fixes

- Building the Docker image no longer stops while uploading error-reporting source maps.

## 4.3.0

### Docker deployments

- **Existing deployments don't need to do anything.** If you already run Fresco with the bundled MinIO storage, keep your current compose file and everything carries on as before. Deployments using external S3 storage or UploadThing are also unaffected.
- **New deployments with bundled storage now use Garage instead of MinIO**, because the MinIO image is no longer published. A new deployment using `docker-compose.prod.yml` needs two values in `.env`, `GARAGE_ACCESS_KEY_ID` and `GARAGE_SECRET_ACCESS_KEY`, and the compose file prints the commands that generate them. Fresco's storage setup step is then filled in for you. Docker Engine 25 and Docker Compose 2.23.1 or later are required. If you ever move an existing deployment to the new compose file, you will need to move your files from the `minio` Docker volume into Garage yourself.

### New features

- **Seven new languages.** Fresco is now available in Brazilian Portuguese, Dutch, French, German, Italian, Simplified Chinese and Traditional Chinese, as well as English and Spanish. Pick one from the language setting, which now has a search box, or let Fresco follow the browser's language. The interview controls participants see are translated too; a protocol's own text stays in the language it was written in. The pages participants see outside the interview, such as the pages for a broken or expired link, the screen-too-small notice and the thank-you page, now appear in their language too, and the thank-you page follows the language chosen in the interview. Fresco downloads only the language in use, and an interview in another language opens without waiting for it.
- **Post-quantum passkeys.** Devices and password managers that support post-quantum passkeys can now register one with Fresco. Existing passkeys keep working.
- **More storage providers.** Uploads now work with S3-compatible services that check upload checksums, including Garage.

### Interview changes

These improvements to the interview are shared with Interviewer and Architect's Preview.

- **Passphrase-protected answers.** For studies that protect answers with a passphrase, protected answers are no longer lost or saved in a way that can't be read back, and participants are told when an answer wasn't saved so they can try again. Once some answers are protected, a passphrase that can't read them is turned away with a message, so a typo can't start protecting new answers with a different passphrase. The passphrase button is now available on phones and portrait screens.
- **Family pedigree.** Complex families now draw correctly, including half-siblings, step-parents, chains of partnerships and children whose parents aren't a couple. A participant's chosen terms are kept when the pedigree is reopened, and the "finalized" notice no longer hides the bottom of a tall pedigree.
- **Network Composer.** Changes in the side panel are saved when the panel closes instead of being lost, and undo and redo now update the panel.
- **Accessibility.** Screen readers name each person by the label on their node wherever the interview mentions them.

### Data safety and privacy

- **Unreadable interviews are never overwritten.** If an interview's saved answers can't be read, Fresco shows the participant an error, refuses to save over it, and stops exports and the interview data API with an error instead of treating it as empty.
- **Unreadable protocols are never treated as empty.** If a protocol's design can't be read, Fresco refuses to start its interviews, and its recruitment links, synthetic data, exports and interview data API report an error.
- **Frozen interviews stay frozen.** A save that was still under way when an interview finished, for example from a second tab, is now declined.
- **Netlify deploy previews no longer migrate the production database.** Previously a preview of a newer version could migrate it and break every interview link. Previews that share production's database settings still connect to that database when visited.
- **Exports.** CSV and GraphML exports mark an answer as ENCRYPTED only when it was actually saved encrypted.
- **Analytics.** Interview analytics no longer include protocol details such as codebook type names or validation messages.

### Bug fixes

- Dashboard actions such as deleting interviews, participants, protocols or API tokens, managing users and passkeys, changing your password, and setting up or turning off two-factor authentication now wait until they're done and show an error if they fail. A refused two-factor code now shows why.
- The sandbox's sign-in page and dashboard keep working, and the demo sign-in details stay visible.
- The dashboard navigation bar no longer causes an error for researchers with reduced motion turned on.
- Fewer false error reports, and clearer ones: a failed page now reports an identifier that can be traced, and a deployment whose error reporting is off is told so.
- The page for a failed interview link no longer mentions onboarding.
- Long ordinal bin labels are no longer cut off.
- Names that couldn't be added on a name generator are no longer cleared.
- Navigation buttons stay on screen on small phones and at larger text sizes.
- Updated third-party libraries.

## 4.2.1

### Patch Changes

- d8a6661: Opening a newly created interview no longer crashes with "Maximum update depth
  exceeded" on a slow connection. The overlay container behind dialogs and
  toasts reacted to being detached while the page was still waiting for the
  interview to download, and that reaction re-rendered the page in a loop until
  React gave up. The interview now waits for its data and opens normally.

## 4.2.0

### Minor Changes

- 8d4585b: Effect 4.

  `@codaco/network-exporters` is built against Effect 4 and no longer bundles or
  depends on Effect itself: `effect` is now a **peer dependency**
  (`^4.0.0-rc.115`). Install it alongside the package, or the package will not
  resolve at runtime. Effect 4 has no stable release yet, so ask for the release
  candidate by tag — `npm install effect@rc`. A plain `effect@^4` matches
  nothing, because a caret range with no prerelease component does not match a
  prerelease. The peer is what guarantees one Effect copy, and so one fiber
  runtime, in an application that also uses Effect directly.

  Two pieces of the package's public surface change shape with the major:

  - The three service tags — `InterviewRepository`, `ProtocolRepository` and
    `Output` — are `Context.Service` classes rather than `Context.Tag` classes.
    Providing them is unchanged (`Layer.succeed(Output, impl)` still works); only
    the declaration form differs, which matters if you were extending or
    re-declaring one.
  - `Fiber.RuntimeFiber` collapsed into `Fiber.Fiber` in Effect 4, so the sink
    handle that `makeZipOutput` carries is typed `Fiber.Fiber<OutputResult,
    OutputError>`.

  Error classes are unchanged: they remain `Data.TaggedError`, so nothing in the
  package's public types pulls in Effect Schema.

  Fresco and Interviewer move to Effect 4 with it, and each picks up a fix to a
  drain that Effect 4 made visible:

  - Fresco's batch export flushes its remaining progress events by ending the
    queue and taking what is buffered. Effect 4's `Queue.takeAll` suspends on an
    open empty queue instead of returning nothing, and an empty queue at that
    point is the ordinary case, so the old line would have hung the export's
    response open indefinitely.
  - Interviewer's export runner now ends its event queue and joins the drain
    fiber before finishing, so every progress event has reached the UI callback
    before the export resolves. Previously the last events were delivered only
    because the pipeline happened to yield to the scheduler between them, and
    were dropped when it did not.

- 4326572: Stop reporting the running Fresco version and process uptime from the unauthenticated `/api/health` endpoint. It still answers liveness probes with the service status, so container healthchecks and load balancers keep working, but an anonymous caller can no longer learn which release an instance runs. Signed-in researchers continue to see the version on the dashboard.
- 3c6cba3: Passkeys now have to verify who you are. Fresco asks every passkey to confirm your identity with a PIN, fingerprint, or face when it is registered and each time you sign in, and refuses a response in which the authenticator skipped that check. A passkey sign-in therefore always proves both that you hold the device and that you are its user, which is the assurance the Accounts & Security documentation describes.

  Previously Fresco requested this verification but accepted responses without it, so a hardware security key with no PIN could sign in on possession of the key alone.

  Deployments that set `REQUIRE_TWO_FACTOR` exempt passkey-mode accounts from that requirement because a passkey already replaces the password; that exemption relied on the passkey proving the user's identity, which was not previously guaranteed. It now is.

  A passkey registered on a security key that cannot verify you no longer signs in, and Fresco tells you what to check rather than reporting a generic failure or, when the browser closes the passkey prompt on its own, saying nothing at all. Sign in with another of your passkeys, or ask another administrator to use **Reset Auth** on your account. If you are already signed in, add a passkey that verifies you from **Settings → User Management** before you sign out. Registering a new passkey on such a key is refused with the same explanation.

- b51743b: Add a `REQUIRE_TWO_FACTOR` environment variable. When it is set to `true`, every account that signs in with a password must set up two-factor authentication immediately after signing in — or, for the first administrator of a new deployment, immediately after the setup wizard — before any dashboard page or signed-in request is served, and cannot turn it off afterwards. An administrator can still reset a locked-out colleague's authentication; that account sets two-factor authentication up again at its next sign-in. It is an environment variable rather than a dashboard setting because every Fresco account is an equal administrator, so anything switchable from the dashboard could be switched off by any of them; the User Management card reports whether it is in force. Accounts that sign in with a passkey are not affected.
- 0587866: Add English, British English, and Spanish throughout Fresco’s researcher interface, with an account language preference that applies immediately and persists across devices. Choose the language from the globe button in the dashboard’s top bar (in the navigation menu on small screens), or in the header of the sign-in and setup screens; the choice made during setup carries over to the new account. If a choice cannot be saved, it stays in use for the visit and the language list offers to try again. Localize server-rendered pages, validation, dialogs, notifications, and structured activity details while preserving existing audit records and research data.

  The selected language also initializes built-in interview controls. Temporary interview-menu choices leave the account preference, protocol-authored text, and stored answers unchanged.

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

### Patch Changes

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

- afef196: The unexported-interview warning in the delete dialogs now stays on screen while the dialog animates away, instead of disappearing a moment before it. Dashboard tables no longer rebuild their action menus on every render.
- d6cb713: Session replay and heatmap capture are now off on every page, not only participant ones. Enabling either on the dashboard could send data neither optional analytics feature was meant to include: heatmaps key their captured data by the full page URL, and the participants and interviews tables put the researcher's search text there as a query parameter; session replay can capture whatever the current page renders, including the TOTP secret on the two-factor setup screen and recovery codes or freshly created API tokens on the settings screen, and the recorder's default masking does not cover plain text or images. Fresco reports only the usage events it emits explicitly.
- c6f88e9: Optional analytics no longer carry interview identifiers. Error reports from the interview sync and finish endpoints, and the "Interview Opened" usage event, previously included the interview id (and, for researchers, the username) in what was sent to the analytics relay. An interview id is the participant's access link, so those properties are replaced with non-identifying context, matching the redaction the browser-side analytics already applied. In the browser, PostHog autocapture, rageclick and dead-click capture are now switched off throughout Fresco, as they already were in Interviewer and Architect, and any element data (such as the text of a clicked button) reaching the send path is dropped: a clicked node's name is a participant's answer, and the dashboard's tables show participant identifiers and labels. Heatmap capture is off throughout Fresco as well, and any `$$heatmap` flush that reaches the send path is dropped. Fresco reports only the usage events it emits explicitly. The security policy is also corrected: TOTP secrets are stored as-is because they must remain readable to verify codes; recovery codes and API tokens are the values stored hashed.
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

- f6565fe: Interview screens now settle in one step where they previously took two. Moving to the next pair in Dyad Census or Tie Strength Census, changing prompt in Categorical Bin, Sociogram or Geospatial, and opening a name generator's edit form no longer render a frame that still carries the previous item's state.

  Place search is more accurate about what it tells a screen reader: a status that has been superseded is no longer read back when a query starts matching again, and a search still in flight when the participant moves on can no longer repopulate the next person's suggestions.

  An encrypted name that could not be decrypted after the passphrase changed now shows the locked indicator instead of the name read earlier under the old passphrase.

- 553d580: Added `@codaco/fresco-ui/hooks/useHasHydrated`, the one implementation of "is this tree past hydration" for the handful of things only a browser can answer. It replaces eight hand-rolled copies across the design system and the apps.

  In Fresco, the anonymous recruitment URL and the passkey option on the sign-in and sign-up forms now appear as soon as the page is interactive, without the extra render pass they used to wait for.

- Updated dependencies ([486ad48](https://github.com/complexdatacollective/network-canvas-monorepo/commit/486ad489e5d6387d418f621a168b0f941021353e), [026b518](https://github.com/complexdatacollective/network-canvas-monorepo/commit/026b5188636452e20570bb4c15e055c8d6d000e8), [043c098](https://github.com/complexdatacollective/network-canvas-monorepo/commit/043c098386556fdc0d28c9ef77f398a712e49bb2), [55bf4da](https://github.com/complexdatacollective/network-canvas-monorepo/commit/55bf4daf8554976b31f8e1400b2c38216ef8a2f2), [91a25de](https://github.com/complexdatacollective/network-canvas-monorepo/commit/91a25ded87f6348e9fc14b5d5b84303f658a0792), [ce5e872](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ce5e87292186a22123dc21411411ffd13aa79992), [2eafe92](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2eafe92060cd4aa1dbcde5c2b79d00d87bba9159), [88f4d4b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/88f4d4bb1d6c0863b6d201f614fcd208efa642da), [0968b01](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0968b014c202284d3c40da0eb71a4f4f13a62d01), [fb1b7ed](https://github.com/complexdatacollective/network-canvas-monorepo/commit/fb1b7ed0986d7b9db0eb7444c2f49c2061376d0d), [8a91585](https://github.com/complexdatacollective/network-canvas-monorepo/commit/8a91585f808df2422377e3cb1ae154bc40ebec13), [e322f90](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e322f9040c9f5f4218ea8d7da1aa286ef4e719e9), [e87f8f5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e87f8f59a9c05eac7219631a4dc002dfed65efcb), [8d4585b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/8d4585b98bb300decdcee502d18a362a947e8a3a), [5a19894](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5a19894e03e1aa5bd176b012a342d20c50398c86), [ca83424](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ca8342421dda342d1722ad838bbbe58837212022), [e4dad7e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e4dad7ef5a96a1f09257483c4f99fccffc0dcaa5), [90b08cd](https://github.com/complexdatacollective/network-canvas-monorepo/commit/90b08cd133b8555408329acdfe1ea00e0a7fff37), [1376c6a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1376c6a817e093ce220c9397492290a0f7d6a57f), [b0fa87a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b0fa87ac6614959484cdb1e4d6457513e9898a56), [64c7891](https://github.com/complexdatacollective/network-canvas-monorepo/commit/64c7891c377b734e8b5f9df2e360884bf4848f4e), [ab25ed6](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ab25ed6be06f2e4f983f2a5c5915e962caed5970), [15c8259](https://github.com/complexdatacollective/network-canvas-monorepo/commit/15c825972e5097cd8d8559d47e5ba4584398edee), [484c9e0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/484c9e0efeac6e55506d56504a79c37e00f9f687), [1abd707](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1abd707d0894dfad3eaf0eb5a79e76ffc3e7932c), [154d2ab](https://github.com/complexdatacollective/network-canvas-monorepo/commit/154d2ab5ad89ce4a5d370d1fb818135ab7fbb62d), [c100092](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c100092b303b1b02afe2876d8dbbc84af06865b2), [65d2583](https://github.com/complexdatacollective/network-canvas-monorepo/commit/65d2583c12a2af634080b466f95793f3cc8032d4), [4749625](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4749625620599802f85560ec1ba54fc7873a2ecc), [57c74ae](https://github.com/complexdatacollective/network-canvas-monorepo/commit/57c74ae5a36b8e5c1d8efd3863cbfeaf412ba1b4), [c358132](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c3581329466d44b3733a09bb459d07a1787486ef), [df21eec](https://github.com/complexdatacollective/network-canvas-monorepo/commit/df21eece0b9a9e6393f694c07374e7d10d66dabc), [c563d9f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c563d9f0815df12f618c06548e1281fec95bb656), [4e808e1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4e808e1172f91fb6d78a3ebc6e0b65dbc2096ad3), [208fcea](https://github.com/complexdatacollective/network-canvas-monorepo/commit/208fceaf736d8354d16046b6e9953b1d598f65a1), [a382c6b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a382c6bfa34cbe04e6e79143526bf2f3215baa59), [3abf9e4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3abf9e4442b6086c5c5937d16212a9bdc8425cab), [45a30fa](https://github.com/complexdatacollective/network-canvas-monorepo/commit/45a30fae119ebf52d31738fa98e61b707d1d4c54), [1dac91b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1dac91b131db3740117aaf7977c9ff9bd697241e), [23dcf99](https://github.com/complexdatacollective/network-canvas-monorepo/commit/23dcf99e80d3e95b9e71543afb2e40842d1527e1), [a13f261](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a13f2610b7834e2fe27ae4e1e8423612b990c304), [c5758a4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c5758a447125e840b91d81e9b2e9ed6acdf1583e), [29b11be](https://github.com/complexdatacollective/network-canvas-monorepo/commit/29b11be8da6cfb65b8c9cce5d6f1d8711889d4f1), [a78b7c2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a78b7c20034648fffcee4202a143481178f8637b), [aa4693a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/aa4693a1e221515381058229d7fbf61d7807dfe3), [bb8e755](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bb8e7550160683d76d359b0d0c7093e6d128b9e2), [693655f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/693655f3d388e7ef91cb0e2324a10bb201a5f96c), [0030df8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0030df8ab94984e8ca6666da03ec0ae02d6bdbf4), [5de44c1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5de44c15c99bc4e778d08c1be23bfd590e877005), [ed91f97](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ed91f9759c0d12bc6940d61800b816a2f482d4dc), [98063fb](https://github.com/complexdatacollective/network-canvas-monorepo/commit/98063fb115deb11852910ca7ef7583d278207f4b), [f6565fe](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f6565fe3f11ddfa004d1ea5d37a7b97401a53db4), [139de02](https://github.com/complexdatacollective/network-canvas-monorepo/commit/139de022e376c743c1944ffad36c4cc994e0716b), [4ea797d](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4ea797d7159622173f7a605cf2ce6cac1884e854), [d7e93c5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/d7e93c571df1fea1a8fc71d8c9d4f6692e2dbe7c), [55f5549](https://github.com/complexdatacollective/network-canvas-monorepo/commit/55f554975bc6731a7f5bc94dde0a7000b64ce2da), [2bea7ee](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2bea7eed99b1f0f5056144a1d6ac30855c36513e), [02ead76](https://github.com/complexdatacollective/network-canvas-monorepo/commit/02ead76454267cb9fcc8e2810eb6189e6d3aabc9), [f84eb32](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f84eb32e7c776a088c412511183baf7e3b635021), [eea0b5a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eea0b5acf7c4b852a57c6b57c5a504a34a7d11c0), [eee19fb](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eee19fb93d4cb57d3c4d256971da78df15730a88), [a5626f5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a5626f51040d092c56417694296bcde8d51faad9), [06ffe9f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/06ffe9f4e0154e34633c9981e94f3c5919acac87), [b2ca402](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b2ca402a852b5527e0455c7ff2949da3be50dccd), [aab7516](https://github.com/complexdatacollective/network-canvas-monorepo/commit/aab75165be13439838568f8d393189f9ceacfe0b), [3ae3a94](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3ae3a9438da400fc357a0c71721d45cd32f3a7ac), [01aaed2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/01aaed2d0bcd7ce203f50952ddd3e4ddeaed143a), [d356513](https://github.com/complexdatacollective/network-canvas-monorepo/commit/d3565138de36477aa2fffe7638105e67d18d2d29), [3f54d21](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3f54d2102e9489ae65cb164466fe71de05901ddd), [553d580](https://github.com/complexdatacollective/network-canvas-monorepo/commit/553d580c548e86730faecd95a18b6bf29868807f), [9d9f310](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9d9f310867e490c073374df20689def7be163f47))
  - @codaco/fresco-ui@7.0.0
  - @codaco/app-i18n@0.2.0
  - @codaco/shared-consts@6.1.0
  - @codaco/interview@9.1.0
  - @codaco/tailwind-config@1.5.0
  - @codaco/protocol-validation@14.0.0
  - @codaco/network-exporters@3.0.0
  - @codaco/protocol-utilities@4.1.0

## 4.1.6

### Patch Changes

- 79cabf8: Fresco can be deployed to Vercel again. Since 4.1.0 every Vercel
  deployment failed during the build with
  `ENOENT: .next/next-server.js.nft.json`. Next.js 16.3 stopped writing that
  file-trace manifest when `output: 'standalone'` is set, and Vercel's build
  adapter needs it to package the app's serverless functions. Fresco sets
  `output: 'standalone'` only for its Docker image, so it is now switched off
  when building on Vercel. Container and Netlify deployments are unaffected.

  The consequence reached further than a failed build. Fresco applies its
  database migrations before the build runs, so an upgrade attempted on Vercel
  migrated the schema and then failed — leaving the previous deployment, still
  serving, reading a database whose shape it no longer understood. A Vercel
  deployment could therefore take itself offline by trying to upgrade, and
  could not be repaired by redeploying the older version.

  Fixed upstream in Next.js 16.4 (vercel/next.js#96646).

## 4.1.5

### Patch Changes

- 83c17e7: Fix "Must be unique" accepting a duplicate value for a number variable. A number typed into an interview form was compared as text against the numbers already stored on the other alters, so an Alter ID that another alter already held passed the check and the duplicate was added. The same mismatch let a "same as" or "different from" rule misjudge a number answered on an earlier stage. Number values are now compared as numbers wherever a rule reads what the network already holds.

## 4.1.4

### Patch Changes

- 019c1c0: Interview pages now send an origin-only `Referer`, so URL-restricted Mapbox tokens work with Fresco.

  Fresco set `Referrer-Policy: no-referrer` on `/interview/*` and `/onboard/*` so that the interview id in those URLs could never reach a third party. That also withheld the site's origin, and Mapbox evaluates a token's URL restrictions from the `Referer` header — so a Geospatial stage backed by a URL-restricted token failed with 403 on every map load, leaving researchers no choice but an unrestricted token. Those routes now use `strict-origin-when-cross-origin`, the policy every other Fresco route already carried: a cross-origin request carries only the scheme and host, an HTTPS→HTTP downgrade carries nothing, and the full URL, interview id included, is sent only to same-origin requests, which already know it. The protection the old policy provided is unchanged; Mapbox can now see the origin it needs.

  Existing deployments must upgrade to this version to benefit. A deployment on an earlier release still sends no `Referer`, so its Mapbox token has to stay unrestricted.

- Updated dependencies ([b387946](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b387946d706f5779779e11956af04e0e4904d474), [b4b21ed](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b4b21ed955b96bc3c59aeefd18f6f7d5bc3ea19a), [05ea832](https://github.com/complexdatacollective/network-canvas-monorepo/commit/05ea8325b4a5c93e2f8081309db45e3ecba948b2), [0666674](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0666674c95a4865227bddc103b131720926ab7c8))
  - @codaco/protocol-validation@13.0.1
  - @codaco/fresco-ui@6.4.0
  - @codaco/tailwind-config@1.4.0

## 4.1.3

### Patch Changes

- 77c3736: Replace the interview text-size choices with an accessible percentage input that supports plus and minus controls, arrow keys, and direct entry.
- Updated dependencies ([080d355](https://github.com/complexdatacollective/network-canvas-monorepo/commit/080d355e7bb30b7d9cf7c8653582a81103b6b8b5), [cead6fc](https://github.com/complexdatacollective/network-canvas-monorepo/commit/cead6fca6412f9322403896d09606bfcb1be1e58), [77c3736](https://github.com/complexdatacollective/network-canvas-monorepo/commit/77c37364a043f12fa38d97ec0004514c77636b88), [0584c69](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0584c69b1b210e533c1a18d7456a7808934989e7))
  - @codaco/fresco-ui@6.3.0
  - @codaco/interview@9.0.1

## 4.1.2

### Patch Changes

- b51ef59: Prevent malicious form field paths from modifying object prototypes while preserving dotted protocol variable identifiers and nested field namespaces.
- 873f3bf: Deployments with analytics disabled no longer contact the Network Canvas analytics service.

  Analytics previously started as soon as a page loaded, before the deployment's own setting had been read. A deployment that set `DISABLE_ANALYTICS` or turned analytics off in its settings still requested configuration, supporting scripts, and feature flags on every page load, and could send one anonymous event before the setting took effect. Each new browser also created a new anonymous person record.

  Analytics is now loaded only once the server confirms it is enabled, so a deployment with it disabled makes no requests at all. If the setting cannot be read, nothing is sent. Errors reported from the server now honour the setting too.

  Turning analytics off part-way through a study now takes effect on the server straight away. A deployment that had analytics enabled kept sending server errors until it was restarted, because those reports came from a handler that was set up once and never consulted the setting again. Every server report is now checked against the setting as it is made, including reports of background failures that happen outside a request.

- e9a6522: Network Composer's Undo and Redo controls now retain keyboard focus at the end of the history during interviews hosted by Fresco.
- 79db1ca: Participant interview links no longer reach the analytics service.

  A participant's interview URL contains the identifier that grants access to that interview, and an onboarding link also carries the participant identifier a researcher assigned. Fresco already refuses to send those URLs as a referrer, but on deployments with analytics enabled they were still attached to analytics events as the current page address, including the link address of anything clicked.

  Those identifiers are now removed before any event is sent, on every route a participant sees. Session replay is also switched off for those pages, both when one is opened directly and when a researcher opens an interview from the dashboard — replay stores the page address in a form the removal cannot reach, and a recording of someone answering interview questions is research data rather than analytics.

- 06bc1e9: The quick add usage hint on name generator stages no longer promises that the box stays open when only one more item can be added during interviews hosted by Fresco.
- e9a6522: Fresco now handles recruitment links, activity reporting, hosted interview dialogs, and operational errors more reliably.

  - Recruitment links for missing protocols show an actionable invalid-link page instead of a generic application error.
  - Activity feed writes complete before a request finishes, and the corresponding analytics reports are flushed reliably. Uninstalling a protocol is now recorded as activity.
  - Analytics receives activity types and counts without researcher or participant descriptions, and server events are correlated with the originating browser session.
  - Interview confirmations restore focus to the control that opened them, while import and synchronization failures use concise messages without internal stack traces.

- 79db1ca: Fresco now reports the failures that stop it starting in a participant's browser.

  A browser that failed to start the application showed its error page but had no way to send the report. Deciding whether a deployment collects analytics needs a database read, so the answer was applied by a component inside the page — and when the page failed to start, that component failed with it. A deployment could be broken for every participant with nothing recorded anywhere.

  The answer now reaches the browser independently of the page rendering, so these failures are reported like any other. Deployments with analytics disabled still make no requests at all.

- e9a6522: Fresco normalizes older stored and synchronized sessions at its read boundaries, so interviews containing nullish entity attributes continue to hydrate and synchronize. Malformed synchronization JSON now returns a controlled bad-request response.
- 3f3e86b: An interview no longer loses its most recent answers when two saves are in flight at once. When a tab is hidden or closed, the browser sends the outstanding answers straight away rather than waiting behind a save already on its way to the server — so the two can overlap, and the server could finish them in either order. If the older one finished last it overwrote the newer answers with the state from a few seconds earlier. Each save now carries its position in the browser's own sequence, and the server keeps a save only when it is newer than the one the interview already holds; one that lost its race is discarded instead of rolling the participant's answers back.
- bd06a52: Interviews no longer lose their most recent answers when the app locks. If the device was put away while the last few answers were still waiting to be saved, and the security timeout had passed by the time the app was reopened, it locked before those answers reached storage and up to a few seconds of responses were discarded. Answers now reach storage within a fraction of a second of being given rather than waiting out a shared timer, and anything still outstanding is written the moment the app is put into the background — before the device can suspend it.

  **Breaking for hosts of `@codaco/interview`.** The engine no longer batches writes on the host's behalf, and no longer holds a change back while an earlier write is unresolved. `onSync` is called for every change as it happens, because only the host knows what one write costs. Hosts wrap their handler in the new `createDebouncedSyncHandler`, which rate-limits ordinary changes to one write per interval carrying the newest state, and never runs two writes at once. A host writing its own handler must not run its writes concurrently: a slow earlier write landing after a newer one would persist stale answers.

  `SyncHandler` gains a third argument. `immediate` marks the writes that must not be deferred — the participant exiting or finishing — and a batching host must stop batching when it sees it. `unloading` additionally marks the ones the document may not survive: it is being hidden or unloaded and may never run script again, so the host should use a transport that outlives it and must not queue the write behind a request that will die with it. Handlers that ignore the argument keep type-checking, so hosts that write eagerly need no change.

  The Shell also now flushes on `visibilitychange` and `pagehide`. A hidden document is not promised any more script, so anything still outstanding goes out while there is still a page to write from — which is what makes an installed PWA safe to put to sleep seconds after an answer.

- c37a801: Applications now derive their protocol schema compatibility from the interview runtime they embed, instead of hard-coding a version number, and each application can upgrade stored protocols when a future schema version ships.

  - `@codaco/interview` exports its supported protocol schema version as `COMPATIBLE_PROTOCOL_SCHEMA_VERSION` (from `@codaco/interview/protocol-schema-version`). Fresco and Interviewer read it for import limits, stored-data migration, and interview payloads; Architect derives its own compatibility from `@codaco/protocol-validation` directly.
  - Interviewer checks stored protocols at launch. A protocol saved under an older schema version is migrated, re-identified under its new content hash, and its interview sessions and media follow it in a single transaction, with a notification when this happens. A protocol that cannot be migrated is left untouched, with a message directing you to repair it in Architect.
  - Architect upgrades a library protocol automatically when you open it, with a notification, leaving the protocol untouched if the upgrade cannot complete. Protocols made with a newer version of Architect are refused with an explanation instead of opening incorrectly.
  - Fresco's deployment migration targets the runtime's supported version rather than a fixed number, and an interview can no longer start from a protocol stored under a version the runtime does not support — it reports the mismatch instead.

  Nothing changes for existing data today — every stored protocol is already at the current schema version. This machinery exists so a future schema version change cannot orphan interview sessions or mislabel stored protocols.

- 1a5adac: Render edge glyphs in interview network summaries with their configured dark edge colors.
- Updated dependencies ([c599dac](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c599dacf78b18efb7d0c5c5fad4d38644a57e775), [9a34469](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9a3446969d5fcc7a3640d8eb5597f807a4fee810), [e3e7b2c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e3e7b2c9cfbc1758754afc0c3959c50ae6518363), [eec63f8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eec63f8c62bd6cfb030c88e396933c4aab384be9), [3e10128](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3e10128db1d1a1abc56f8293d66bf9f7dd75c722), [b51ef59](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b51ef598343c67c95edd4e165c0bac91a7a82571), [43c7746](https://github.com/complexdatacollective/network-canvas-monorepo/commit/43c774665b781cb5cc71acf8ed8c8ca48838ca64), [eb73319](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eb7331942683e879328530e997e554fb12fef52a), [e08ebbf](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e08ebbf8547c2507f5f2a37f7cbab1169dd392cd), [88d7db0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/88d7db04ea3ba323be2fb18f55f6b11d6274740f), [ae3c616](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ae3c616ed4edc55c294be9097e4ae724b249601e), [e9a6522](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e9a652266ef9ddfa7fc42de1c8123bd7011c52a1), [23d0fab](https://github.com/complexdatacollective/network-canvas-monorepo/commit/23d0fab63d4de8da1ba3574cb151ac1c76580d9a), [59f131c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/59f131c2af206c8b1f668b90edf21fbcb3b0b7b7), [06bc1e9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/06bc1e991df40ab3e115da361cfe0ebfe391bbd8), [bd06a52](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bd06a5256b64b82b2718c15b6d3bc825b4ba95c5), [7ca985f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7ca985fe57ca03dda02a96a6013c5dac55dc0123), [c78135c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c78135cd461d1e482ce248b1eb6337359bafc189), [dcbc7aa](https://github.com/complexdatacollective/network-canvas-monorepo/commit/dcbc7aad21ec995bf3a598eb5b208a681789eb4f), [4ea26a7](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4ea26a74dfab5bc02495bc8fa03c31aa5f987dad), [c37a801](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c37a801a3a0a8e6cc82fce3cfe64d031003af207), [0f20ff5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0f20ff594e3fd9b38f393d3d71e9f7bdcc078955), [4a4a9f4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4a4a9f49d4c449e09e07558a0032d6a3b8015743), [fdb3b56](https://github.com/complexdatacollective/network-canvas-monorepo/commit/fdb3b56440f6cad89a44718d24ff725be3bb5e15), [71baa6c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/71baa6c3c376bc287958e5f06659daa1df617e08), [54650ab](https://github.com/complexdatacollective/network-canvas-monorepo/commit/54650ab4bb357d39db88a46f5c3ab8b82375f647), [469d404](https://github.com/complexdatacollective/network-canvas-monorepo/commit/469d4041bd1c86fbfc92eaf2a368f1689858bbd2), [a9825f4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a9825f4067cc6cddd08b64a76e8d88a4b96ae998), [1391fa8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1391fa879011e988a1e8c250a4c80a96797d5d47), [f03b1e4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f03b1e45f425cf3c97ba2137765073a462ee9c9f))
  - @codaco/interview@9.0.0
  - @codaco/protocol-utilities@4.0.0
  - @codaco/protocol-validation@13.0.0
  - @codaco/fresco-ui@6.1.0
  - @codaco/tailwind-config@1.3.0
  - @codaco/network-exporters@2.0.0
  - @codaco/shared-consts@6.0.0

## 4.1.1

### Patch Changes

- e349137: Update runtime dependencies to resolve security vulnerabilities in analytics sanitization, uploads, and form state handling.
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

## 4.1.0

### Minor Changes

- e84f2d1: Participants can now adjust the interview's text size. The interview navigation
  carries a settings menu with a "Text size" control offering 90%–130% of the
  default size, scaling text, spacing, and touch targets together. The change
  previews live while the menu is open and lasts for the rest of the session. The
  control is fully keyboard operable and announces its state to screen readers.

  This release also picks up the latest Network Canvas interview and interface
  updates:

  - Tablets render the interview at its full text size again. Every viewport
    narrower than 1280px had been rendering below the intended base size, which
    also shrank spacing and touch targets. Editable fields never render below 16px
    now either, so focusing one no longer makes iOS Safari zoom the page.
  - Nodes stay fully visible when moved to the edge of the Sociogram, Narrative,
    and Network Composer canvases, instead of being partially cut off on wide
    displays.
  - A scrolled roster stays where it was after an item is dragged out of it,
    rather than jumping back to the top.
  - Exporting large interviews no longer stalls the progress display, and
    cancelling an export releases the partially built archive immediately.
  - Timestamps in the dashboard's tables render immediately instead of appearing a
    moment after the row, so selecting a row no longer makes them flicker.
  - Unchecked options in dropdown menus no longer show a check indicator.

### Patch Changes

- 215e2ef: Exported interview data now identifies each case by the participant's
  identifier rather than their label. A label is optional and need not be unique,
  so any study using labels was exporting cases under a name that could repeat
  between participants and did not match the identifier used by recruitment links
  and the participants table.

  Clearing a participant's label now removes it. The edit appeared to succeed
  while the old label was silently kept.

  Editing a participant's identifier now refreshes the interviews table, which
  previously kept showing the old identifier until something else changed.

- Updated dependencies [3c8fe35]
- Updated dependencies [fa88ae4]
- Updated dependencies [2325d34]
  - @codaco/protocol-utilities@3.2.0
  - @codaco/fresco-ui@5.1.0
  - @codaco/interview@7.1.1
  - @codaco/shared-consts@5.6.1
