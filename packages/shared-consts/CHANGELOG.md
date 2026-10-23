# @codaco/shared-consts

## 7.0.0

### Major Changes

- 151e511: Codebook IDs and the names researchers type now follow separate rules, so names
  can use any script.

  **Breaking:** `VariableNameSchema` is removed. Replace it according to what the
  value is:

  - A codebook record key (the ID a node type, edge type or variable is stored
    under) or another internal identifier: use `CodebookIdSchema`. It keeps the
    old `[a-zA-Z0-9._:-]` rule and also refuses `__proto__`.
  - A name a researcher types (an entity type's name, a variable's name or an
    option value): use `CodebookNameSchema`. It accepts any script, spaces and
    punctuation. It refuses an empty name, leading or trailing whitespace, text
    not in Unicode NFC, lone surrogates, control characters (tab and line breaks
    included), and U+FFFE and U+FFFF. Store a typed name with
    `normalizeCodebookName`, which converts it to NFC and trims it.

  New exports:

  - Export column naming, shared by the exporters and the protocol editors:
    `categoricalOptionColumn`, `layoutColumn`, `variableExportColumnEntries`,
    `reservedExportColumns` and `findExportColumnConflicts`, with the types
    `ExportColumnFormat`, `ExportColumnEntity`, `ExportColumnVariable`,
    `LayoutColumnAxis`, `ExportColumnOrigin`, `ExportColumnEntry` and
    `ExportColumnConflict`. Call
    `findExportColumnConflicts({ entity, candidate, siblings })` to refuse a name
    whose exported columns would clash with a built-in column or with another
    variable's columns. Columns are compared as each format writes them, so two
    names that only become the same once written clash too: `close friend` and
    `close_friend` in GraphML, `=total` and `'=total` in CSV. Each conflict lists
    the `formats` it occurs in, and a clash between two different texts carries
    the column as written in `writtenColumn`.
  - How the exports write a column name: `toGraphMLAttrName` replaces each
    character an XML name token can't hold with `_`, and `neutralizeCsvFormula`
    puts an apostrophe before text that starts with `=`, `+`, `-`, `@`, a tab or
    a carriage return.
  - XML 1.0 character checks: `hasXmlIllegalCharacters`, `xmlIllegalCodePoints`
    and `stripXmlIllegalCharacters`.
  - The export column names `appVersionProperty`, `commitHashProperty` and
    `graphMLLabelKey`.

- cad7309: The metadata stored beside an encrypted value is now `{ iv }`. `salt` is
  optional, and present only on values written by the experimental schema 8
  feature, which can no longer be decrypted; networks holding them still parse
  unchanged. Code that read `salt` from this metadata must now allow for it to
  be missing.

  `DEFAULT_PASSPHRASE_MIN_LENGTH` (8) is the shortest passphrase an interview
  accepts when its Anonymisation stage sets no minimum of its own.
  `effectivePassphraseMinLength(rules)` gives the minimum that applies to a
  stage's length rules: the stage's own minimum when it sets one, otherwise the
  default, lowered to the stage's maximum when that is shorter.

### Minor Changes

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

### Patch Changes

- 2ff161c: `ensureError` now returns a real `Error` when the thrown value is an Error class rather than an instance (for example `throw ValidationError` instead of `throw new ValidationError()`). It used to return the class itself: a function, with no message or stack trace of its own.
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

## 6.3.0

### Minor Changes

- de25fc5: Export the Mapbox testing token as `TESTING_MAPBOX_TOKEN`. It is the URL-restricted sandbox token that the Network Canvas templates embed so Geospatial maps render while a protocol is being evaluated. It only works on networkcanvas.com, networkcanvas.dev and localhost, so researchers must still replace it with their own token before fielding a study.

## 6.2.0

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

## 6.1.0

### Minor Changes

- b2ca402: Export `relativeDatePickerWindow`, the two dates a `RelativeDatePicker` holds
  an answer between. A relative picker names no `min`/`max` — it names an anchor
  and a span either side of it — so every reader of one has to turn those into
  the same pair of dates, defaulting the anchor to today and the span to the
  shared before/after constants. That derivation now lives here, beside the
  clamp and the defaults it is built from, rather than once per reader:
  `@codaco/interview`'s `buildDatePickerBoundProps` calls it for the hard bounds
  a submitted answer is validated against, and the protocol builder calls the
  same function to decide whether a filter or skip-logic rule compares against a
  date no participant could ever have given.

  Export `datePickerWindows` alongside it, which does the same job for a plain
  `DatePicker`: it resolves the `min`/`max` a protocol declares into the two
  windows the control actually offers — the `native` pair a full-resolution
  `<input type="date">` takes for its attributes, and the `coarse` pair the month
  and year dropdowns are built from — together with `hasAuthoredBound`, which
  says whether the protocol declared either. An undeclared bound falls back to
  `DATE_PICKER_DEFAULT_MIN` below and today above, extending past an authored
  bound that already sits outside that window, and each synthesized edge is
  clamped to what its own control can represent. fresco-ui's `DatePickerField`
  now renders from this rather than from its own copy of the rules, and
  `@codaco/protocol-builder` calls it to decide whether a filter or skip-logic
  rule compares a coarse date attribute against a year its dropdown does not
  contain — a comparison no participant answer can ever satisfy.

  Export `todayYmd`, the UTC day-stamp those windows default an undeclared bound
  to, which was fresco-ui's. Both functions above take the day as an argument —
  the clock belongs to the caller, so that a reader deriving several windows
  derives them all on the same day and a test can ask what the window was on a
  day of its choosing — and this is what a caller with no day in mind passes.
  It moved here because the packages that have to PREDICT what the date controls
  will accept cannot depend on a UI package to find out what day it is:
  `@codaco/protocol-builder` reads a rule through a pure export a host calls with
  no editing session, and reaching fresco-ui for a clock read pulled React into
  that graph. `@codaco/fresco-ui/form/utils/ymd` re-exports it, so nothing
  importing it from there has to change.

  `@codaco/protocol-utilities` keeps its own, because it is deliberately free of
  every dependency but its own; `@codaco/interview`'s `ymdParity.test.ts` holds
  the two to the same answer. `@codaco/protocol-validation`'s contradiction
  analyser deliberately keeps its own model of the same rules: protocol validity
  must not depend on when validation runs, so it substitutes a fixed horizon for
  today rather than calling this.

### Patch Changes

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

## 6.0.0

### Major Changes

- e9a6522: Shared error formatting now turns unexpected failures into concise user-facing messages without exposing stack traces. Applications and protocol tooling use this common implementation for validation, imports, roster loading, and synchronization errors.

  The pedigree value sets have moved out of this package, because they define what a protocol schema version accepts and must not be able to change without that version changing. `RELATIONSHIP_TYPES`, `RELATIONSHIP_TYPE_OPTIONS`, `GAMETE_ROLES`, `GAMETE_ROLE_OPTIONS`, `BIOLOGICAL_SEX_VALUES`, `BIOLOGICAL_SEX_OPTIONS`, `FRAMING_IDS`, `INHERITANCE_PATTERNS`, and their types are now exported from `@codaco/protocol-validation`. The wording that travelled with them — `FRAMING_TERMS`, `FRAMING_AUTHOR_LABELS`, and the biological-sex question, hint, and lead-in — is interview and editor copy, and now lives with the screens that display it.

- fdb3b56: Entity attributes now have one serialization-safe contract: every stored value is defined, and a missing key means the answer is unset. Legacy networks containing `null` or `undefined` attributes remain readable and are normalized without losing valid empty values such as `false`, `0`, empty text, or empty selections.

  This is a breaking type and data-shape change: `VariableValue` no longer includes `null`, and parsed `NcNetwork` values omit nullish attributes. Consumers should treat attribute absence as the unset state.

## 5.6.1

### Patch Changes

- 3c8fe35: Generate realistic, source-backed family pedigrees with reproductive scenarios and multi-generational disease lineages, while respecting each stage's collected variables, keeping pedigree membership isolated from other interview stages, correctly rendering shared and multiple unions, widening partnership response columns, and warning participants before discarding onboarding progress.

  Improve pedigree editing and parentage capture by confirming destructive deletions, preserving biological-sex values, allowing current/ex-partner status changes, and recording reproductive roles independently from sex recorded at birth.

## 5.6.0

### Minor Changes

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

- efc3a92: A relative date question anchored near either end of the calendar no longer refuses every date it offers.

  A relative date question works out the dates it accepts by counting days forward and back from an anchor. With an anchor late in the calendar that count could pass the year 9999 — an anchor of 9999-12-31 accepting one day after it worked out a latest date of 10000-01-01 — and with an early anchor it could pass year zero, working out 0000-07-05 or, further back, something that was not a date at all. Neither is a date the software recognises, so the check on what a participant entered stopped comparing dates and compared plain text instead, where a five-digit year sorts before every four-digit one. Every date the question could offer was then rejected as too late, including the one the participant had just chosen. Both ends of the window now stop at the first and last dates a date field can hold.

  `@codaco/shared-consts` exports `dateWithinPickerRange`, `DATE_PICKER_EARLIEST_DATE` and `DATE_PICKER_LATEST_DATE`. The field in `@codaco/fresco-ui`, the submission checks in `@codaco/interview` and the synthetic dates drawn by `@codaco/protocol-utilities` all work the window out from that one function, so the three cannot disagree about it. Questions anchored anywhere else are unaffected, and generated data for them is unchanged.

## 5.5.0

### Minor Changes

- 179952e: Add canonical localized site navigation and footer components, a shared animated link treatment for anchors, footer links, and link-style buttons, a canonical default text color, plus a shared public-site locale definition for edge routing and translation coverage.

## 5.4.0

### Minor Changes

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

### Patch Changes

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

## 5.3.0

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

## 5.2.0

### Minor Changes

- `FamilyPedigreeStageMetadataSchema`: edges may now carry an optional internal `gameteRole` (`'egg' | 'sperm'`) recording which gamete a biological/donor parent contributed. It is persisted in stage metadata for relationship labelling and is never written to the interview network.

## 5.1.0

### Minor Changes

- Add session stage-metadata schemas as a cross-package contract for code that produces or consumes interview session state. New exports from `./stage-metadata`:

  - `StageMetadataSchema` (zod) — record of stage ID → either a FamilyPedigree metadata object or an array of DyadCensus/TieStrengthCensus tuples.
  - `DyadCensusMetadataItem` (type) — the `[promptIndex, fromId, toId, isPresent]` tuple shape.
  - `StageMetadata` (type) — inferred from `StageMetadataSchema`.

  These previously lived inside `@codaco/interview`'s session reducer; relocated here so `@codaco/protocol-utilities` (which generates conforming metadata) and `@codaco/interview` (which validates and stores it) can share a single definition. See `@codaco/interview`'s and `@codaco/protocol-utilities`'s changelogs for the corresponding consumer updates.

## 5.0.0

### Major Changes

- 3849e0e: Updated zod to version 4. Consumers must also use zod 4 to avoid type conflicts.

## 4.0.0

### Major Changes

- Improve types for variables
- b0fa339: # Implement bundling with Vite for @codaco/shared-consts

  This is a major breaking change that transitions the package from exporting raw TypeScript files to providing bundled JavaScript output.

  ## Changes
  - Added Vite library mode configuration with dual format support (ESM + CJS)
  - Added vite-plugin-dts for TypeScript declaration generation
  - Updated package.json with proper exports configuration for both ESM and CJS
  - Added build scripts and development workflow
  - Updated version to 3.0.0 to reflect the breaking change

  ## Breaking Changes
  - Package now exports bundled JavaScript instead of raw TypeScript
  - Build step is now required before publishing
  - Import paths remain the same, but the underlying module format has changed

  This change improves compatibility with legacy applications while maintaining support for modern ESM environments.

### Patch Changes

- a4969c4: small changes
- 9ec9284: export additional types
- 304c64f: Make ego a required property of NcNetwork

## 1.0.0-alpha.3

### Patch Changes

- a4969c4: small changes

## 1.0.0-alpha.2

### Patch Changes

- 304c64f: Make ego a required property of NcNetwork

## 1.0.0-alpha.1

### Patch Changes

- 9ec9284: export additional types

## 1.0.0-alpha.0

### Major Changes

- Improve types for variables
