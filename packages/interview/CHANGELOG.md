# @codaco/interview

## 12.0.0

### Major Changes

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
- e28359f: Leaving or finishing an interview now waits until the latest answers have been
  saved. If saving them fails (for example, because the connection dropped), the
  interview stays open and the confirmation explains that the answers could not
  be saved, so the participant can try again. Previously the interview closed or
  finished anyway, and the answers given since the last save could be lost.
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

- Updated dependencies ([0aee4be](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0aee4be0be8a8efe379ea249b47b6ca754702d21), [9fdb4ff](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9fdb4ff704487d4178d6ad5470e5440c056ebd55), [15155f3](https://github.com/complexdatacollective/network-canvas-monorepo/commit/15155f30295aadbf41691556a7251685b392ee52), [4de3f45](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4de3f45c1ecc06799211c41c1d72cee8fce7aa10), [7d8e136](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7d8e13644eaf7da31b7c2192c4faad0b7104bc10), [8b35658](https://github.com/complexdatacollective/network-canvas-monorepo/commit/8b35658a427674b37ae8fada8c4f38f6b0689b16), [8884dec](https://github.com/complexdatacollective/network-canvas-monorepo/commit/8884dec06e921f61be7ea36b5c1c81384c302d82), [716e3d7](https://github.com/complexdatacollective/network-canvas-monorepo/commit/716e3d75854022d1becf9d207eb2b159ead8185a), [dfcee00](https://github.com/complexdatacollective/network-canvas-monorepo/commit/dfcee00beb5a93d6e8ef0bea602d266091c6c5d7), [5669fa1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5669fa125753a8159779edf013fa4aeb20a75db0), [c210bce](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c210bcea0f237d5e98e71921f297fb5411540f30), [9c1aeff](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9c1aeff40eca424c3ed29d3f98ff6b6b4e1a4c74), [7002c7c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7002c7c68cda62a061bc2d66869b4830a727b7e2), [e749c06](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e749c06db7d8ee60d34a06d232ebbe33b4a38ba0), [2ff161c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2ff161cd71741a8405cef57ac08aa5b5b8ac9fd0), [2729855](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2729855a94c6a71f68283236ddb3c5810f1b6638), [43ffe6f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/43ffe6f1680658ff475ed51bc924557f282afbd8), [38bbefa](https://github.com/complexdatacollective/network-canvas-monorepo/commit/38bbeface8c200142985951fe5d41bffa3b5aafc), [c058462](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c0584624345133246137fb4effff9920fce288ff), [1432069](https://github.com/complexdatacollective/network-canvas-monorepo/commit/14320697db5c21da818bd474ab18737d7b22d36a), [552956e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/552956e8508851acab50a881777a11f66626c883), [151e511](https://github.com/complexdatacollective/network-canvas-monorepo/commit/151e511823d3cf083db2d2bb8e98c740cb9c657d), [ca97000](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ca97000fb02653324f07343037df9cef94a1e0dd), [7050d25](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7050d258394cefd7e854858d8eb90df2bedba4cd), [bec9b59](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bec9b594e43ae07bd2c72ad476b6f243c0ec7f8f), [729c670](https://github.com/complexdatacollective/network-canvas-monorepo/commit/729c67096aa934d9fcdbf0405a864a978e39556c), [1769104](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1769104cce2773332238e4b941a6b6cae91750f9), [6956edc](https://github.com/complexdatacollective/network-canvas-monorepo/commit/6956edcc582e652c765136a4909fc7244de82de3), [66b2226](https://github.com/complexdatacollective/network-canvas-monorepo/commit/66b2226e4a8865cc003b501cced0cfbf55fb3e4b), [6d1307c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/6d1307c702f02f8c0450fdd6282088de05b9cd73), [7225b5c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7225b5cce7ec60634b21a86342682c0622f0f714), [90ddb32](https://github.com/complexdatacollective/network-canvas-monorepo/commit/90ddb329959d48ba4da0813827a7717b91988459), [0cd3a3e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0cd3a3ebbcadfdfcb19ecd8b595f0bb5f13f4ed8), [21ea84b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/21ea84bb89452b462d15b588375813bf34badf37), [b42f631](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b42f631494112610a010af7ee328d04a351a3696), [9483e9e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9483e9eff45cf51bf9790c18240e5054ac619c66), [db8a2af](https://github.com/complexdatacollective/network-canvas-monorepo/commit/db8a2afe52bcd4eebf3240b0aab2fee13a33a77a), [362070b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/362070b9ba2b90b22bee9fdf855c17fad46df202), [2408129](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2408129ceb43de2d91a0365e966cffa462afc6d0), [7fa80c2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7fa80c26ae731b2919033c33299eea5f7785695a), [630410b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/630410bedccb59e3ea94d866a3234a98abd3a78c), [1d2b623](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1d2b623e77327a01bd2e1462d288ecab5b82c23d), [5dda5bb](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5dda5bb0592cf4f304e3089335396e3d47380b11), [c34db26](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c34db2601b78441316b3d9c9ec8d1b839d92f3db), [e31a3c9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e31a3c97a48d8c10c6b788957c68a5d4073a7512), [ab9a884](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ab9a884c73208b942a19c2e032b079e8b3f6ae98), [f8bf0c3](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f8bf0c3baec102c837f3a50e79ea7ad71e7c62ad), [0e9243e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0e9243e5bd375df66f625ae1c94b62c891def082), [0336cf4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0336cf4696df7e3c6f8bbd4a7416cf87f9a46676), [6cc9d9d](https://github.com/complexdatacollective/network-canvas-monorepo/commit/6cc9d9de66924da47480cbf3405ac84cd16cc367), [72b189a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/72b189ae35ec66ae2cafb99ff0fe47686c72ace8), [92cf293](https://github.com/complexdatacollective/network-canvas-monorepo/commit/92cf293eb8b7d10d3a0d601283e3996f56eab415), [8470005](https://github.com/complexdatacollective/network-canvas-monorepo/commit/84700053a750432593dfe5df51fe1cddaf36f58e), [43acfe0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/43acfe075af1876a75051b288b72fc728a2ee0c4), [08d76d8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/08d76d8da691c536eecbb252b7f1960a79321216), [18f0696](https://github.com/complexdatacollective/network-canvas-monorepo/commit/18f06960be51e4bd2b3395393a99d92196efdafc), [7bc3d43](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7bc3d437143887b29bdafe5d880fa4a251416621), [c68530b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c68530b55e361f0276f08155f7fbef70c3422883), [40ff4e9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/40ff4e93fbd889bddf42d094e2c3a063c5955816), [2e44834](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2e448345e3221e75a5f5d6c445049279bfd2b606), [01189fd](https://github.com/complexdatacollective/network-canvas-monorepo/commit/01189fdde1a68bb8d6e53bf1e855917c39a06b21), [069c9d0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/069c9d0dad52cd17743bbb7e0ac748a9bc113c0b), [3810333](https://github.com/complexdatacollective/network-canvas-monorepo/commit/38103337561800dd4e57f96dff9c589047bd862e), [cad7309](https://github.com/complexdatacollective/network-canvas-monorepo/commit/cad7309fa78cb2609416f1f445fdc4ad8ffcf226), [20cd773](https://github.com/complexdatacollective/network-canvas-monorepo/commit/20cd773b0ef51a9a8bcf4896205216e9a6f68727), [ad201b2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ad201b20d586082ba4f20d06961177fa74149db6), [7b38b84](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7b38b84c6df8324e1798c2c305142d72cb289c6f), [332df6a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/332df6ae2b31b24b4da8d109c8a221cab6c1e494), [b4bc4c1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b4bc4c1e8e984545ab707101ace9cba9ab8e02d7), [a7ca9c1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a7ca9c137e5031acc3744a8024edb6f23898cfeb))
  - @codaco/protocol-validation@16.0.0
  - @codaco/app-i18n@0.4.0
  - @codaco/shared-consts@7.0.0
  - @codaco/fresco-ui@9.0.0
  - @codaco/network-query@1.3.0

## 11.0.0

### Major Changes

- 1b93601: The interview's usability analytics events are now declared as Effect Schemas in a catalogue exported from `@codaco/interview/analytics-events`: each event name with the exact type of every property it carries (stage and interface codes, indices, counts, durations, booleans and session pseudonyms), the properties every event carries, and the properties of each exception the interview reports. A host can decode what it receives against the same definitions.

  Breaking changes: the function `useTrack()` returns is now typed by the catalogue, so it accepts only catalogued event names with their declared properties, and a host-specific event no longer compiles. `effect` 4 is now a peer dependency of `@codaco/interview`.

  Stage and force-simulation durations are now never negative, and never above 366 days, when the device clock changes while they are measured. The events are otherwise unchanged.

## 10.0.0

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
- 96405a2: `@codaco/interview/protocol-payload` exports `currentProtocolToPayload` on its own. A host whose server code runs directly under Node, without a bundler, can import the converter from it without loading the rest of the interview contract.
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
- b8405ea: `@codaco/interview/contract` now exports `currentProtocolToPayload`, which turns a validated protocol into the payload the interview runtime receives. The caller supplies the payload's `id` and `importedAt`, so a host can give the same protocol the same identity every time it loads it.

  Architect's preview uses it, so preview assets now carry their display name and source filename the same way they do in Interviewer. An audio or video item with no description is announced by its display name instead of its filename.

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

- 263c5ef: Screen readers now name each person by the label their node shows, wherever
  the interview names them.

  - Dragging a person with the keyboard, from the Sociogram's drawer or within a
    list such as a bin, a dyad census or a name generator, announces them by
    their label. Before, a drawer drag announced "Node" unless the protocol's
    name variable was itself called `name`, and a list drag announced "Item"
    followed by an internal id.
  - Returning a person from the Sociogram to the drawer names them when their
    name is protected by a passphrase and has been unlocked. Before, the
    announcement left the name out.
  - In the narrative pedigree, a person the view cannot relate to the
    participant shows their own label, and is named and announced by it, rather
    than by an internal id.
  - Typing in a list of people finds a protected name once it is unlocked, and
    never finds anyone by an internal id.
  - While a protected name is still being unlocked, the person shows the lock
    rather than "Node".

  Where a name is protected, the announcement says what the node shows: the lock
  until the name is unlocked, and the warning sign when it cannot be read.

- c7aa307: Dialogs no longer close as if nothing happened while the work they started
  carries on. Before, cancelling or dismissing one of these dialogs mid-way told
  you the action had been called off, but it still completed behind the dialog,
  and the page could then update as though it had not.

  While the work runs, Cancel is disabled, the close button is hidden, and
  Escape and clicks outside the dialog are ignored. If the work fails, the
  dialog shows why and can be left or retried.

  - **Architect:** deleting an entity type or a variable from the codebook.
  - **Fresco:** removing a passkey; deleting, adding and resetting the
    authentication of users; changing your password; switching between password
    and passkey sign-in; turning off two-factor authentication and regenerating
    recovery codes; setting up two-factor authentication; deleting interviews,
    participants, protocols and API tokens; creating an API token; adding or
    editing a participant; resetting the app; and saving an UploadThing token.
    A refused two-factor code or action now shows its reason on the form.
  - **Interviewer:** revoking the device lock or resetting the device; deleting
    synthetic sessions; unlocking with the recovery passphrase; and setting up
    a PIN, passphrase or biometric unlock in the setup wizard.
  - **Interviews:** the finish confirmation cannot be cancelled once the
    interview has started finishing, because the finish completes regardless.
    The exit confirmation can still be cancelled while it waits.

- 6dc47ba: When a participant returns to a family pedigree they have already finalized,
  the "Your family pedigree has been finalized" notice and its reset button now
  sit below the pedigree instead of on top of it. Previously, a pedigree tall
  enough to reach the bottom of the screen had its youngest generation hidden
  behind the notice; now the pedigree scrolls and every person stays visible.
- ad9d1df: Interview analytics now follow their design in three places. `interview_started` is no longer lost when the analytics client arrives after the interview first renders, which happened on every host: stage navigation is recorded from the moment a client is available. `interview_finished` is reported once the host has finished the interview, instead of when the finish screen is reached, so a cancelled or refused finish no longer counts as a completed interview. `form_validation_failed` no longer carries the rendered validation messages, which can contain protocol-authored text; each invalid field is reported by its position and input type only.
- 0313691: Interview analytics no longer send codebook type keys, which a protocol author
  chooses and can make readable. `node_added`, `edge_created`, `node_binned` and
  `node_rebinned` now report the type's position in the codebook
  (`node_type_index`, `edge_type_index`) in place of `node_type` and `edge_type`.
- 4e6916e: The interview `Shell` accepts any posthog-js client that provides `capture`, `captureException` and `register`, rather than only the `PostHog` class of the default `posthog-js` entrypoint, so a host built on another posthog-js build (such as `posthog-js/dist/module.no-external`) can pass its client without a cast. The runtime's own instance, used when a host passes no client, now loads that no-external build as well: it carries no remote script loader, so it works under a host's `script-src 'self'` policy.
- 56e16d0: Update third-party dependencies to their latest minor and patch releases, including Base UI 1.8, React Aria Components 1.21, Tiptap 3.31.4, Mapbox GL 3.32, Motion 13.4, Lucide 1.49, the Inclusive Sans and Nunito variable fonts 5.3, PostHog, Prisma 7.10 and Electron 43.7.
- a6c5e2b: A change made in the Network Composer's side panel is no longer lost when the
  panel closes. Leaving the stage, moving to another person or relationship,
  tapping the background, closing the side panel or choosing another tool first
  saves a change that has not been saved yet. If the change cannot be saved,
  for example because an answer is not valid or the passphrase cannot protect
  it, the participant is asked before it is discarded and can keep it to go on
  editing. Before, a change made just before the panel closed, or one that
  could not be saved, was lost without a word. Deleting the person or
  relationship removes their unsaved changes with them, without asking.

  Undoing or redoing a change while the side panel is open now shows the
  restored answers in the panel. Before, the panel went on showing the answers
  as they were before the undo, and changing any answer in it saved them again.
  An answer the participant had changed but not yet saved when the undo or redo
  changed it stays as they typed it, and is not saved over what the undo or redo
  restored. It is saved once they change that answer again, and closing the
  panel asks before discarding it.

  One undo now reverts every answer in a run of side-panel edits to the same
  person or relationship. Before, it put back only the answers the first edit
  of the run changed, so an answer first given in a later edit stayed. Changes
  in the Network Composer, undo and redo are now made in the order they are
  asked for. An undo or redo pressed while a change is still being saved applies
  after that change instead of before it, and deleting a person while one of
  their answers is being saved no longer loses that answer when the deletion is
  undone.

- fb4b061: Ordinal bin headings now have room for four lines of their smallest text.

  A long option label that could not be hyphenated, such as a whole sentence on
  a device whose browser has no hyphenation dictionary for the interview
  language, previously needed a fourth line that the heading did not have, so
  the end of the label was cut off. The heading is now sized to hold that
  fourth line.

- 7e225bf: Participants can now enter a passphrase when the interview's navigation runs
  along the bottom of the screen, as it does on phones and other portrait
  screens. Before this fix, the passphrase button only appeared in the side
  navigation, so on a portrait screen a participant in an interview with
  encrypted names could not add people on stages that needed the passphrase. The
  button now sits next to the settings button in the bottom bar and can be
  reached with the keyboard. Screen readers announce why the passphrase is
  needed, once, and the explanation that appears beside the button stays on
  screen on narrow phones.

  The navigation buttons also stay on screen on small phones at every text size.
  Before, a larger text size could push the forward button past the edge of the
  screen, and on a small phone held sideways the side navigation could lose it
  even at the default size. When space is short the buttons now shrink together,
  down to a comfortable size for a finger to tap.

- 5dd537e: The family pedigree no longer fails to draw when a child's parents include one of their own descendants, such as a daughter who carries her mother's baby or a son who donates to his mother and her partner, or when two sets of parents cross one another's lines of descent. Every child is now drawn below each of its parents, including a single parent's children when that parent is moved down a row to sit beside a partner.
- 7d7b84a: Family pedigrees now preserve a participant's chosen terminology when reopened. Narrative pedigrees also use the source pedigree's terminology for family labels, including fixed mother/father framing.
- 6a88e57: The family pedigree no longer draws a half-sibling as a full sibling. A child
  of one parent alone was grouped with that parent's children by a partner, and
  so hung from the couple's line. They now hang from their parent alone.
- 968624e: The family pedigree keeps every couple side by side when partnerships form a
  chain — someone between a former and a current partner, whose current partner
  also has a former partner. Previously one couple was split apart, its
  partnership line was drawn over the top of the pedigree, and its children hung
  from another couple's line.

  A child with more than two parents now descends from the couple who are most
  strongly their parents: their biological or adoptive parents ahead of a couple
  that includes a step-parent. The step-parent is joined to the child by a dashed
  line, rather than the child being placed between both couples.

  When someone has more partners than can sit beside them, the children of a
  couple that had to be drawn apart hang from their own sibling bar, which each
  parent joins directly, and twins among them keep their twin mark. Their line
  of descent used to come from the neighbouring partnership, naming a parent the
  children do not have. A direct line keeps the parent's own relationship, so an
  adoptive parent's line is recorded as adoptive.

  Someone partnered with their own grandchild, or partnerships that would need a
  generation to sit both level with and above another, no longer pull people out
  of their generations. Each child stays below its parents, and a partnership
  that cannot be drawn on one row is drawn between the two rows' partners,
  clear of anyone between them, instead of being left out.

  A child whose parents are not a couple, such as a biological parent and a
  step-parent who are not partners, is now joined to each parent directly.
  Previously it was drawn with no parent lines at all, or with a line from only
  one of them.

- 3d0a7d1: Interviews that protect some answers with a passphrase now keep those answers
  safe and readable. These changes apply only to studies that turn on encrypted
  answers; other interviews work as before.

  - A passphrase is now checked when it is entered. If it does not match the one
    used earlier in the interview, a message under the field says so and the
    participant can try again. Before, a mistyped passphrase was accepted and
    could protect new answers that could then never be read alongside the
    earlier ones. The passphrase box in the navigation also hides what is typed.
    A passphrase box that opens over the interview is emptied as soon as it
    closes, even if it is opened again straight away.
  - Entering the passphrase already in use again makes the interview try again
    to read the protected answers it could not read. If they still cannot be
    read, the passphrase is asked for again, so a different one can be entered.
    Before, the request for the passphrase went away and those answers stayed
    unreadable.
  - Protected answers stay locked when an interview is resumed, until the
    passphrase is entered again. Names that had been unlocked no longer stay
    visible after the passphrase is replaced with one that cannot read them,
    including in the Family Pedigree.
  - Stages no longer take protected answers they cannot save. Until a working
    passphrase is entered, the name generators, the roster, forms, the category
    "other" question and the map ask for the passphrase instead.
  - When a save is refused, the answers just typed stay on screen with a message
    that they were not saved, so the participant can enter the passphrase and
    try again. Before, they could disappear without a word. The form for adding
    or editing a person, the category "other" question and the Family Pedigree's
    questions about a relative offer the passphrase inside the form whenever
    saving can need it: to protect an answer, or to check an answer against a
    protected one. The answers can then be saved without closing the form.
  - A save is refused if the passphrase is replaced, or found not to work, while
    the save is under way. Before, the answer was still saved with the earlier
    passphrase, which the one now in use might not be able to read.
  - A saved location that is protected is shown on the map when the participant
    returns to it, and stops being shown once the passphrase is replaced or
    found not to work. An area picked on the map is highlighted once it is
    saved, so a pick that could not be saved no longer looks chosen.
  - Answers changed one after another in the Network Composer's side panel, and
    locations picked one after another on the map, are saved in the order they
    were made. Before, an earlier answer that took longer to protect could be
    saved last and replace the later one, and an answer put back while an
    earlier one was still being protected could be lost.
  - Leaving a stage, moving to the next or previous question on a stage (or
    to the next person on the map), finishing or closing the interview waits
    for answers still being protected, including answers still waiting for an
    earlier one to be saved and names still being checked, so they are kept
    and the next stage is chosen with them. When one of them cannot be saved,
    the participant stays where they are and the interview is not finished or
    closed, so they see why and can try again. The confirmations to finish and
    to close the interview stay open while they wait. Cancelling the close
    confirmation keeps the interview open; the finish confirmation cannot be
    cancelled once it has started. Before, a location picked or a name added just
    before pressing Next could be lost or kept under the wrong question, and an
    answer still being protected could be left out of the stage that came next
    and of the interview handed back when finishing or closing.
  - Replacing a protected answer with an unprotected one no longer leaves the
    answer unreadable.
  - Saving a form no longer erases a protected answer the form could not show.
    Before, an answer saved without the details needed to read it appeared
    empty, and saving the form after changing any other answer deleted it. Now
    it is kept unless the participant enters a new answer in its place.
  - The passphrase prompt cannot be closed while it checks a passphrase, the
    form for adding or editing a person cannot be closed while it saves, and
    the field for adding a name in the Network Composer or on a name generator
    stays open while it checks and adds a name. Before, any of them could be
    closed and still take effect afterwards, a name that could not be added was
    lost, and pressing Finished again during a save could add the same person
    twice.
  - Browsers and password managers no longer offer to save or fill in the
    passphrase.
  - The category "other" question shows a protected name as it was entered,
    not in its scrambled form.
  - Outside development, the interview no longer shares its state with the
    Redux DevTools browser extension. In development, protected answers and the
    passphrase are hidden from the extension and from the action log.
  - Names added in the Network Composer and the Family Pedigree, and protected
    answers brought in from a side panel on a name generator, were saved without
    protection. They are now protected like every other answer, and these stages
    ask for the passphrase before they show or save them.
  - While names are protected, the summary of the family that the Family
    Pedigree saves as plain text names each relative by their relationship to
    the participant. Before, it held protected names, both as a relative's own
    label and inside another relative's, such as "Alice's Parent".
  - Undoing or redoing a change in the Network Composer keeps protected names
    readable.
  - A family pedigree is saved whole or not at all. If a relative's name cannot
    be saved, nothing is saved, the participant is told why, and they can enter
    the passphrase and save the pedigree again. Choosing to keep editing while
    the pedigree is being saved now saves none of it.
  - The Family Pedigree and Narrative Pedigree stages read only the protected
    answers they show or edit. Before, a relative's other protected answer that
    the passphrase could not read, such as one saved with a different
    passphrase by an earlier version, hid every name and marked the passphrase
    as not working.
  - Questions that compare an answer with other answers, such as a name that
    must not repeat or an answer that must match another one, now compare with
    the protected answers as they were entered. Before, they compared with the
    stored, scrambled form, so a repeated name was accepted. This includes a
    relative's name in the Family Pedigree. Only the protected answers a
    question compares with need to be readable: a question that must match
    another of the same person's answers reads only that person's answers, and
    a name that must not repeat reads only everyone else's. Another protected
    answer that cannot be read no longer stops the question being checked. If
    the answers it compares with cannot be read, the question says so and asks
    for the passphrase instead of accepting the answer. A question that waits
    for those answers to be read compares with them as they are once the wait
    is over, including a person added meanwhile, and reads them with the
    passphrase then in use, the one the answer is saved with.
  - Answers being typed are kept when the passphrase is replaced with one that
    cannot read them. The Network Composer's side panel, the questions asked
    about each person or relationship, and the form for adding or editing a
    person hide those answers and save none of them until the passphrase that
    reads them is back, then show them as they were left. The side panel then
    saves them and removes its message that they were not saved. Before, they
    were lost. Leaving such a question before then warns that its answers have
    not been saved.
  - Going back from the first person or relationship on a stage that asks
    about each one saves the answers entered, or warns that they have not been
    saved, as going forward does. Before, they were lost.

- 254a887: The field for adding a name on a name generator now clears a name only once
  the person has been added, and keeps a name that could not be added, with a
  message above it saying why. Before, the field worked out whether a name had
  been added from the order in which its updates arrived, so a name that was not
  added could be cleared and lost, and a name that was added could stay in the
  field.

  On a roster whose names are protected with a passphrase, a person now leaves
  the roster as soon as they are dropped, rather than once their name has been
  protected. Before, they stayed on the roster for that moment and could be
  dropped again. If they cannot be added, they go back on the roster and a
  message says why.

- Updated dependencies ([5339bf8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5339bf83bd791585b0002381ec2e52792f7e0697), [c5dc35b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c5dc35b889d75c4f21657ce473ef6ec030660e24), [08fd0f7](https://github.com/complexdatacollective/network-canvas-monorepo/commit/08fd0f7dc2c1a7b757b2caf64ae68aacaaf31572), [4d8ce20](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4d8ce20d1a2a173579d4ac76dfa519126e3d9725), [8e9852f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/8e9852f096c250585d805fa72e0a100d1a682093), [e6f137b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e6f137b276214e418748bc027afcad797f817ad2), [ee4ad52](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ee4ad52b14e081d25f883d9d170454932749d5ab), [3d0a7d1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3d0a7d1f0a04bd98a3b8f5c82fbf912e1db9597c), [747ee33](https://github.com/complexdatacollective/network-canvas-monorepo/commit/747ee3366831b85231a17a3a8173404af46c3d3a), [489bf51](https://github.com/complexdatacollective/network-canvas-monorepo/commit/489bf5173aad4d29e79c6a2a29d018223e369031), [bff61d5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bff61d58f17fbb7b021e6591da9575ed4c12cc16), [263c5ef](https://github.com/complexdatacollective/network-canvas-monorepo/commit/263c5ef39a5fb92be91484d41b08ea7dda525fa3), [649f7a3](https://github.com/complexdatacollective/network-canvas-monorepo/commit/649f7a37175c0910a74393ef95c2656c32a73bd4), [b84263e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b84263ec1076dc14e407b4919f5fdbaae45c6883), [62617a9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/62617a9c21d7e6e200adc162417090a522fac1e6), [5b12f3b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5b12f3b977d4244c398301541d978d825f53ea13), [216e8c4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/216e8c4e1cc63357f121d65150851536996ef3af), [f32135f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f32135fd036f07157198728377dfdbeb30dff747), [56e16d0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/56e16d0de03049200559dbf6bf07671689e4d99b), [dfcbc73](https://github.com/complexdatacollective/network-canvas-monorepo/commit/dfcbc7382eedbdbfc83aa06e8141d1e04ffdf4e1), [3093df5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3093df504bae4a945b77a7441aefd04c6abb4a7f), [810604e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/810604e8e3d5ecfd2d45b38619488660dd69f538), [2478df2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2478df260aecc2c9567ce3291a231ea593fcd558), [ac02ce7](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ac02ce740ee27baa163d531d15fbb10b5c3d0c7e), [513d87a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/513d87a73804d2b1dcc96b06e6e138df198bbc77), [73b2af6](https://github.com/complexdatacollective/network-canvas-monorepo/commit/73b2af6e7711638360d58c644f985319ab8f1834), [16b1178](https://github.com/complexdatacollective/network-canvas-monorepo/commit/16b11782aa5f22fb3efbe55f46612d37c5bbb827), [76722bb](https://github.com/complexdatacollective/network-canvas-monorepo/commit/76722bb9d8f3d3e7e5eca94e802f48584ef37e8a), [e5f6a9a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e5f6a9ac0760f4a67ba353996b43327a5d1b0855))
  - @codaco/fresco-ui@8.0.0
  - @codaco/protocol-validation@15.0.0
  - @codaco/app-i18n@0.3.0
  - @codaco/network-query@1.2.6

## 9.1.0

### Minor Changes

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

- Updated dependencies ([486ad48](https://github.com/complexdatacollective/network-canvas-monorepo/commit/486ad489e5d6387d418f621a168b0f941021353e), [026b518](https://github.com/complexdatacollective/network-canvas-monorepo/commit/026b5188636452e20570bb4c15e055c8d6d000e8), [043c098](https://github.com/complexdatacollective/network-canvas-monorepo/commit/043c098386556fdc0d28c9ef77f398a712e49bb2), [55bf4da](https://github.com/complexdatacollective/network-canvas-monorepo/commit/55bf4daf8554976b31f8e1400b2c38216ef8a2f2), [91a25de](https://github.com/complexdatacollective/network-canvas-monorepo/commit/91a25ded87f6348e9fc14b5d5b84303f658a0792), [ce5e872](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ce5e87292186a22123dc21411411ffd13aa79992), [2eafe92](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2eafe92060cd4aa1dbcde5c2b79d00d87bba9159), [88f4d4b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/88f4d4bb1d6c0863b6d201f614fcd208efa642da), [0968b01](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0968b014c202284d3c40da0eb71a4f4f13a62d01), [fb1b7ed](https://github.com/complexdatacollective/network-canvas-monorepo/commit/fb1b7ed0986d7b9db0eb7444c2f49c2061376d0d), [8a91585](https://github.com/complexdatacollective/network-canvas-monorepo/commit/8a91585f808df2422377e3cb1ae154bc40ebec13), [e322f90](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e322f9040c9f5f4218ea8d7da1aa286ef4e719e9), [e87f8f5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e87f8f59a9c05eac7219631a4dc002dfed65efcb), [5a19894](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5a19894e03e1aa5bd176b012a342d20c50398c86), [ca83424](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ca8342421dda342d1722ad838bbbe58837212022), [e4dad7e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e4dad7ef5a96a1f09257483c4f99fccffc0dcaa5), [90b08cd](https://github.com/complexdatacollective/network-canvas-monorepo/commit/90b08cd133b8555408329acdfe1ea00e0a7fff37), [1376c6a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1376c6a817e093ce220c9397492290a0f7d6a57f), [b0fa87a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b0fa87ac6614959484cdb1e4d6457513e9898a56), [64c7891](https://github.com/complexdatacollective/network-canvas-monorepo/commit/64c7891c377b734e8b5f9df2e360884bf4848f4e), [ab25ed6](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ab25ed6be06f2e4f983f2a5c5915e962caed5970), [15c8259](https://github.com/complexdatacollective/network-canvas-monorepo/commit/15c825972e5097cd8d8559d47e5ba4584398edee), [484c9e0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/484c9e0efeac6e55506d56504a79c37e00f9f687), [1abd707](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1abd707d0894dfad3eaf0eb5a79e76ffc3e7932c), [154d2ab](https://github.com/complexdatacollective/network-canvas-monorepo/commit/154d2ab5ad89ce4a5d370d1fb818135ab7fbb62d), [c100092](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c100092b303b1b02afe2876d8dbbc84af06865b2), [65d2583](https://github.com/complexdatacollective/network-canvas-monorepo/commit/65d2583c12a2af634080b466f95793f3cc8032d4), [4749625](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4749625620599802f85560ec1ba54fc7873a2ecc), [57c74ae](https://github.com/complexdatacollective/network-canvas-monorepo/commit/57c74ae5a36b8e5c1d8efd3863cbfeaf412ba1b4), [c358132](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c3581329466d44b3733a09bb459d07a1787486ef), [df21eec](https://github.com/complexdatacollective/network-canvas-monorepo/commit/df21eece0b9a9e6393f694c07374e7d10d66dabc), [c563d9f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c563d9f0815df12f618c06548e1281fec95bb656), [4e808e1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4e808e1172f91fb6d78a3ebc6e0b65dbc2096ad3), [208fcea](https://github.com/complexdatacollective/network-canvas-monorepo/commit/208fceaf736d8354d16046b6e9953b1d598f65a1), [a382c6b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a382c6bfa34cbe04e6e79143526bf2f3215baa59), [3abf9e4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3abf9e4442b6086c5c5937d16212a9bdc8425cab), [45a30fa](https://github.com/complexdatacollective/network-canvas-monorepo/commit/45a30fae119ebf52d31738fa98e61b707d1d4c54), [aa4693a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/aa4693a1e221515381058229d7fbf61d7807dfe3), [bb8e755](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bb8e7550160683d76d359b0d0c7093e6d128b9e2), [693655f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/693655f3d388e7ef91cb0e2324a10bb201a5f96c), [0030df8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0030df8ab94984e8ca6666da03ec0ae02d6bdbf4), [ed91f97](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ed91f9759c0d12bc6940d61800b816a2f482d4dc), [98063fb](https://github.com/complexdatacollective/network-canvas-monorepo/commit/98063fb115deb11852910ca7ef7583d278207f4b), [139de02](https://github.com/complexdatacollective/network-canvas-monorepo/commit/139de022e376c743c1944ffad36c4cc994e0716b), [4ea797d](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4ea797d7159622173f7a605cf2ce6cac1884e854), [d7e93c5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/d7e93c571df1fea1a8fc71d8c9d4f6692e2dbe7c), [55f5549](https://github.com/complexdatacollective/network-canvas-monorepo/commit/55f554975bc6731a7f5bc94dde0a7000b64ce2da), [2bea7ee](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2bea7eed99b1f0f5056144a1d6ac30855c36513e), [02ead76](https://github.com/complexdatacollective/network-canvas-monorepo/commit/02ead76454267cb9fcc8e2810eb6189e6d3aabc9), [f84eb32](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f84eb32e7c776a088c412511183baf7e3b635021), [eea0b5a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eea0b5acf7c4b852a57c6b57c5a504a34a7d11c0), [eee19fb](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eee19fb93d4cb57d3c4d256971da78df15730a88), [a5626f5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a5626f51040d092c56417694296bcde8d51faad9), [06ffe9f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/06ffe9f4e0154e34633c9981e94f3c5919acac87), [aab7516](https://github.com/complexdatacollective/network-canvas-monorepo/commit/aab75165be13439838568f8d393189f9ceacfe0b), [3ae3a94](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3ae3a9438da400fc357a0c71721d45cd32f3a7ac), [01aaed2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/01aaed2d0bcd7ce203f50952ddd3e4ddeaed143a), [d356513](https://github.com/complexdatacollective/network-canvas-monorepo/commit/d3565138de36477aa2fffe7638105e67d18d2d29), [553d580](https://github.com/complexdatacollective/network-canvas-monorepo/commit/553d580c548e86730faecd95a18b6bf29868807f), [9d9f310](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9d9f310867e490c073374df20689def7be163f47))
  - @codaco/fresco-ui@7.0.0
  - @codaco/app-i18n@0.2.0
  - @codaco/protocol-validation@14.0.0
  - @codaco/network-query@1.2.5

## 9.0.1

### Patch Changes

- 77c3736: Replace the interview text-size choices with an accessible percentage input that supports plus and minus controls, arrow keys, and direct entry.

## 9.0.0

### Major Changes

- e9a6522: Interview session updates now remove cleared entity attributes instead of retaining null-valued keys. Legacy session payloads remain readable and are normalized without losing valid empty values such as `false`, `0`, empty text, or empty selections.

  This is a breaking data-shape change for hosts that inspect `SessionPayload` or sync callbacks: attribute absence is now the unset state.

- bd06a52: Interviews no longer lose their most recent answers when the app locks. If the device was put away while the last few answers were still waiting to be saved, and the security timeout had passed by the time the app was reopened, it locked before those answers reached storage and up to a few seconds of responses were discarded. Answers now reach storage within a fraction of a second of being given rather than waiting out a shared timer, and anything still outstanding is written the moment the app is put into the background — before the device can suspend it.

  **Breaking for hosts of `@codaco/interview`.** The engine no longer batches writes on the host's behalf, and no longer holds a change back while an earlier write is unresolved. `onSync` is called for every change as it happens, because only the host knows what one write costs. Hosts wrap their handler in the new `createDebouncedSyncHandler`, which rate-limits ordinary changes to one write per interval carrying the newest state, and never runs two writes at once. A host writing its own handler must not run its writes concurrently: a slow earlier write landing after a newer one would persist stale answers.

  `SyncHandler` gains a third argument. `immediate` marks the writes that must not be deferred — the participant exiting or finishing — and a batching host must stop batching when it sees it. `unloading` additionally marks the ones the document may not survive: it is being hidden or unloaded and may never run script again, so the host should use a transport that outlives it and must not queue the write behind a request that will die with it. Handlers that ignore the argument keep type-checking, so hosts that write eagerly need no change.

  The Shell also now flushes on `visibilitychange` and `pagehide`. A hidden document is not promised any more script, so anything still outstanding goes out while there is still a page to write from — which is what makes an installed PWA safe to put to sleep seconds after an answer.

### Minor Changes

- e9a6522: Interview forms and interfaces now communicate unanswered, loading, error, and completion states more accurately.

  - Required yes/no questions start unselected, required scales no longer announce a value before one is chosen, and blocked submission focuses the first unanswered question.
  - Optional blanks no longer produce unrelated validation errors, comparisons use participant-facing question text, and each unanswered field reports a single useful message.
  - Name Generator rosters and external panels distinguish loading, empty, exhausted, and no-match states. Quick-add controls expose valid accessible names and descriptions.
  - Location search restores focus after selection, announces results and failures, and ignores stale responses.
  - Family Pedigree person editing no longer crashes or discards work, and completeness checks reject missing or duplicate ego records.
  - Dialogs and history toolbars retain keyboard focus, including confirmations presented by an interview host.

- 43c7746: The owner that hands out interview asset URLs is now part of the public contract.

  For anyone embedding the interview engine, `createAssetUrlOwner` is available
  from `@codaco/interview/contract`. It gives a host one live URL per asset
  however many parts of a screen ask for it at once, replaces that URL when a
  newer copy of the asset arrives, and takes every URL back when the host is
  finished with it, so interview data stays decrypted in memory for no longer than
  it is on screen.

- c37a801: Applications now derive their protocol schema compatibility from the interview runtime they embed, instead of hard-coding a version number, and each application can upgrade stored protocols when a future schema version ships.

  - `@codaco/interview` exports its supported protocol schema version as `COMPATIBLE_PROTOCOL_SCHEMA_VERSION` (from `@codaco/interview/protocol-schema-version`). Fresco and Interviewer read it for import limits, stored-data migration, and interview payloads; Architect derives its own compatibility from `@codaco/protocol-validation` directly.
  - Interviewer checks stored protocols at launch. A protocol saved under an older schema version is migrated, re-identified under its new content hash, and its interview sessions and media follow it in a single transaction, with a notification when this happens. A protocol that cannot be migrated is left untouched, with a message directing you to repair it in Architect.
  - Architect upgrades a library protocol automatically when you open it, with a notification, leaving the protocol untouched if the upgrade cannot complete. Protocols made with a newer version of Architect are refused with an explanation instead of opening incorrectly.
  - Fresco's deployment migration targets the runtime's supported version rather than a fixed number, and an interview can no longer start from a protocol stored under a version the runtime does not support — it reports the mismatch instead.

  Nothing changes for existing data today — every stored protocol is already at the current schema version. This machinery exists so a future schema version change cannot orphan interview sessions or mislabel stored protocols.

### Patch Changes

- c599dac: This release improves the reliability, accessibility, and recovery of protocol editing in Architect.

  - Stage edits are now transactional: cancelling restores Codebook changes, incomplete settings remain open with actionable errors, and Information blocks retain their drafts while switching media types.
  - Forms, rule builders, the Codebook, timeline, dialogs, and resource library now provide accurate labels, keyboard operation, focus restoration, and layouts that work on smaller screens. Undo and Redo operate one change at a time without recording no-op edits.
  - A second tab now shows a read-only protocol instead of accepting changes it cannot save. Closing the editing tab restores editing from the saved copy, and deleting a protocol clears its history and releases associated resources.
  - Protocol names, resource cards, variable identifiers, and stage editors are bounded on narrow screens. Duplicate resource filenames are distinguishable without changing the names stored in the protocol.
  - Invalid imports, blocked edits, migration conflicts, preview completion, and deleted protocol routes now explain what happened and provide a safe recovery path.
  - Recent protocols in the library now show their description, and starter templates show their stage, node type, and edge type counts.
  - The CEGRM starter template now uses an available color for its Narrative Pedigree condition. Protocol colors are constrained to typed node, edge, ordinal, or categorical palette references; Narrative Pedigree and Geospatial resolve those references through the active theme. A protocol created from the previous release's CEGRM template will report a validation error on its condition color — open the stage editor and select one of the available colors to fix it. A downloaded protocol file with this problem must be corrected before it can be imported again. Neutral dialog actions remain distinct from white dialog surfaces.

- eec63f8: Use one canonical force-directed automatic layout profile across Narrative, Sociogram, and Network Composer interfaces.
- 3e10128: Keep a category's name visible when the people in it have long names. In the
  Categorise People screen, each category circle summarises who it holds by naming
  the first person in it. A long enough name grew that summary past the circle and
  pushed the category's own name off the top edge, leaving a circle of text with
  nothing saying which category it was.

  The summary now shortens with an ellipsis instead of growing, the count of
  everyone else in the category stays on its own line so it survives the
  shortening, and both the category name and the summary sit inside the circle
  rather than running under its edge. Tapping the category still opens it to show
  everyone in full.

- b51ef59: Prevent malicious form field paths from modifying object prototypes while preserving dotted protocol variable identifiers and nested field namespaces.
- e9a6522: Network Composer's Undo and Redo controls now retain keyboard focus when the corresponding history becomes empty.
- 06bc1e9: The quick add usage hint on name generator stages no longer promises that the box stays open when only one more item can be added.
- 7ca985f: Keep fitted node labels accurate as fluid type changes, make long labels scroll within the available viewport when revealed, and release keyboard press feedback when activation moves focus into an opened form.
- c78135c: Stop offering click affordances for nodes that cannot be clicked. A collection with no selection, a node list with no tap handler, and a name generator stage with no form each handed their items a click handler that did nothing, so nodes showed a pointer cursor and press feedback for a tap that could never have an effect.
- 4ea26a7: Fixed a race that could permanently lose answers added just before exiting an
  interview. Autosaves are debounced, so an answer given moments before exiting
  could still be waiting to save when the interview closed; resuming promptly
  then loaded the session without it, and the next screen change saved that
  stale copy back over the stored interview. The interview runtime now writes
  any pending autosave as the interview closes, and Interviewer waits for
  in-flight session writes before loading a session, so a fast exit-and-resume
  always shows — and keeps — every answer.
- f03b1e4: Names that are too long for a node now shrink to fit instead of being cut off, so most are readable in full at a glance. A name that is still too long at the smallest readable size can be read in full by pressing and holding it, or by moving to it with the keyboard. Holding never moves or selects the person, and letting go leaves everything exactly as it was.

  For developers, the Node component is now the single gesture recognizer for its own pointer sequence: hosts declare `onClick`, `onLongPress`, and `onDragStart`/`onDragMove`/`onDragEnd`, and the node classifies each gesture as exactly one of them and renders every visual and accessibility consequence itself — press animation, hold indicator, grab/grabbing cursor, pointer capture, `aria-grabbed`, `aria-pressed` from `selected`, and a tab stop whenever focusing does something. Canvas hosts implement drag effects through `useCanvasDrag`'s callback API instead of attaching their own pointer listeners.

  Compatibility: the names `onDrag`, `onDragStart`, and `onDragEnd` were already omitted from Node's props before this release (and at runtime were claimed by Motion's own gesture system, so they never received native HTML5 drag events); they now form Node's pointer-gesture drag API. `onClick` handlers written for a plain button remain assignable — the new `details` argument is optional in the type and always supplied at runtime.

- Updated dependencies ([c599dac](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c599dacf78b18efb7d0c5c5fad4d38644a57e775), [e9a6522](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e9a652266ef9ddfa7fc42de1c8123bd7011c52a1), [fdb3b56](https://github.com/complexdatacollective/network-canvas-monorepo/commit/fdb3b56440f6cad89a44718d24ff725be3bb5e15))
  - @codaco/protocol-validation@13.0.0
  - @codaco/shared-consts@6.0.0
  - @codaco/network-query@1.2.4

## 8.0.0

### Patch Changes

- fec9536: Add a Colored Eco-Genetic Relationship Map (CEGRM) template for families living with an inherited condition. It combines a family pedigree with the participant's wider social network, records relationship closeness and contact frequency alongside exchanges of information, practical help, emotional and spiritual support, and closes on a visual map and an inheritance view.

  Treat the Family Pedigree node label as a validated codebook field, apply its rules to every family-member name entry point, and expose those rules beside the label-variable selector in Architect. Keep the iconically rendered ego node outside label and additional family-member form collection, including in synthetic previews. Reduce the default synthetic Sociogram edge density so preview networks remain legible as their node count grows.

  Keep optional unique fields empty without false duplicate errors, scope comparison rules to the active field namespace, and prevent dormant or duplicate pedigree name controls from affecting validation.

- 90e0178: The "current or ex partner?" answer in the family pedigree's Add Person form is now preserved when switching between selecting an existing person and adding a new one.
- e349137: Update runtime dependencies to resolve security vulnerabilities in analytics sanitization, uploads, and form state handling.
- Updated dependencies [52a3fbb]
- Updated dependencies [fec9536]
- Updated dependencies [90e0178]
- Updated dependencies [13e5e99]
- Updated dependencies [673d5f3]
- Updated dependencies [ea06b66]
  - @codaco/fresco-ui@6.0.0

## 7.1.1

### Patch Changes

- 3c8fe35: Generate realistic, source-backed family pedigrees with reproductive scenarios and multi-generational disease lineages, while respecting each stage's collected variables, keeping pedigree membership isolated from other interview stages, correctly rendering shared and multiple unions, widening partnership response columns, and warning participants before discarding onboarding progress.

  Improve pedigree editing and parentage capture by confirming destructive deletions, preserving biological-sex values, allowing current/ex-partner status changes, and recording reproductive roles independently from sex recorded at birth.

- 2325d34: Answers given in the final moments of an interview are no longer lost when a
  participant finishes. Responses are saved on a short delay, so the very last
  answer could still be waiting to be written when the interview was marked as
  complete — and any study that locks an interview once it is finished then
  rejected that late save without warning. The interview now waits for every
  outstanding answer to be saved before it is finished. If that final save fails,
  the participant can still finish rather than being stranded on the interview.

## 7.1.0

### Minor Changes

- 8ff0e2d: Participants can now adjust the interview's text size.

  The Shell accepts a new `allowUserScaling` prop. When a host enables it (as
  Interviewer now does), the interview Navigation shows a settings menu with a
  "Text size" control offering 90%–130% of the default size. The chosen size
  scales the whole interview — text, spacing, and touch targets together, with
  every step of the fluid type scale changing by exactly the chosen percentage —
  takes effect immediately with the menu open for live preview, and lasts for
  the current session. The control is fully keyboard operable and announces its
  state to screen readers. Hosts can persist the choice across remounts with the
  optional `initialTextScale`/`onTextScaleChange` props; Interviewer uses them so
  an idle-lock/unlock cycle no longer resets a participant's chosen size.

  The standalone exit button has moved into the same settings menu as an
  "Exit interview" action. Hosts that provide neither an exit handler nor
  `allowUserScaling` render no settings menu.

### Patch Changes

- ea589ec: Keep a scrolled roster near the dragged item after it is added instead of resetting the source list to the top.
- 48572ed: Keep canvas nodes fully visible at the canvas edge on every screen size. The
  boundary that stops a dragged or auto-laid-out node at the edge of the
  Sociogram, Narrative, and Network Composer canvases now uses the node's real
  rendered size instead of a fixed estimate, so larger nodes on wide displays are
  no longer partially cut off when moved to the edge of the canvas.
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

- 66da138: Keep content clear of the device status bar in the installed app. On iPads and
  other devices with a status bar, the home screen's brand mark, view switcher,
  and settings button — and interview stage content — now start below the system
  status bar instead of sliding underneath the clock and battery indicators,
  while the background still fills the entire screen. The interview navigation
  bar also sits evenly against the bottom edge of the screen in both
  orientations, rather than reserving extra space below its buttons.

## 7.0.2

### Patch Changes

- fde9bb4: Make animation-aware components consistently respect disabled and reduced motion, and advance Dyad Census and Tie Strength Census immediately after committed answers when motion is disabled.

## 7.0.1

### Patch Changes

- 8effa31: `BooleanField` now honours the `negative` flag on a boolean option. Selecting an option marked negative styles its border and indicator in the destructive colour instead of the primary one; unselected options are unchanged. Previously the flag was accepted by the protocol schema and written by Architect, but ignored at render time.

## 7.0.0

### Minor Changes

- b777dc1: The Categorical Bin "other" input and the Name Generator quick-add field now apply the referenced variable's configured validation rules, exactly as form fields do — including context-dependent rules such as `differentFrom` and `unique`. The Network Composer's add-node input applies the quick-add variable's codebook rules in the same way, a behaviour change for existing protocols whose quick-add variable carries validation. Previously these inputs ignored the codebook and enforced only their local requirements. In native v8 protocols, both Categorical Bin "other" and Name Generator quick-add are optional when their referenced variable has no required validation. The v7→v8 migration adds `required: true` to variables referenced by either writer, preserving existing protocols' required responses while retaining their other validation rules. Variables without an explicit input `component` work correctly. After a valid Network Composer node is added, its quick-add field now resets its value and validation state so the fresh blank entry does not announce a required-field error.

  Network Composer also waits for a quick-add node to finish being stored before
  clearing and reopening the input, preventing two rapid submissions from
  bypassing uniqueness validation against the first node.

  The Categorical Bin dialog registers its response under the referenced
  codebook variable ID, so a sibling variable literally named `otherVariable`
  cannot be mistaken for the live response by cross-variable validation.

  Deferred invalid-field focus now remains safe when its form unmounts before
  smooth scrolling finishes.

### Patch Changes

- 59625a8: The defaults a date field falls back on, when a protocol declares no bounds of its own, now live in one place.

  `@codaco/shared-consts` exports `DATE_PICKER_DEFAULT_MIN`,
  `DATE_PICKER_EARLIEST_DATE`, `DATE_PICKER_LATEST_DATE`,
  `RELATIVE_DATE_PICKER_DEFAULT_BEFORE`, and
  `RELATIVE_DATE_PICKER_DEFAULT_AFTER`. `@codaco/fresco-ui` renders its date
  fields from them, `@codaco/interview` derives the bounds a submitted date is
  validated against from them, `@codaco/protocol-validation` models those bounds
  when detecting contradictions, and `@codaco/protocol-utilities` generates
  synthetic dates to fit them. Each package previously kept some local copies and
  tested only those copies, so widening or narrowing a bound in one place could
  leave another package predicting a window that no longer existed. No default
  or limit has changed value, and generated data is unchanged.

  `@codaco/protocol-utilities` additionally exports `todayYmd`, the clock read behind `GenerationConfig.today`'s default.

- 0807c3d: Form analytics now report each field's real input control. `form_opened` and
  `form_validation_failed` read the control from the codebook variable rather
  than from the form field, which never carried one — so every field was
  previously recorded as `unknown`. Event shapes are unchanged.
- 1b48714: Clear the Name Generator quick-add field after successful submissions, including when adding the node refreshes the live validation context.
- a9a5900: `useProtocolForm` now precomputes the RelativeDatePicker submission-time
  min/max window even when a protocol field or variable omits `parameters`
  entirely. The rendered control always applies its default window (before =
  180 days, after = 0, anchor = today) regardless of whether the record is
  absent or empty, but the submission-time validator was previously only
  derived when `parameters` was present — so a keyboard-typed date outside the
  default window could bypass validation and be submitted. Absent and `{}`
  `parameters` now behave identically, matching
  `@codaco/protocol-validation`'s contradiction analyser.
- 1a3fe60: Improve node entry and display across interview interfaces. Synthetic `name`
  variables now use realistic personal names whenever their validation rules
  allow it, long labels wrap and truncate without distorting node shapes, and
  Network Composer quick add retains focus after submitting a node. Shared modal,
  form-field, and theme refinements support the updated Architect editing
  experience.
- efc3a92: A relative date question anchored near either end of the calendar no longer refuses every date it offers.

  A relative date question works out the dates it accepts by counting days forward and back from an anchor. With an anchor late in the calendar that count could pass the year 9999 — an anchor of 9999-12-31 accepting one day after it worked out a latest date of 10000-01-01 — and with an early anchor it could pass year zero, working out 0000-07-05 or, further back, something that was not a date at all. Neither is a date the software recognises, so the check on what a participant entered stopped comparing dates and compared plain text instead, where a five-digit year sorts before every four-digit one. Every date the question could offer was then rejected as too late, including the one the participant had just chosen. Both ends of the window now stop at the first and last dates a date field can hold.

  `@codaco/shared-consts` exports `dateWithinPickerRange`, `DATE_PICKER_EARLIEST_DATE` and `DATE_PICKER_LATEST_DATE`. The field in `@codaco/fresco-ui`, the submission checks in `@codaco/interview` and the synthetic dates drawn by `@codaco/protocol-utilities` all work the window out from that one function, so the three cannot disagree about it. Questions anchored anywhere else are unaffected, and generated data for them is unchanged.

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
- Updated dependencies [a124bc0]
- Updated dependencies [1b4dc6b]
- Updated dependencies [86603b4]
- Updated dependencies [fd78d55]
- Updated dependencies [a33e3cf]
- Updated dependencies [b777dc1]
- Updated dependencies [1a3fe60]
- Updated dependencies [efc3a92]
- Updated dependencies [7cffcc9]
- Updated dependencies [457052e]
  - @codaco/fresco-ui@5.0.0

## 6.0.0

### Minor Changes

- b66b062: The interview Shell now supports a review mode that stops before the finish
  screen, uses review-specific exit messaging, suppresses interview analytics, and
  allows hosts to explain their post-completion editing policy in the finish
  confirmation.

### Patch Changes

- 00e16c0: Refine interview typography scaling and unify the type-scale base.

  The shared Fresco theme now uses a single `0.9rem` base for `--theme-root-size`
  across product surfaces, and exposes a new `--theme-root-size-fluid` token — an
  opt-in `clamp()` ramp for presentation surfaces that want type and spacing to
  grow on wide or scaled-up displays. The participant interview adopts the shared
  `0.9rem` base and scales it with a continuous ramp (reaching ~`1rem` at typical
  screen sizes and up to `1.25rem` on large displays), replacing the previous
  three-step ramp. Dense product UI keeps a constant, compact base.

  Also fixes the scroll-to-bottom "ready" detection in scrolling forms
  (`useScrolledToBottom`): it now measures scroll position directly instead of
  relying on a zero-height sentinel's edge intersection, which some browsers
  (notably Firefox) fail to report when the form is scrolled to the exact bottom —
  so the "ready to continue" cue reliably appears.

- 31d45db: Fix the Previous Step button at the start of an interview: it no longer lights up before there is anywhere to go back to, and pressing it when no earlier screen exists no longer silently breaks the current stage's own step-by-step navigation.
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

- 310a5ae: Improve Network Composer group assignment for multi-person selections with an accessible, scrollable group selector that handles mixed membership and consistently sizes group controls.
- Updated dependencies [9c25292]
- Updated dependencies [c8c4614]
  - @codaco/protocol-validation@12.0.0
  - @codaco/network-query@1.2.3

## 5.0.0

### Major Changes

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

- 1e6a02b: Refine Sociogram canvas spacing, keep image backgrounds full-screen, and improve the node drawer's size and drag-target feedback.
- 34de1fd: Keep the full Sociogram canvas available while repositioning people by removing its outer padding and opening the empty drawer only after a dragged person reaches its highlighted tab.
- 7f0d49e: Name generator panels now respect the screen's maximum number of people.
  Previously the limit only stopped new people being added through the form or
  quick add field, so a participant who had reached the maximum could keep
  dragging people out of a side panel. Panel items can no longer be dragged once
  the maximum is reached, and dragging people back into a panel to remove them
  still works as before.
- 9145682: Node lists now respect reduced-motion preferences when moving between prompts. Previously the outgoing nodes always played a fade-out animation before the next prompt's nodes appeared, even when the participant's system requested reduced motion; the swap is now instant in that case.
- c53110d: Go to the chosen screen when picking one from the navigation bar. Screens that
  have their own internal steps previously ignored the choice — picking a later
  screen from an alter form moved to the next person's form and stayed put.
  Picking a screen now saves the current form if it can, asks before discarding
  changes that cannot be saved, and otherwise moves straight there without
  requiring the form to be completed first.

## 4.1.0

### Minor Changes

- c7e767c: Add image backgrounds to Narrative stages and keep canvas background images fully visible and centred in every layout.

### Patch Changes

- 04f6fe2: Fix the icon on the Name Generator add buttons drifting to the top of the circle when a node type uses a Lucide icon. The quick-add toggle and the create-new-node button now keep their icon vertically centred.
- Updated dependencies [98a31e7]
  - @codaco/network-query@1.2.2

## 4.0.0

### Patch Changes

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

- faa625a: Sociogram prompts with a display-only highlight (a `highlight.variable` with `allowHighlighting` off) render matching nodes highlighted; tapping a node only toggles the highlight attribute when `allowHighlighting` is enabled.
- Updated dependencies [a6d037a]
- Updated dependencies [1172a44]
- Updated dependencies [34d2bfd]
- Updated dependencies [fc7e279]
  - @codaco/fresco-ui@4.1.0
  - @codaco/protocol-validation@11.10.0
  - @codaco/network-query@1.2.1

## 3.0.0

### Minor Changes

- 0e233da: Network Composer stages now render a background image when the stage configures one, matching the Sociogram: the image replaces the concentric-circles background and never intercepts pointer input.
- 7b096c1: Add an optional `navigationClassnames` prop to `Shell`. It accepts per-orientation class strings (`{ vertical?, horizontal? }`) that are merged onto the interview navigation surface, letting a host apply device-specific styling — e.g. safe-area padding for an installed PWA — without the shared component owning it. Omitting the prop leaves the navigation exactly as before, so existing consumers are unaffected.
- 3925154: NarrativePedigree now models mitochondrial donation. The genetics engine infers
  each child's mitochondrial-DNA source from the egg-cytoplasm edge rather than
  assuming it always follows the female parent, so a child conceived with a donor
  egg inherits the donor's mitochondrial line while still inheriting the intended
  parents' nuclear genome. Protocols that record a `gameteRole` on their pedigree
  edges get this automatically; those that don't are unaffected (the engine falls
  back to the previous female-parent rule, so existing data is unchanged).

  Disease-status symbols follow standardized pedigree nomenclature: a solid fill is
  reserved for individuals who are affected, and relatives who are only at risk are
  shown with the standard hatched carrier symbol rather than a filled marker, keeping
  the display consistent with established clinical and research practice.

  The comprehensive example pedigree is rebuilt around a single, realistic,
  ego-centric family in which all six conditions reach the participant's own
  household. The mitochondrial-donation branch (not authorable through the
  participant interface) is shown in a dedicated example, while the default preview
  reflects a participant-reachable pedigree.

- 8954630: Add zoom in, zoom out and reset controls to the NarrativePedigree interface via a floating toolbar.
- 57335b8: Sociogram quality-of-life improvements (#887):

  - Placed nodes can now be removed from the sociogram again: drag a node onto the drawer at the bottom of the screen (which highlights and expands to receive it), or focus a node and press Delete/Backspace. Removals are announced to screen readers.
  - The drawer of unplaced nodes can now be expanded while empty, revealing the drop area.
  - The sociogram's floating prompt panel can be collapsed behind a chevron tab so the prompt text no longer occludes the drop area, and it re-opens automatically when the prompt changes. A grip icon now signals that the panel is draggable (also on the Geospatial stage, where the prompt is the core task and stays visible rather than being collapsible).

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

- 2b12bdc: Boolean fields now lay their options out side by side whenever they fit, wrapping to a stacked layout only when the container is genuinely too narrow for them. This fixes the Dyad Census interface stacking its Yes/No choices vertically even when there was room to show them side by side.
- 37a454c: Ask for confirmation before exiting an interview in progress, and regroup the horizontal navigation bar so previous/next sit together on the right with the progress bar filling the middle.
- ef1c4b4: Fix invalid Tailwind utility classes that silently rendered nothing: the Spinner's
  backface-visibility (now `backface-hidden`), and the encrypted background's 3D
  transform (`transform-3d`) and monospace font (`font-monospace`).
- 08797b5: Fix the Anonymisation stage blocking a valid direct-Next attempt: forward navigation now awaits form validation against the current values instead of reading the render-time validity, which was stale while a field validation was still in flight and forced an extra Next click.
- 486f928: Fix two data-integrity bugs surfaced by the interview e2e suite. The
  `encryptedVariables` experiment is now the single master switch for name
  encryption: `NameGenerator`/`NameGeneratorRoster` no longer write ciphertext
  when the experiment is off, keeping the write path aligned with the
  experiment-gated decrypt path (previously an encrypted variable produced
  undecryptable stored values). `Anonymisation`'s before-next gate now calls
  `form.requestSubmit()` instead of the native `form.submit()`, so validation runs
  and the SPA is not GET-navigated to `/?passphrase=…` — which had ejected the
  participant from the interview whenever they pressed Next on an invalid form.
- c16a1d9: Emit NodeNext-compatible relative module specifiers in generated declaration files so TypeScript consumers can resolve package types without a bundled declaration rollup.
- beb5882: Fixed the quick add name generator closing its input after each name in Safari when the protocol uses encrypted variables and a passphrase has been set. The input now stays open so multiple people can be added in a row, matching the behaviour without encryption.
- 007cee6: Node labels now resolve synchronously on first render whenever the label attribute is not encrypted. Previously every label — encrypted or not — was resolved through an asynchronous effect, which briefly exposed the node type's fallback name to assistive technology (and to name-based queries) each time a node mounted. The asynchronous path is now used only when an anonymisation-encrypted label genuinely needs decryption.
- Updated dependencies [367e702]
- Updated dependencies [4d9658b]
- Updated dependencies [e5fcd5e]
- Updated dependencies [7ca17f5]
- Updated dependencies [83dddd8]
- Updated dependencies [2b12bdc]
- Updated dependencies [e6c58c2]
- Updated dependencies [be60ee0]
- Updated dependencies [ef1c4b4]
- Updated dependencies [2c112ba]
- Updated dependencies [5c269b3]
- Updated dependencies [c6f2ad4]
- Updated dependencies [1d19a1b]
- Updated dependencies [c1cf1fa]
- Updated dependencies [617c1b9]
- Updated dependencies [628c018]
- Updated dependencies [ce9b549]
- Updated dependencies [9b57c1d]
- Updated dependencies [486f928]
- Updated dependencies [e4c3d5f]
- Updated dependencies [9336312]
- Updated dependencies [ef02898]
- Updated dependencies [436e04c]
- Updated dependencies [5e2efc3]
- Updated dependencies [6a3f5db]
- Updated dependencies [c236b20]
- Updated dependencies [807f0d4]
- Updated dependencies [452549c]
- Updated dependencies [fd46cd0]
- Updated dependencies [2872951]
- Updated dependencies [c16a1d9]
- Updated dependencies [3a8689f]
- Updated dependencies [2280a15]
- Updated dependencies [803e4e7]
- Updated dependencies [2100c9c]
- Updated dependencies [5e1d565]
- Updated dependencies [ed95edc]
- Updated dependencies [179952e]
- Updated dependencies [31eacf4]
- Updated dependencies [a37d0a2]
- Updated dependencies [a37d0a2]
- Updated dependencies [bfc4303]
- Updated dependencies [36ba214]
- Updated dependencies [9d71015]
- Updated dependencies [5c269b3]
- Updated dependencies [b467615]
- Updated dependencies [9b925e9]
- Updated dependencies [ebdd094]
  - @codaco/protocol-validation@11.9.0
  - @codaco/fresco-ui@4.0.0
  - @codaco/tailwind-config@1.1.0
  - @codaco/shared-consts@5.5.0
  - @codaco/network-query@1.2.0

## 2.0.1

### Patch Changes

- d9b7f0b: Information interface: video items now honour their configured display size (Small, Medium, or Large) the same way images do, instead of always rendering at full size. Text items continue to render at their natural height so all of their content is visible.
- c56f92d: Bundle the private `@codaco/interface-images` package into the build instead of externalizing it, fixing an uninstallable published package.

  `@codaco/interface-images` is a private, source-only workspace package (raw TSX + generated `.webp` screenshots, `version: 0.0.0`, never published to npm) consumed only by the stage-navigation menu. The Vite `external` predicate treated it like a publishable peer and externalized it, so the published `dist/index.js` carried a bare `import '@codaco/interface-images/…'` and `package.json` listed it as a runtime dependency (`workspace:*`, rewritten to `0.0.0` at publish). Because that version does not exist on npm, `pnpm add @codaco/interview` failed with `ERR_PNPM_FETCH_404` for `@codaco/interface-images`.

  The build now bundles the interface-images source into `dist/index.js` and emits its ~4.5 MB of `.webp` screenshots as separate hashed files under `dist/assets/` (referenced via `new URL('./assets/…', import.meta.url)`, keeping `dist/index.js` small and letting the images load on demand), and the package is reclassified as a `devDependency`, so the published package is self-contained with no dangling runtime dependency. No runtime or type API changes.

  - @codaco/network-query@1.1.2

## 2.0.0

### Minor Changes

- 11e1055: Family Pedigree: capture **consanguineous unions** — partner with an existing relative (e.g. ego with a first cousin) and attribute children to that union — and make the Narrative Pedigree genetics engine consanguinity-correct for the resulting recessive-homozygosity risk.

  - Add-partner now offers an existing-or-new picker (existing candidates exclude only first-degree relatives); choosing an existing person creates a partner edge without duplicating the node (preserving the mating loop). The already-built NSGC double-line / loop rendering is exercised end-to-end.
  - A new, non-lattice `atRiskHomozygous` flag surfaces the autozygosity/compound-het risk for the child of two carrier parents (autosomal recessive) and the daughter of an affected father + carrier mother (X-linked recessive), shown distinctly in the Sticker and Classic notation nodes. Genetic edges are de-duplicated at ingestion so carrier counts stay correct.

  The genetics changes require research-team sign-off before merge (they fold into the existing PR #713 genetics gate).

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

- 9f7c890: Add offline-awareness and a more resilient stage error boundary.

  - New `useOnline` hook (exported from the package root) — a single
    `useSyncExternalStore`-based source of online/offline state.
  - The Geospatial stage now shows a persistent offline indicator when reached
    without a connection, and its error boundary explains the offline case
    (maps can't load) rather than a generic failure.
  - The error-boundary fallback's "Copy Debug Info" button no longer depends on a
    host `Toast.Provider`: it now confirms inline, so a stage crash in a host that
    doesn't mount its own toast provider (e.g. the package e2e host or Architect's
    preview) no longer throws a secondary error inside the fallback.

- a68b606: Add an opt-in `allowStageNavigation` prop to `Shell`. When enabled, clicking the
  interview progress bar expands into a searchable stages menu (with a timeline and
  per-stage cards) for jumping directly to any stage, mirroring the legacy app.
  Jumps run the same `beforeNext` validation as the next/back buttons and ask for
  confirmation before showing a stage that skip logic would otherwise hide. Off by
  default; no change to existing behaviour.

  Per-stage preview thumbnails in the menu are rendered by the package itself from
  `@codaco/interface-images`, so hosts don't supply them.

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

- 473d566: Unified Sociogram and Narrative onto a shared force-directed auto-layout engine.
  The engine measures each node to derive collision spacing (guaranteeing no node
  overlap), adds edge attraction, group cohesion that pulls same-group nodes into
  their convex hulls, and centering. Narrative additionally gains group-aware
  layout and is now fully read-only during the settled interaction.

### Patch Changes

- 7fdfdb9: Fix two layout bugs in name-generator side panels:

  - When two panels are open they now share the rail evenly (~50/50) instead of
    the panel with more content taking almost all the space and leaving its
    sibling a sliver.
  - A collapsed panel now keeps its full title bar visible instead of shrinking to
    nothing and hiding the title.

- 2e775eb: Narrative interface: the behaviours/drawing controls and the preset switcher now use the shared `SegmentedToolbar`, unifying them with the rest of the interview UI (toolbar semantics, roving focus, tooltips, and the interview-theme pressed state).
- Updated dependencies [97b0ef4]
- Updated dependencies [38de563]
- Updated dependencies [5869464]
- Updated dependencies [0f577dd]
- Updated dependencies [8439757]
- Updated dependencies [5b06420]
- Updated dependencies [ebaa737]
- Updated dependencies [617a920]
- Updated dependencies [f551a2e]
- Updated dependencies [79ccead]
- Updated dependencies [65b55f9]
- Updated dependencies [735fb6e]
  - @codaco/fresco-ui@3.0.0
  - @codaco/network-query@1.1.1

## 1.2.0

### Minor Changes

- fb8b47b: Add a server-safe `@codaco/interview/contract` entry point.

  Importing anything from the package root evaluates the React component graph
  (`Shell` and its module-level `createContext` calls), which throws when pulled
  into a server / React Server Component build. The new `@codaco/interview/contract`
  subpath is bundled separately and re-exports only the React-free contract — the
  `createInitialNetwork` and `isValidAssetType` utilities and the public payload /
  handler types — so host servers can import them without evaluating any React
  code.

  `createInitialNetwork` now lives in `src/contract/` alongside `isValidAssetType`
  (a single definition, still re-exported from the package root for existing
  consumers). No runtime behaviour changes for existing imports.

## 1.1.0

### Minor Changes

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

- 096ad2a: Add a `hideNavigation` prop to `Shell` that renders the interview without the navigation rail/bar, used by screenshot-capture stories.
- e692e79: Stop the interview navigation from flipping orientation when a portrait tablet's
  software keyboard resizes the viewport. The automatic aspect-ratio threshold for
  switching the nav between a side rail (`vertical`) and a bottom bar
  (`horizontal`) is now more generous (`5/4` instead of `3/4`), so a keyboard
  opening on an iPad in portrait no longer pushes the aspect ratio past the
  breakpoint and snaps the nav to the side mid-interview.

  Hosts that know their device context can also bypass the automatic detection
  entirely with the new optional `navigationOrientation` prop on `Shell`
  (`'horizontal' | 'vertical'`, exported as the `NavigationOrientation` type).

- 495eff7: Expose participant-facing interview progress through the step-change contract.

  `@codaco/interview` appends a synthetic `FinishSession` stage to every interview, so the host-controlled `currentStep` indexes a list of length `P + 1`. Hosts that wanted to show progress had to re-derive it and independently account for that appended stage, which drifted from what the participant actually saw (complexdatacollective/Fresco#801).

  - `onStepChange` now receives a second argument, `StepChangeMeta` (`{ progress, totalSteps }`), carrying the 0–100 participant-facing progress and the true total step count (including the finish stage). Existing single-argument handlers remain compatible.
  - A new pure helper `getInterviewProgress(stages, currentStep)` computes the same `{ progress, totalSteps }` from a protocol's stages, for hosts that need progress offline (e.g. synthetic data) without knowing about the appended finish stage.

### Patch Changes

- dd13556: Fix interview-runtime schema-conformance bugs found in a release audit:

  - Look up edge attributes against the edge codebook (not the node codebook) in `updateEdge`, so AlterEdgeForm / TieStrengthCensus answers are no longer silently dropped.
  - Stop negating boolean `additionalAttributes` when a node is removed from a NameGenerator prompt; recompute from the prompts the node still belongs to.
  - Scope a TieStrengthCensus prompt's answered-state to its own `edgeVariable` so a shared edge from a sibling prompt doesn't skip data collection.
  - Read census decline metadata at stage index 0, and prune it when a node is deleted.
  - Auto-advance past a skipped entry stage instead of rendering it.
  - Process bucket/bin sort rules exactly once (fixing numeric/date/ordinal ordering), honour CategoricalBin `binSortOrder`, and fix categorical/zero/false sorting.
  - Coerce number answers to their native type at the form boundary; enforce Anonymisation passphrase length.
  - Inject the computed relationship-to-ego on FamilyPedigree finalize, supply a concrete stage subject for pedigree form validators, and stop duplicating pre-existing nodes/edges on finalize.

  Further interview-runtime fixes from the medium/low conformance audit:

  - DyadCensus: scope each prompt's answered-state per prompt so a sibling prompt sharing the same `createEdge` no longer auto-skips data collection on a later prompt. The shared edge is still reflected (the later prompt pre-selects "Yes" from the network), but the participant must still answer it. Edge creation is idempotent so re-selecting "Yes" cannot append a duplicate edge.
  - TieStrengthCensus: replace the `'__none__'` decline sentinel with a collision-free key so an ordinal option whose value is literally `'__none__'` is recorded as a value rather than treated as a decline.
  - OneToManyDyadCensus: backward navigation across a prompt boundary lands on the destination prompt's last focal node instead of the first.
  - NameGeneratorRoster: honour an initial-sort property of `'*'` (data-file order), keep data-file order when no `sortOrder` is set, apply the full multi-key `sortOrder`, and rank ordinal/categorical sortable properties by codebook option order instead of lexicographically.
  - External data: salt each roster row's primary key with its row index so byte-identical rows stay distinct; carry the asset `source` filename through so media MIME types and the CSV-vs-JSON decision use the real extension rather than the display name; render a visible placeholder for an Information item whose asset is missing or unsupported.
  - OrdinalBin: a node whose stored value matches no option is shown as unplaced instead of silently disappearing, and missing-value styling triggers for a string `'-1'`. CategoricalBin: derive drop-target and motion ids from the option index so duplicate option labels no longer collide.
  - FamilyPedigree: filter the override-path seed by the configured node/edge type so foreign-typed nodes/edges no longer leak into the nomination render.
  - Narrative: out-of-codebook convex-hull group values get distinct colours and legend entries instead of colliding with the first option.
  - NameGenerator NodePanel: render loading/error UI for an external-data panel whose asset fails to resolve, instead of a silently blank panel.

- 382b290: Contain Geospatial map initialisation failures instead of crashing the whole
  stage. `mapbox-gl`'s `Map` constructor throws synchronously when the
  environment can't host a map (most commonly "Failed to initialize WebGL" on
  devices or browsers without working WebGL). That throw previously escaped the
  effect and was caught by `StageErrorBoundary`, taking down the entire stage
  with an opaque reconciler stack. The map creation is now wrapped in a
  `try/catch` that captures the real error and renders a contained fallback
  message, so participants can continue. `StageErrorBoundary`'s copyable debug
  info also now leads with the error name and message — Firefox's `Error.stack`
  omits the message, which was silently dropping the most useful detail from
  bug reports.
- 5af36c5: Fix the navigation bar disappearing off-screen when the browser is resized
  smaller while a Geospatial stage is open. The Mapbox canvas participates in
  layout flow (the package doesn't ship Mapbox's stylesheet), so a stale,
  oversized canvas was forcing the stage wider than the viewport. The map now
  resizes with its container via a `ResizeObserver`, the map container clips its
  overflow, and the stage flex item can shrink horizontally (`min-w-0`).
- 818bbe1: Respect the codebook node shape everywhere nodes are rendered: per-alter and per-alter-edge form headers no longer force a circle, the categorical bin "specify other" dialog, the roster drag preview, and the roster drop overlay now resolve the node shape, and the quick-add toggle previews the shape of the node being created.
- cdc8a2f: Fix `ActionButton` icons rendering off-centre (e.g. the rotate/refresh icons): Lucide SVGs carry intrinsic `width`/`height` attributes, so the old `w-auto` sizing left the browser to back-derive the width inconsistently and could produce a non-square icon box. Lucide icons are now given an explicit square size so any icon centres reliably. Improve the visibility of the "missing" bin on the Ordinal Bin interface, which previously blended into the background; it now uses visible neutral surface tokens.
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

- 264431c: Sociogram: when automatic layout is paused, adding or removing an edge no longer restarts the layout. It now stays paused until the user resumes it with the toggle.
- Updated dependencies [dd13556]
- Updated dependencies [8be592d]
  - @codaco/network-query@1.1.0

## 1.0.1

### Patch Changes

- 1a6d441: Move `allNodes`, `allEdges`, and `stageMetadata` selector calls before the
  `variableConfig` object in `FamilyPedigree` so hook call order is consistent
  across renders. Also trims the `getStageIndex` JSDoc to its essential
  invariant.

## 1.0.0

First stable release of `@codaco/interview`, the host-pluggable Network Canvas interview engine. This promotes the `1.0.0-alpha` development series to a stable `1.0.0` with no further functional changes; see the `1.0.0-alpha.*` entries below for the detailed history.

## 1.0.0-alpha.26

### Prerelease Changes

- `FamilyPedigree`: ego is now labelled explicitly (its name, or "You") in candidate and reference lists instead of falling through to "Family Member" — e.g. the add-partner flow no longer asks "Is this person also a parent of Family Member?" when adding a partner to one of ego's parents.
- `FamilyPedigree`: the quick-start no longer emits partner edges for partnership-matrix rows whose endpoints were not materialized as nodes (e.g. stale "additional parent" rows after toggling "other parents" off).
- `FamilyPedigree`: the biological-parents intro derives its SVG roughen-filter ids per instance (via `useId`), avoiding duplicate DOM ids when multiple instances mount.
- `FamilyPedigree`: fix a typo in the incomplete-pedigree dialog copy.

## 1.0.0-alpha.25

### Prerelease Changes

- `FamilyPedigree`: when re-opening the define-parents and add-sibling wizards, a separate gestational carrier (a `surrogate` edge) is no longer mistaken for the egg parent. The egg and sperm parents are identified by their recorded gamete role, and the surrogate is preselected as the gestational carrier with the egg parent marked as not having carried the pregnancy.

## 1.0.0-alpha.24

### Prerelease Changes

- `FamilyPedigree`: grandparents (a parent's own parents) are no longer a hard requirement for finalizing the pedigree, and the checklist no longer prompts for them on parents who are not genetic relatives of the participant.

  Previously the requirement was computed in two places that disagreed and neither matched the genetic model in `computeBioRelatives` (only `biological` and `donor` edges are genetic):

  - The finalize gate (`validatePedigreeCompleteness`) treated every parent except `partner`/`social` as biological, so it demanded grandparents for **adoptive** and **surrogate** parents. An adopted participant was blocked from continuing because the checklist asked for the adoptive parents' own parents — information that carries no genetic signal about the participant.
  - The checklist required grandparents for `biological` and `adoptive` parents while skipping `donor`/`surrogate`, contradicting the gate (a `donor` parent could read as "done" in the checklist and then be blocked by the gate).

  Now:

  - The finalize gate only requires that ego has at least two parents defined (adoptive included, so adopted participants can finalize). The grandparent requirement is gone.
  - The checklist shows an **optional**, non-blocking "Add parents for …" nudge **only** for genetic parents (`biological`/`donor`). Adoptive and surrogate parents are never prompted for grandparents. A genetic parent's ancestry may still be genuinely unknown — anonymous gamete donors being the common case — so it is never forced.

  This aligns with the 3-generation pedigree standard (Bennett et al., 2022), which collects the family history that is _available_ and records unknowns explicitly rather than forcing every ancestor to exist.

- `FamilyPedigree`: confirm each child's egg and sperm parent, instead of assuming the participant and their partner are both genetic parents of every child.

  The quick-start wizard previously asked only "do you have a partner?" and "how many children do you have with this partner?", then recorded a `biological` parent edge from **both** the participant and the partner to **every** child. That silently assumed both were the child's genetic parents — so the data model could not represent donor conception, surrogacy, same-sex couples, or social co-parents created during the quick-start, and the "Add parent" menu offered impossible options (e.g. "biological"/"donor") on a child whose two genetic parents were already known.

  Now:

  - Every child-creation path captures the child's egg parent, sperm parent, and (when different) gestational carrier through one shared `BioTriad` model — the same one the "Add child" wizard already used. Donor and surrogate parents are generated as needed, and the partner is only recorded as a parent of a child when the participant actually selects them as the egg or sperm source.
  - The "Add parent" dialog now counts a node's genetic parents (`biological`/`donor` edges) and, once both genetic slots are filled, offers only non-genetic parent types — removing the impossible options.

  Internally, the per-child parentage logic is unified in a single `buildChildParentage` helper shared by the quick-start and the add-child wizard, and the unreachable "simple add-child" form path was removed.

- `FamilyPedigree`: unnamed family members are now labelled by their relationship to the participant instead of "Unknown person", and an adopted participant's two unnamed biological parents are distinguished as the **Egg Parent** and **Sperm Parent**.

  Candidate and reference lists in the add-sibling, add-child, and add-parent wizards previously showed "Unknown person" for any node without a name — which gave no way to tell two unnamed parents apart (e.g. the egg and sperm parents of an adopted participant when adding a sibling). They now use the relationship labeller, which describes a node relative to the participant ("Egg Parent", "Sperm Parent", "Donor", "Rob's Parent", …).

  To support this, which gamete a biological/donor parent contributed (egg vs sperm) is recorded as an **internal** field on the pedigree edge and persisted in **stage metadata**. It is never written to the interview network as an attribute, and needs no protocol-schema change. The egg/sperm distinction can no longer be set to the same person within a single child's biological parents.

- `FamilyPedigree`: the wizards that pick a parent now offer a topology-aware candidate list. Genetic (egg/sperm) parents are restricted to people who could plausibly be a genetic parent of the new node — the relevant co-parents plus any existing donor (reusable) — so adding a sibling no longer offers the participant, their children, or their grandparents. Social/adoptive parents (via "Add parent") can now be an existing person, such as an aunt/uncle or grandparent who became a child's adoptive parent, instead of only a newly created one. Defining a node's parents offers the same genetic candidate list.

- `FamilyPedigree`: a node's partner is no longer offered as a possible parent of that node. The "add parent" social/adoptive list now excludes the node's partners (a partner can't be a parent), and the genetic "define parents" list excludes them too so a partner who has also been recorded as a donor can't be offered as the node's own genetic parent.

- `FamilyPedigree`: when adding a child, the node's siblings are now offered as possible egg/sperm parents so an existing sibling can be selected as a gamete donor (e.g. a sister donating an egg combined with a partner's sperm) without recreating them. Siblings are offered only in the add-child flow — a same-generation sibling still can't be the node's own parent or a new sibling's parent.

- `FamilyPedigree`: "Add parent" is now available on every node, including ego's partner. Previously it was hidden only for ego's direct partner, while every other married-in partner (e.g. a child's partner) could add parents — an inconsistency. A married-in person's parents are collected when clinically relevant (recessive/X-linked risk, consanguinity, an affected partner), and the consultand's own partner is among the most likely to warrant it, so the action is offered everywhere and left to the user's judgement.

- `FamilyPedigree`: the checklist now nudges you to record a partner's parents once that partner has had children with ego. A partner who contributes to the next generation has family history relevant to those children, so their parents are prompted — optionally, like the grandparents nudge, and only when the partner is a genetic (biological/donor) co-parent.

- `FamilyPedigree`: a parent who is both the egg source and the gestational carrier of a child now gets a single parent→child edge (flagged as carrier) rather than a duplicate one. This fixes existing children appearing twice when adding a partner, and a latent issue where the extra edge could skew the egg/sperm preselection when adding a sibling. A store-level guard now throws if a second edge of the same relationship type is created between the same pair of nodes, so duplicate-edge bugs surface immediately instead of accumulating silently.

- `FamilyPedigree`: treat every gestational carrier in the wizards as a non-genetic surrogate. A gestational carrier never contributes the egg, so the redundant "Was this person a gestational surrogate?" question has been removed from both the quick-start and add-parents-later flows, and the carrier is now always recorded with the `surrogate` relationship type. This also fixes a bug where a carrier who used a donated egg was classified as `biological` and incorrectly counted as a genetic relative of the participant.

- `FamilyPedigree`: `addableParentTypeOptions` now also hides the surrogate option once a gestational carrier is recorded for a node (it previously only removed the genetic biological/donor options once both gamete parents were known). This applies both when adding a parent and when adding a partner who might also be a parent of an existing child — so a new partner of a co-parent can only be added as a social (step/adoptive) parent of that child.

- `FamilyPedigree`: a donor-conceived child carried by a gestational carrier (e.g. a single parent using two donors) now renders a line of descent. The layout drew a descent only for children with a primary (biological/social/adoptive) parent, so a child whose parents were all auxiliary (gamete donors plus a surrogate) showed no edges. Following standard pedigree nomenclature — the carrier's line of descent is solid and the pregnancy sits below whoever carried it — the gestational carrier now anchors the descent when the child has no primary parent, with the donors attached as auxiliary lines. Children with a primary parent are unchanged.

- `FamilyPedigree`: the node menu's "Edit name" action is now "Edit" and opens the full person form — the name plus any protocol-supplied node form fields — pre-populated with the node's current values, rather than just the name. Editing is offered only while building the pedigree; once finalized, nodes are no longer editable and the previous finalized name-only edit is removed.

- `FamilyPedigree`: finalizing a pedigree that has no disease nomination prompts now advances to the next interview stage, instead of moving to a non-existent prompt and rendering an empty nomination prompt alongside the finalized pedigree.

- `FamilyPedigree`: the interview's "next" control now pulses once all the pedigree checklist items are checked, nudging the participant to finalize. This is a visual cue only and does not block navigation.

- Fix the `FamilyPedigree` layout breaking at larger viewport widths. `useNodeMeasurement` portaled its hidden measurement node into `document.body`, which sits outside the interview `Shell`'s `[data-theme-interview]` region. Network Canvas node sizes derive from `--theme-root-size` (via Tailwind's `--spacing-base`), and the `Shell` ramps that variable with viewport width (1rem → 1.125rem → 1.25rem). The portaled measurement therefore always resolved the base 1rem and under-measured the nodes that actually render larger inside the `Shell`, so `PedigreeLayout` sized its position cells too small and the nodes overflowed/overlapped at `laptop`/`desktop-lg` breakpoints. The measurement element is now rendered inline rather than portaled to `document.body`, so it inherits the same scaled `--theme-root-size` context as the rendered nodes. It stays off-screen via `position: fixed` + `visibility: hidden`, so it still doesn't affect the caller's layout.

## 1.0.0-alpha.21

### Prerelease Changes

- **Public-API removal.** `generateNetwork`, `GenerateNetworkOptions`, `GenerateNetworkResult`, and `StageMetadataSchema` are no longer exported. Import paths change as follows:

  ```diff
  - import { generateNetwork, StageMetadataSchema } from '@codaco/interview';
  + import { generateNetwork } from '@codaco/protocol-utilities';
  + import { StageMetadataSchema } from '@codaco/shared-consts';
  ```

  The synthetic-data code (`generateNetwork`, `SyntheticInterview`, plus shared `ValueGenerator`/types/constants) has moved into the new `@codaco/protocol-utilities` package. The session stage-metadata schemas have moved into `@codaco/shared-consts`. The interview runtime bundle no longer carries either.

- Internal `~/utils/codebook.ts` shim removed (`VariableOption`, `VariableOptionValue`, `VariableOptions` were redefinitions of types now exported from `@codaco/protocol-validation`). All in-tree consumers (`TieStrengthCensus`, `Narrative/ConvexHullLayer`, `Narrative/PresetSwitcher`, `selectors/session`, plus the Narrative test) import from the canonical source.

- Internal `DyadCensusMetadataItem` import redirected from the local session reducer to `@codaco/shared-consts`. Affects `DyadCensus`, `TieStrengthCensus`, and `DyadCensus/helpers`.

- Storybook stories import `SyntheticInterview` from `@codaco/protocol-utilities` (added as a devDependency).

- Dependency cleanup: dropped `zod` from `dependencies` — no source file in the interview runtime imports it directly any more. (Transitive zod usage via `@codaco/protocol-validation` and `@codaco/shared-consts` is unaffected.)

## 1.0.0-alpha.20

### Prerelease Changes

- `Shell`: move `DialogProvider` inside `ThemedRegion` so dialogs opened from stage content (`FamilyPedigree`, etc.) portal into the themed `PortalContainerProvider` instead of escaping to `document.body`. The provider remains nested below the Redux `Provider`, so dialog content can still call `useSelector` without exploding.

## 1.0.0-alpha.19

### Prerelease Changes

- `CategoricalBin`: comprehensive layout overhaul to fix a longstanding cluster of expanded-panel sizing and ragged-row centring bugs.
  - The expanded bin's panel is now rendered as a sibling of `.catbin-inflow` rather than inside it. The panel is `position: absolute` and anchors to `.catbin-circles`; if it sat inside `.catbin-inflow`, the size container on `.catbin-inflow` would have made that element its own containing block and `cqi` would have resolved against the (padding-shrunk) in-flow area instead of the full one.
  - Split the size query container from the grid: `.catbin-inflow` is the in-flow query container, `.catbin-grid` is the actual grid descendant where the `@container catbin` rules match and where `data-count` drives the layout lookup.
  - Drive grid layout entirely from `data-count` + CSS instead of measuring the container in JS. Drop the now-unused `useCircleLayout` hook.
  - Ragged-row centring is now keyed on a `[data-flow-index]` attribute (1-based ordinal among in-flow bins) rather than `:nth-child`, which broke whenever one bin was lifted out of the in-flow sequence to become the expanded panel.
  - Per-bin container for adaptive title + summary, so each bin's text scales to its own measured size.
  - Float `NodeDrawer` so opening/closing the drawer doesn't resize the bin area underneath.
  - Two final bugs: a panel/padding `cqi` mismatch where the same `clamp(20rem, 40cqi, 40rem)` resolved against different ancestor containers and produced a 200px gap, and a re-expand failure where Motion lost its `layoutId` transition because the expanded item had a constant React `key`.
- `AlterForm` / `AlterEdgeForm`: rebuilt around an explicit intro/form state machine with parent-owned intro navigation. Restores the scroll chain inside slides.
- `SlidesForm`: isolate fields from the hidden submit button so `not-last:mb-*` drops the bottom margin on the visually-last field.
- `useBeforeNext`: per-instance keys so multiple consumers in the same stage compose cleanly instead of clobbering each other.
- `synthetic.addVariable`: dedupe by name so callers can't shadow the auto-seeded `"name"` text variable added by `addNodeType`.
- `DataCard` polish and a saner default `basis` (50) on `Roster`.

- Intro-panel surface spacing increased and unified across stages. `Anonymisation`, `Information`, `EgoForm`, `DyadCensus`, `TieStrengthCensus`, `SlidesForm/IntroPanel`, and `NameGeneratorRoster/DataCard` get the new spacing scale. `DyadCensus` and `TieStrengthCensus` drop their local Surface wrappers in favour of the now-shared intro-panel pattern.

## 1.0.0-alpha.18

### Prerelease Changes

- `Narrative/PresetSwitcher` rebuilt on top of the fresco-ui wrappers. Switches from base-ui primitives to `Popover`/`Accordion`/`RadioItem`, adds a drag-handle button driven by `useDragControls`, and treats the popover as a pure toggle — only the trigger opens or closes it. The floating panel now uses `Surface spacing='sm'` with an explicit `shadow-xl` for the elevated/floating look, each accordion section flattens its header into a single `Trigger` that applies `headingVariants()` directly, and unused `presetLabelVariants` / `presetContentVariants` / `prevPresetRef` from the prior `AnimatePresence`-based version are removed.

- `OneToManyDyadCensus` rebuilt around the shared `Panel` + `NodeList` primitives. Replaces the hand-rolled `Surface` + `Heading` + `Collection` stack so the targets list matches the established node-list pattern (header, sizing, animation, DnD-ready). Focal source node renders at size `'md'` and collection items at `'sm'` for clearer visual hierarchy. `Panel` now forwards `className` so consumers can constrain its width. Panel title copy was also clarified.

- `DyadCensus` and `TieStrengthCensus` migrated to listbox semantics. `TieStrengthCensus` replaces `BooleanOption` with `RichSelectGroup` (horizontal listbox); `BooleanOption` is deleted. The two duplicate `Pair` components are consolidated into a single shared component with an optional SR-only `labelId`. Both stages now wire `aria-labelledby` on the response field referencing the pair label plus the `Prompts` id, so screen readers announce "Alice and Bob, [prompt], listbox, [option]" on focus arrival. `Prompts` accepts and forwards an `id` prop for these aria-labelledby targets.

- Markdown rendering fix for intro/explanation bodies. `RenderMarkdown` now receives `ALLOWED_MARKDOWN_SECTION_TAGS` so plain-text content renders inside `<p>` instead of being unwrapped, and `IntroPanel` drops the wrapping `<span>` (which was invalid markup around block content).

- Synthetic data improvements:

  - `addNodeType` now auto-adds a `'name'` text variable to every node type it creates. The existing `getNetwork` attribute-fill path already populates text variables with faker `firstNames` via `ValueGenerator`, and `getNodeLabelAttribute` already prefers a variable named `'name'`, so synthetic nodes now get realistic seed-deterministic labels in stories and tests instead of the `'Person'`-typed fallback.
  - `addStage`'s `initialNodes: number` is now `{ count, promptIndex? }`. The optional `promptIndex` resolves to a real `promptID` at `getNetwork()` time, so panel nodes carry a realistic prior promptID and the existing-panel round-trip works on every demo prompt. All in-tree callers are updated.

- Theme cascade and `Shell` consolidation:

  - Extract a `theme-base` utility (`bg-background`/`text-text`/`publish-colors`/`font-body`) and apply it inside `ThemedRegion` so descendants re-resolve themed values at the themed cascade context; `<body>` uses `theme-base` too.
  - Mount `DndStoreProvider` and the interview `Toast.Provider` inside `Shell`, so hosts no longer need to mount them. Drops the now-unused `InterviewToastViewport` and `interviewToastManager` public exports — consumers that previously imported them can delete those references.
  - `ProgressBar`, `Spinner`, `NodeBin`, and `PassphrasePrompter` switch from `rem` to `var(--theme-root-size)` so sizes scale with the theme's root size at breakpoints.
  - Indirect `--radius` through `--radius-base` so the bare `rounded` utility keeps a `var()` reference and resolves at use-site instead of snapshotting the default-theme radius at `:root`.

- Spacing/container tokens now scale with `--theme-root-size` (via `@codaco/tailwind-config@1.0.0-alpha.17`'s rebased `--spacing-base` and `--container-*`). Consequent component cleanup:

  - `Node`: drop per-breakpoint `size-XX` variants — the themed `--theme-root-size` handles it now.
  - `Collection` layouts now express `gap` in Tailwind spacing units instead of pixels; the layouts' internal pixel math for virtualization rows resolves the same `calc(N * var(--spacing-base, 0.25rem))` expression via a hidden measurement element on the container.
  - Spacing tweaks across `NodeList`, `Panel`, `Prompt`, `FamilyPedigree` placeholder/node, `NameGenerator` `QuickAddField`/`Roster`, and `OneToManyDyadCensus` to fit the new scale.
  - Bundle the `pedigree-context-menu-hint` PNG via Vite import (previously served from `/public`).

- `NodeBin` renders the SVG via `<img src>` rather than `style={{ backgroundImage: url(...) }}` on a child `<div>`. The previous inline `style` attribute was silently dropped by React under a `motion.div` parent, so the bin graphic now renders correctly during drag.

- `ResizableFlexPanel` (and the interview's flex panel callers) only applies `overflow: hidden` during collapse, so content isn't clipped at rest. Mirrors the matching fix in `@codaco/fresco-ui@2.10.0`.

- Storybook/dev fixes:

  - Repair the theme switcher: the `withTheme` decorator now also wraps stories in `ThemedRegion`, so the canvas tab reflects interview theming (regressed when `withTheme` was previously replaced with `persistTheme`).
  - Restore `data-theme-interview` on `document.body` so story padding/chrome/scrollbars render in the themed palette when stories aren't fullscreen.
  - `NameGenerator` quick-add now wires to the real codebook variable id (the synthetic's `"name"` default doesn't match the auto-generated key, which was causing `NETWORK/ADD_NODE/rejected`).
  - Storybook `viteFinal` uses `mergeConfig` and pre-bundles `d3-force` for faster cold starts on the Sociogram-bearing stories.

- Internal: adopt the `~/*` path alias via `tsconfig` paths. TypeScript 6 deprecates `baseUrl`; Vite 8 ships `resolve.tsconfigPaths`. Relative imports deeper than one directory up rewrite to `~/...`; single-up (`../foo`) and same-dir (`./foo`) imports are left untouched. The Vite rollup `external` predicate excludes `~/*` so `preserveModules` resolves the alias to relative paths in the published `dist` (no `~/` specifiers leak to consumers).
