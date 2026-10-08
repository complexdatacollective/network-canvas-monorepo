# @codaco/interviewer

## 8.4.0

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

- cfa024a: The hourly check for a new app version no longer reports a crash of its own.
  Firefox refuses the check outright once the installed app worker has been
  replaced, and that refusal was being shown as an application error. The check
  now stays quiet and tries again on the next hour.
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

- 34965ed: CSV and GraphML exports now mark an answer `ENCRYPTED` only when it was
  saved encrypted. Before, the exporters followed the protocol's current
  setting, so an answer saved as plain text could be exported as `ENCRYPTED`.
  An answer saved encrypted could also be exported as unreadable data, if the
  protocol no longer asked for encryption. GraphML node labels follow the same
  rule. A plain-text answer that replaced an encrypted one is exported as
  itself, even where an earlier version left the encrypted answer's details
  saved alongside it.
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
- eabaf1a: Entering an interview that requires unlocking no longer trusts a value kept in the browser's session storage. Unlocking the app while an interview is open still lets you return to it without a second prompt, but a value placed in session storage can no longer skip the unlock step.
- 96405a2: `@codaco/interview/protocol-payload` exports `currentProtocolToPayload` on its own. A host whose server code runs directly under Node, without a bundler, can import the converter from it without loading the rest of the interview contract.
- 4e6916e: The interview `Shell` accepts any posthog-js client that provides `capture`, `captureException` and `register`, rather than only the `PostHog` class of the default `posthog-js` entrypoint, so a host built on another posthog-js build (such as `posthog-js/dist/module.no-external`) can pass its client without a cast. The runtime's own instance, used when a host passes no client, now loads that no-external build as well: it carries no remote script loader, so it works under a host's `script-src 'self'` policy.
- 0554def: Interviewer opens with about 4 MB less JavaScript to load. The bundled sample
  protocol and its media, and the synthetic data generator, now load only when
  you install the sample or generate synthetic interviews. Both are still stored
  for offline use, so installing the sample protocol works without a connection.
- 2eff760: Interview analytics now stay off until the app's own PostHog client has loaded. Previously, while that client was still loading (at unlock, or on a later opt-in), the interview runtime briefly started a second, separately configured PostHog instance of its own, which could report the first events of a session under a different identity.
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

- 57bba6a: Analytics and error reporting now run entirely from code shipped inside the app. The PostHog relay is contacted only for data: the app's Content Security Policy no longer allows it, or any other remote origin, to supply scripts.
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

- c791b8d: The hourly check for a new app version no longer reports a crash when it
  cannot reach the network.

  Both apps ask the browser to re-fetch `sw.js` once an hour to see whether a new
  version has been deployed. That fetch fails routinely — the device is offline,
  behind a captive portal, or a deploy is swapping assets mid-request — and the
  failure was left unhandled, so it surfaced as an uncaught `TypeError` and was
  reported to error tracking as an app crash. A failed background check is now
  silent; the next hourly check simply tries again, and the update banner is
  unaffected.

- 0ee7d8a: File drop areas are updated to a newer version of the upload component. A file can now be pasted onto a focused drop area, the hidden file picker carries an accessible label, and dropping a file onto a drop area that is busy or disabled no longer opens it in a new browser tab. Dropping several files where only one is expected still opens nothing.
- 2959d6a: The interface language list now opens with a search box, so you can find your
  language by typing its name instead of scrolling through every language on
  offer.
- b8405ea: `@codaco/interview/contract` now exports `currentProtocolToPayload`, which turns a validated protocol into the payload the interview runtime receives. The caller supplies the payload's `id` and `importedAt`, so a host can give the same protocol the same identity every time it loads it.

  Architect's preview uses it, so preview assets now carry their display name and source filename the same way they do in Interviewer. An audio or video item with no description is announced by its display name instead of its filename.

- 9eb0a39: An interview whose saved answers cannot be read is no longer at risk of being
  overwritten. Fresco used to open such an interview as if nothing had been
  answered yet, and its first save then replaced everything stored, including
  the participant's answers. Fresco now shows the participant an error instead of
  starting the interview, refuses any save over data it cannot read, and records
  the failure in error tracking. The interview data API returns an error for
  such an interview rather than an empty network, and an export that includes one
  stops instead of writing an empty network into the file. Interviewer, which
  already left such an interview untouched, now shows an error instead of loading
  indefinitely, and records the failure too.
- Updated dependencies ([5339bf8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5339bf83bd791585b0002381ec2e52792f7e0697), [263c5ef](https://github.com/complexdatacollective/network-canvas-monorepo/commit/263c5ef39a5fb92be91484d41b08ea7dda525fa3), [c5dc35b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c5dc35b889d75c4f21657ce473ef6ec030660e24), [08fd0f7](https://github.com/complexdatacollective/network-canvas-monorepo/commit/08fd0f7dc2c1a7b757b2caf64ae68aacaaf31572), [4d8ce20](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4d8ce20d1a2a173579d4ac76dfa519126e3d9725), [8e9852f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/8e9852f096c250585d805fa72e0a100d1a682093), [e6f137b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e6f137b276214e418748bc027afcad797f817ad2), [c7aa307](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c7aa30724b3050d29c4f4f80cf4a56847b3b193f), [ee4ad52](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ee4ad52b14e081d25f883d9d170454932749d5ab), [34965ed](https://github.com/complexdatacollective/network-canvas-monorepo/commit/34965ed87bd69764bfb48afdac07de34cfe923d3), [d0c3ada](https://github.com/complexdatacollective/network-canvas-monorepo/commit/d0c3ada1469ecb345d920e5af8d4fb4e07236a73), [6dc47ba](https://github.com/complexdatacollective/network-canvas-monorepo/commit/6dc47ba0ead3dca990c44ee5be168dacc9730799), [3d0a7d1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3d0a7d1f0a04bd98a3b8f5c82fbf912e1db9597c), [747ee33](https://github.com/complexdatacollective/network-canvas-monorepo/commit/747ee3366831b85231a17a3a8173404af46c3d3a), [489bf51](https://github.com/complexdatacollective/network-canvas-monorepo/commit/489bf5173aad4d29e79c6a2a29d018223e369031), [bff61d5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bff61d58f17fbb7b021e6591da9575ed4c12cc16), [649f7a3](https://github.com/complexdatacollective/network-canvas-monorepo/commit/649f7a37175c0910a74393ef95c2656c32a73bd4), [b84263e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b84263ec1076dc14e407b4919f5fdbaae45c6883), [62617a9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/62617a9c21d7e6e200adc162417090a522fac1e6), [ad9d1df](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ad9d1df75297d9c64abd1d985f4769302a756c79), [0313691](https://github.com/complexdatacollective/network-canvas-monorepo/commit/031369103585699bfe24d77521995bc5c8c92fff), [96405a2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/96405a2396db787e32a530d5c732f10c0b403347), [4e6916e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4e6916e140d5d0d568ceea140b1054ba8f04cabb), [5b12f3b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5b12f3b977d4244c398301541d978d825f53ea13), [216e8c4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/216e8c4e1cc63357f121d65150851536996ef3af), [f32135f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f32135fd036f07157198728377dfdbeb30dff747), [56e16d0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/56e16d0de03049200559dbf6bf07671689e4d99b), [dfcbc73](https://github.com/complexdatacollective/network-canvas-monorepo/commit/dfcbc7382eedbdbfc83aa06e8141d1e04ffdf4e1), [a6c5e2b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a6c5e2b222f09948cd0bf1e32fbde182a7248900), [3093df5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3093df504bae4a945b77a7441aefd04c6abb4a7f), [2659fb1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2659fb14d0090fc7040f48da515db7b43385b549), [fb4b061](https://github.com/complexdatacollective/network-canvas-monorepo/commit/fb4b061a341f26aef772842ce7dd934dfdb27a56), [7e225bf](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7e225bfd84b6563b47b9d84bffcf1a2b79754314), [5dd537e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5dd537e08de27371e14b052a5a461992e15ab559), [7d7b84a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7d7b84a6031a10d7147292c4b043b1ff50c566f6), [6a88e57](https://github.com/complexdatacollective/network-canvas-monorepo/commit/6a88e57c53a947d158486f6544c84334fe115b64), [968624e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/968624e79eb0b4ab7f776cfc505118d6897dcdbe), [810604e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/810604e8e3d5ecfd2d45b38619488660dd69f538), [0554def](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0554def9c17db95f4d61a360a3bf068b3d391994), [254a887](https://github.com/complexdatacollective/network-canvas-monorepo/commit/254a8878ce934e8ebe03b0d7037cb2e98b1d9b0f), [b8405ea](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b8405ea8126f0bc585b73a72f0d0b9b2982380e2), [513d87a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/513d87a73804d2b1dcc96b06e6e138df198bbc77), [73b2af6](https://github.com/complexdatacollective/network-canvas-monorepo/commit/73b2af6e7711638360d58c644f985319ab8f1834), [d8c5523](https://github.com/complexdatacollective/network-canvas-monorepo/commit/d8c552308b298a144b9801c0df5347c248be4fc2), [16b1178](https://github.com/complexdatacollective/network-canvas-monorepo/commit/16b11782aa5f22fb3efbe55f46612d37c5bbb827), [76722bb](https://github.com/complexdatacollective/network-canvas-monorepo/commit/76722bb9d8f3d3e7e5eca94e802f48584ef37e8a), [e5f6a9a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e5f6a9ac0760f4a67ba353996b43327a5d1b0855))
  - @codaco/fresco-ui@8.0.0
  - @codaco/interview@10.0.0
  - @codaco/protocol-validation@15.0.0
  - @codaco/app-i18n@0.3.0
  - @codaco/network-exporters@4.0.0
  - @codaco/protocol-utilities@5.0.0
  - @codaco/shared-consts@6.2.0
  - @codaco/tailwind-config@1.5.1

## 8.3.0

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

- 7a909de: Use Interviewer and its built-in interview controls in English, British English, or Spanish. Choose a language from home, setup, settings, or the interview menu; follow the browser automatically or remember a choice on each device. Every supported language remains available offline in the installed app. Protocol-authored content and collected data stay unchanged.
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

- 8a91585: A combobox's list of options now opens above the popover it sits in. In
  Interviewer's data view, the protocol filter's list opened behind the rest of
  the filter panel, so once you had filtered to one protocol you could not
  choose another or clear the filter. You can now.
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

- 3abf9e4: Two new components for naming where a researcher is: `IdentityMark` and
  `navigation/TeamAndStudySwitcher`.

  `IdentityMark` gives an entity a stable visual identity — a monogram on a fill
  chosen by hashing the entity's id. The fill derives from the id alone, so the
  same entity is the same colour in every session with nothing persisted, and
  renaming it never recolours it. The fill and foreground pairings are measured
  rather than assumed: mustard, sea green and sea serpent take the dark
  foreground, because white on them is 1.82:1, 2.27:1 and 2.23:1. The mark is
  `aria-hidden` — every caller renders the entity's real name beside it.

  `TeamAndStudySwitcher` is the control that names the team whose work is on
  screen and the study open inside it, and moves between siblings of either. One
  component rather than a frame composed around separate switchers: the frame and
  the segments have to agree about radius, height and where a painted surface
  stops, and as separate components they disagreed about each in turn. The frame
  owns the border, the radius and the clip; the segments have no corners of their
  own.

  It is a listbox rather than a menu, so opening lands on the entity you are
  already in rather than on the first sibling. The trailing command sits in the
  popup but outside the list, so the list holds only options — and the command
  is still reachable, one Tab from the open list. A segment with nothing to
  switch to and no command renders inert rather than taking a tab stop, and a
  loading segment reserves the space its name will take, so the header does not
  reflow. Which presentation a segment is in follows a container query, not the
  viewport.

  A segment's status is `ready` or `loading`, and there is no failure state.
  A list that could not be read is the host's to report: one switcher carrying
  its own error surface would put a second, quieter account of the same outage
  beside the one the application already makes.

  The trigger's accessible name is one interpolated message the host supplies
  through `accessibleName`, rather than two separately translated strings this
  component joins. Word order is a property of the sentence — English wants
  "Team SONIC Lab" and Japanese the equivalent of "SONIC Lab team" — and no
  order the component picks is right everywhere. It defaults to the previous
  output, and warns in development when a supplied label does not contain the
  visible name, which a control's accessible name has to (WCAG 2.5.3).

  The listbox is rendered even when the list is empty. Without one, Base UI
  moves `role="listbox"` onto the popup, which puts the trailing command inside
  the listbox — a structure that holds options and nothing else, and one a
  screen reader may skip or misannounce.

  The supporting line under a name keeps full strength on the selected row.
  Dimmed, it composites toward `--selected` and falls to 2.90:1 against it.

  Every text run in the control sits on its caps and baseline rather than on its
  line box, matching the rest of the library. Two spacings that the leading used
  to provide by accident — between the kicker and the name, and between a name
  and its supporting line — are now stated, and a name that has to shorten clips
  sideways only, because a cap-height box would otherwise lose its descenders.

  The type scale gains `text-2xs`, one step below `xs`, for the small uppercase
  labels that qualify a value rather than being one.

  `@codaco/tailwind-config` ships alongside because the components need its CSS:
  a `--text-2xs` step below `xs`, for the small uppercase word above each name,
  and a radius scale that now derives every step from `--radius-base`. That
  second change is a fix — only the bare `rounded` utility followed a theme
  before, so `rounded-sm` and the rest resolved at `:root` and every themed
  region got the default theme's numbers.

  Interviewer's update indicator takes the default pill size. It was the only
  caller asking for `sm` — Architect's equivalent asks for `md` — so the same
  indicator was drawn at two sizes in the two apps for no stated reason. It is
  `md` in both now. The patch is here rather than in a changeset of its own
  because the size it lands on is `Pill`'s, and the two move together.

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

- 2cdd919: Closed a gap where locking the vault while the stored-protocol migration check was still running could let the app admit its routes on the next unlock before that check had run again.

  The lock screen's recovery restriction, and the counts and warnings in the data, settings and status screens, now appear in the same step as the change that causes them rather than one frame later.

- 01aaed2: Use `libro de códigos` for the codebook throughout the Spanish catalogs.
- Updated dependencies ([486ad48](https://github.com/complexdatacollective/network-canvas-monorepo/commit/486ad489e5d6387d418f621a168b0f941021353e), [026b518](https://github.com/complexdatacollective/network-canvas-monorepo/commit/026b5188636452e20570bb4c15e055c8d6d000e8), [043c098](https://github.com/complexdatacollective/network-canvas-monorepo/commit/043c098386556fdc0d28c9ef77f398a712e49bb2), [55bf4da](https://github.com/complexdatacollective/network-canvas-monorepo/commit/55bf4daf8554976b31f8e1400b2c38216ef8a2f2), [91a25de](https://github.com/complexdatacollective/network-canvas-monorepo/commit/91a25ded87f6348e9fc14b5d5b84303f658a0792), [ce5e872](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ce5e87292186a22123dc21411411ffd13aa79992), [2eafe92](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2eafe92060cd4aa1dbcde5c2b79d00d87bba9159), [88f4d4b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/88f4d4bb1d6c0863b6d201f614fcd208efa642da), [0968b01](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0968b014c202284d3c40da0eb71a4f4f13a62d01), [fb1b7ed](https://github.com/complexdatacollective/network-canvas-monorepo/commit/fb1b7ed0986d7b9db0eb7444c2f49c2061376d0d), [8a91585](https://github.com/complexdatacollective/network-canvas-monorepo/commit/8a91585f808df2422377e3cb1ae154bc40ebec13), [e322f90](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e322f9040c9f5f4218ea8d7da1aa286ef4e719e9), [e87f8f5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e87f8f59a9c05eac7219631a4dc002dfed65efcb), [8d4585b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/8d4585b98bb300decdcee502d18a362a947e8a3a), [5a19894](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5a19894e03e1aa5bd176b012a342d20c50398c86), [ca83424](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ca8342421dda342d1722ad838bbbe58837212022), [e4dad7e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e4dad7ef5a96a1f09257483c4f99fccffc0dcaa5), [90b08cd](https://github.com/complexdatacollective/network-canvas-monorepo/commit/90b08cd133b8555408329acdfe1ea00e0a7fff37), [1376c6a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1376c6a817e093ce220c9397492290a0f7d6a57f), [b0fa87a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b0fa87ac6614959484cdb1e4d6457513e9898a56), [64c7891](https://github.com/complexdatacollective/network-canvas-monorepo/commit/64c7891c377b734e8b5f9df2e360884bf4848f4e), [ab25ed6](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ab25ed6be06f2e4f983f2a5c5915e962caed5970), [15c8259](https://github.com/complexdatacollective/network-canvas-monorepo/commit/15c825972e5097cd8d8559d47e5ba4584398edee), [484c9e0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/484c9e0efeac6e55506d56504a79c37e00f9f687), [1abd707](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1abd707d0894dfad3eaf0eb5a79e76ffc3e7932c), [154d2ab](https://github.com/complexdatacollective/network-canvas-monorepo/commit/154d2ab5ad89ce4a5d370d1fb818135ab7fbb62d), [c100092](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c100092b303b1b02afe2876d8dbbc84af06865b2), [65d2583](https://github.com/complexdatacollective/network-canvas-monorepo/commit/65d2583c12a2af634080b466f95793f3cc8032d4), [4749625](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4749625620599802f85560ec1ba54fc7873a2ecc), [57c74ae](https://github.com/complexdatacollective/network-canvas-monorepo/commit/57c74ae5a36b8e5c1d8efd3863cbfeaf412ba1b4), [c358132](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c3581329466d44b3733a09bb459d07a1787486ef), [df21eec](https://github.com/complexdatacollective/network-canvas-monorepo/commit/df21eece0b9a9e6393f694c07374e7d10d66dabc), [c563d9f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c563d9f0815df12f618c06548e1281fec95bb656), [4e808e1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4e808e1172f91fb6d78a3ebc6e0b65dbc2096ad3), [208fcea](https://github.com/complexdatacollective/network-canvas-monorepo/commit/208fceaf736d8354d16046b6e9953b1d598f65a1), [a382c6b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a382c6bfa34cbe04e6e79143526bf2f3215baa59), [3abf9e4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3abf9e4442b6086c5c5937d16212a9bdc8425cab), [45a30fa](https://github.com/complexdatacollective/network-canvas-monorepo/commit/45a30fae119ebf52d31738fa98e61b707d1d4c54), [1dac91b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1dac91b131db3740117aaf7977c9ff9bd697241e), [23dcf99](https://github.com/complexdatacollective/network-canvas-monorepo/commit/23dcf99e80d3e95b9e71543afb2e40842d1527e1), [a13f261](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a13f2610b7834e2fe27ae4e1e8423612b990c304), [c5758a4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c5758a447125e840b91d81e9b2e9ed6acdf1583e), [29b11be](https://github.com/complexdatacollective/network-canvas-monorepo/commit/29b11be8da6cfb65b8c9cce5d6f1d8711889d4f1), [a78b7c2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a78b7c20034648fffcee4202a143481178f8637b), [aa4693a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/aa4693a1e221515381058229d7fbf61d7807dfe3), [bb8e755](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bb8e7550160683d76d359b0d0c7093e6d128b9e2), [693655f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/693655f3d388e7ef91cb0e2324a10bb201a5f96c), [0030df8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0030df8ab94984e8ca6666da03ec0ae02d6bdbf4), [5de44c1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5de44c15c99bc4e778d08c1be23bfd590e877005), [ed91f97](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ed91f9759c0d12bc6940d61800b816a2f482d4dc), [98063fb](https://github.com/complexdatacollective/network-canvas-monorepo/commit/98063fb115deb11852910ca7ef7583d278207f4b), [f6565fe](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f6565fe3f11ddfa004d1ea5d37a7b97401a53db4), [139de02](https://github.com/complexdatacollective/network-canvas-monorepo/commit/139de022e376c743c1944ffad36c4cc994e0716b), [4ea797d](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4ea797d7159622173f7a605cf2ce6cac1884e854), [d7e93c5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/d7e93c571df1fea1a8fc71d8c9d4f6692e2dbe7c), [55f5549](https://github.com/complexdatacollective/network-canvas-monorepo/commit/55f554975bc6731a7f5bc94dde0a7000b64ce2da), [2bea7ee](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2bea7eed99b1f0f5056144a1d6ac30855c36513e), [02ead76](https://github.com/complexdatacollective/network-canvas-monorepo/commit/02ead76454267cb9fcc8e2810eb6189e6d3aabc9), [f84eb32](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f84eb32e7c776a088c412511183baf7e3b635021), [eea0b5a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eea0b5acf7c4b852a57c6b57c5a504a34a7d11c0), [eee19fb](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eee19fb93d4cb57d3c4d256971da78df15730a88), [a5626f5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a5626f51040d092c56417694296bcde8d51faad9), [06ffe9f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/06ffe9f4e0154e34633c9981e94f3c5919acac87), [b2ca402](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b2ca402a852b5527e0455c7ff2949da3be50dccd), [aab7516](https://github.com/complexdatacollective/network-canvas-monorepo/commit/aab75165be13439838568f8d393189f9ceacfe0b), [3ae3a94](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3ae3a9438da400fc357a0c71721d45cd32f3a7ac), [01aaed2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/01aaed2d0bcd7ce203f50952ddd3e4ddeaed143a), [d356513](https://github.com/complexdatacollective/network-canvas-monorepo/commit/d3565138de36477aa2fffe7638105e67d18d2d29), [3f54d21](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3f54d2102e9489ae65cb164466fe71de05901ddd), [553d580](https://github.com/complexdatacollective/network-canvas-monorepo/commit/553d580c548e86730faecd95a18b6bf29868807f), [9d9f310](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9d9f310867e490c073374df20689def7be163f47))
  - @codaco/fresco-ui@7.0.0
  - @codaco/app-i18n@0.2.0
  - @codaco/shared-consts@6.1.0
  - @codaco/interview@9.1.0
  - @codaco/tailwind-config@1.5.0
  - @codaco/protocol-validation@14.0.0
  - @codaco/network-exporters@3.0.0
  - @codaco/art@0.1.5
  - @codaco/protocol-utilities@4.1.0

## 8.2.4

### Patch Changes

- 83c17e7: Fix "Must be unique" accepting a duplicate value for a number variable. A number typed into an interview form was compared as text against the numbers already stored on the other alters, so an Alter ID that another alter already held passed the check and the duplicate was added. The same mismatch let a "same as" or "different from" rule misjudge a number answered on an earlier stage. Number values are now compared as numbers wherever a rule reads what the network already holds.

## 8.2.3

### Patch Changes

- cead6fc: Correct empty date field text colors in Safari so placeholders use the intended neutral theme color.
- 77c3736: Replace the interview text-size choices with an accessible percentage input that supports plus and minus controls, arrow keys, and direct entry.
- Updated dependencies ([080d355](https://github.com/complexdatacollective/network-canvas-monorepo/commit/080d355e7bb30b7d9cf7c8653582a81103b6b8b5), [cead6fc](https://github.com/complexdatacollective/network-canvas-monorepo/commit/cead6fca6412f9322403896d09606bfcb1be1e58), [77c3736](https://github.com/complexdatacollective/network-canvas-monorepo/commit/77c37364a043f12fa38d97ec0004514c77636b88), [0584c69](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0584c69b1b210e533c1a18d7456a7808934989e7))
  - @codaco/fresco-ui@6.3.0
  - @codaco/interview@9.0.1

## 8.2.2

### Patch Changes

- a6f0723: Keep screen preview images available when the installed Architect or Interviewer app is used offline.

## 8.2.1

### Patch Changes

- 2f8fcdc: Make app updates reliable without reloading open work automatically. Fresh launches now activate an available update before the interface appears, updates found after rendering wait for an explicit install action, and the post-reload state reliably links to the release notes.
- Updated dependencies ([2f8fcdc](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2f8fcdc0c202678060501d2942645462c9cca77b), [301e8fe](https://github.com/complexdatacollective/network-canvas-monorepo/commit/301e8fefdf74b563545ef9c1ac3a0dd098a14bbc))
  - @codaco/fresco-ui@6.2.0

## 8.2.0

### Minor Changes

- c37a801: Applications now derive their protocol schema compatibility from the interview runtime they embed, instead of hard-coding a version number, and each application can upgrade stored protocols when a future schema version ships.

  - `@codaco/interview` exports its supported protocol schema version as `COMPATIBLE_PROTOCOL_SCHEMA_VERSION` (from `@codaco/interview/protocol-schema-version`). Fresco and Interviewer read it for import limits, stored-data migration, and interview payloads; Architect derives its own compatibility from `@codaco/protocol-validation` directly.
  - Interviewer checks stored protocols at launch. A protocol saved under an older schema version is migrated, re-identified under its new content hash, and its interview sessions and media follow it in a single transaction, with a notification when this happens. A protocol that cannot be migrated is left untouched, with a message directing you to repair it in Architect.
  - Architect upgrades a library protocol automatically when you open it, with a notification, leaving the protocol untouched if the upgrade cannot complete. Protocols made with a newer version of Architect are refused with an explanation instead of opening incorrectly.
  - Fresco's deployment migration targets the runtime's supported version rather than a fixed number, and an interview can no longer start from a protocol stored under a version the runtime does not support — it reports the mismatch instead.

  Nothing changes for existing data today — every stored protocol is already at the current schema version. This machinery exists so a future schema version change cannot orphan interview sessions or mislabel stored protocols.

### Patch Changes

- 17aeca4: Architect and Interviewer now load analytics and automatic error-reporting modules through the Network Canvas relay without Content Security Policy errors.
- b51ef59: Prevent malicious form field paths from modifying object prototypes while preserving dotted protocol variable identifiers and nested field namespaces.
- f4fd23c: Turning "Show sample protocol on home screen" back on no longer hides the Sample Protocol you already have. The one-click install card is only offered while the sample protocol is not installed; previously it took over the installed protocol's card, leaving it without its "Start new interview" and delete controls — and, after a reload, without any button at all.
- e9a6522: Network Composer's Undo and Redo controls now retain keyboard focus at the end of the history during interviews hosted by Interviewer.
- bd06a52: Interviews no longer lose their most recent answers when the app locks. If the device was put away while the last few answers were still waiting to be saved, and the security timeout had passed by the time the app was reopened, it locked before those answers reached storage and up to a few seconds of responses were discarded. Answers now reach storage within a fraction of a second of being given rather than waiting out a shared timer, and anything still outstanding is written the moment the app is put into the background — before the device can suspend it.

  **Breaking for hosts of `@codaco/interview`.** The engine no longer batches writes on the host's behalf, and no longer holds a change back while an earlier write is unresolved. `onSync` is called for every change as it happens, because only the host knows what one write costs. Hosts wrap their handler in the new `createDebouncedSyncHandler`, which rate-limits ordinary changes to one write per interval carrying the newest state, and never runs two writes at once. A host writing its own handler must not run its writes concurrently: a slow earlier write landing after a newer one would persist stale answers.

  `SyncHandler` gains a third argument. `immediate` marks the writes that must not be deferred — the participant exiting or finishing — and a batching host must stop batching when it sees it. `unloading` additionally marks the ones the document may not survive: it is being hidden or unloaded and may never run script again, so the host should use a transport that outlives it and must not queue the write behind a request that will die with it. Handlers that ignore the argument keep type-checking, so hosts that write eagerly need no change.

  The Shell also now flushes on `visibilitychange` and `pagehide`. A hidden document is not promised any more script, so anything still outstanding goes out while there is still a page to write from — which is what makes an installed PWA safe to put to sleep seconds after an answer.

- 06bc1e9: The quick add usage hint on name generator stages no longer promises that the box stays open when only one more item can be added during interviews hosted by Interviewer.
- e9a6522: Interviewer now handles protocol files, interview resources, validation failures, and hosted dialogs more reliably.

  - Damaged or unsupported protocol imports and storage failures provide actionable messages instead of archive, database, or stack-trace details.
  - Images, videos, and rosters are shared while in use and released after a protocol is replaced or deleted, preventing stale or decrypted resources from remaining in memory.
  - Required questions and invalid forms focus the first control needing attention, while interview confirmations restore focus to the control that opened them.
  - Family Pedigree references are validated before fieldwork, and application telemetry consistently reports the product version without participant-facing error detail.

- e9a6522: Interviewer normalizes older stored sessions at its read boundaries, so interviews containing nullish entity attributes continue to hydrate, synchronize, and export under the new sparse-attribute contract.
- 465c168: The storage and encryption status chips at the bottom of the Home screen now open their explanations on tap. They previously appeared only on hover or keyboard focus, so on a touch device the details — storage durability, the amount stored, and how to enable encryption — could never be read.
- 1105b8d: Fixed a stray "Confirm your identity" dialog that appeared over the Home screen after exiting an interview when a PIN, passphrase, or biometric is enrolled and "Require unlock when entering an interview" is enabled. The dialog could not be satisfied, blocked part of the screen, and wrongly offered the destructive "Recover by resetting" option.
- 4ea26a7: Fixed a race that could permanently lose answers added just before exiting an
  interview. Autosaves are debounced, so an answer given moments before exiting
  could still be waiting to save when the interview closed; resuming promptly
  then loaded the session without it, and the next screen change saved that
  stale copy back over the stored interview. The interview runtime now writes
  any pending autosave as the interview closes, and Interviewer waits for
  in-flight session writes before loading a session, so a fast exit-and-resume
  always shows — and keeps — every answer.
- 3b2f3be: The Home status row now shows the "Not encrypted" indicator before app security has been set up. Previously a fresh browser tab — which stores interview data unencrypted until a PIN, passphrase, or biometric is enrolled — showed no encryption statement at all; the indicator and its explanation now appear there just as they do when "No security" is chosen in the setup wizard.
- Updated dependencies ([c599dac](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c599dacf78b18efb7d0c5c5fad4d38644a57e775), [9a34469](https://github.com/complexdatacollective/network-canvas-monorepo/commit/9a3446969d5fcc7a3640d8eb5597f807a4fee810), [e3e7b2c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e3e7b2c9cfbc1758754afc0c3959c50ae6518363), [eec63f8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eec63f8c62bd6cfb030c88e396933c4aab384be9), [3e10128](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3e10128db1d1a1abc56f8293d66bf9f7dd75c722), [b51ef59](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b51ef598343c67c95edd4e165c0bac91a7a82571), [43c7746](https://github.com/complexdatacollective/network-canvas-monorepo/commit/43c774665b781cb5cc71acf8ed8c8ca48838ca64), [eb73319](https://github.com/complexdatacollective/network-canvas-monorepo/commit/eb7331942683e879328530e997e554fb12fef52a), [e08ebbf](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e08ebbf8547c2507f5f2a37f7cbab1169dd392cd), [88d7db0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/88d7db04ea3ba323be2fb18f55f6b11d6274740f), [ae3c616](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ae3c616ed4edc55c294be9097e4ae724b249601e), [e9a6522](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e9a652266ef9ddfa7fc42de1c8123bd7011c52a1), [23d0fab](https://github.com/complexdatacollective/network-canvas-monorepo/commit/23d0fab63d4de8da1ba3574cb151ac1c76580d9a), [59f131c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/59f131c2af206c8b1f668b90edf21fbcb3b0b7b7), [06bc1e9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/06bc1e991df40ab3e115da361cfe0ebfe391bbd8), [bd06a52](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bd06a5256b64b82b2718c15b6d3bc825b4ba95c5), [7ca985f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7ca985fe57ca03dda02a96a6013c5dac55dc0123), [c78135c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c78135cd461d1e482ce248b1eb6337359bafc189), [dcbc7aa](https://github.com/complexdatacollective/network-canvas-monorepo/commit/dcbc7aad21ec995bf3a598eb5b208a681789eb4f), [4ea26a7](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4ea26a74dfab5bc02495bc8fa03c31aa5f987dad), [c37a801](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c37a801a3a0a8e6cc82fce3cfe64d031003af207), [0f20ff5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0f20ff594e3fd9b38f393d3d71e9f7bdcc078955), [4a4a9f4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4a4a9f49d4c449e09e07558a0032d6a3b8015743), [fdb3b56](https://github.com/complexdatacollective/network-canvas-monorepo/commit/fdb3b56440f6cad89a44718d24ff725be3bb5e15), [71baa6c](https://github.com/complexdatacollective/network-canvas-monorepo/commit/71baa6c3c376bc287958e5f06659daa1df617e08), [54650ab](https://github.com/complexdatacollective/network-canvas-monorepo/commit/54650ab4bb357d39db88a46f5c3ab8b82375f647), [469d404](https://github.com/complexdatacollective/network-canvas-monorepo/commit/469d4041bd1c86fbfc92eaf2a368f1689858bbd2), [a9825f4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a9825f4067cc6cddd08b64a76e8d88a4b96ae998), [1391fa8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/1391fa879011e988a1e8c250a4c80a96797d5d47), [f03b1e4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f03b1e45f425cf3c97ba2137765073a462ee9c9f))
  - @codaco/interview@9.0.0
  - @codaco/protocol-utilities@4.0.0
  - @codaco/protocol-validation@13.0.0
  - @codaco/fresco-ui@6.1.0
  - @codaco/tailwind-config@1.3.0
  - @codaco/network-exporters@2.0.0
  - @codaco/shared-consts@6.0.0

## 8.1.3

### Patch Changes

- 3c08169: Exporting from Safari on a Mac now downloads the archive straight to your Downloads folder. Safari on the desktop offers the same file-sharing feature as an iPhone or iPad, so Interviewer had been handing the archive to the macOS share sheet and asking which app should receive it — a detour for a file that only needed saving to disk. The share sheet is now used only on iOS, iPadOS, and Android, where there is no downloads folder to save to.

## 8.1.2

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

## 8.1.1

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

## 8.1.0

### Minor Changes

- 7d5c062: Exporting interview data now runs in a single guided dialog. Tapping Export
  shows build progress (with the option to cancel), then presents a Save, Share,
  or Download action matched to your platform — replacing the separate "Save
  export" toolbar button and its notification. Interviews are still marked as
  exported only once the archive is genuinely saved, and your selection is kept
  if you dismiss the dialog without saving.
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

- 8f06a93: Export archives are now built in a background worker, so the export dialog's
  progress animations stay smooth during large exports. Interview data is still
  read and decrypted only in the app itself; cancelling an export now also
  releases all partially built archive data immediately.
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
- Updated dependencies [ea589ec]
- Updated dependencies [48572ed]
- Updated dependencies [8ff0e2d]
- Updated dependencies [0bf9a05]
- Updated dependencies [c5f30fd]
- Updated dependencies [8ff0e2d]
- Updated dependencies [b95af22]
- Updated dependencies [66da138]
- Updated dependencies [d985cd3]
- Updated dependencies [cd974f7]
  - @codaco/fresco-ui@5.0.3
  - @codaco/interview@7.1.0
  - @codaco/network-exporters@1.1.7
  - @codaco/tailwind-config@1.2.2
  - @codaco/protocol-utilities@3.1.1

## 8.0.0

### Patch Changes

- cd88c3e: Architect 8 and Interviewer 8 are now stable releases. Future app versions follow standard semantic versioning and deploy to production when the Version Packages release PR is merged.
- Updated dependencies [fde9bb4]
  - @codaco/fresco-ui@5.0.2
  - @codaco/interview@7.0.2

## 8.0.0-beta.12

### Patch Changes

- Boolean questions now show an option in red once it is selected, where the protocol marks that option as a negative response.

## 8.0.0-beta.11

### Patch Changes

- When generating synthetic sessions fails, the reason is now readable. A
  protocol whose validation rules cannot all be satisfied lists each clash on its
  own line, naming the variables involved and what conflicts, instead of running
  the whole explanation together into a single unbroken line.

  Any generation failure now stays on screen until you dismiss it, rather than
  timing out while you are still reading it. A protocol with many clashing rules
  no longer grows the message taller than the screen, which used to carry its own
  heading and close button out of view: the list of clashes now scrolls within the
  message, and can be scrolled from the keyboard as well as the mouse.
  Conflicts on locally scoped variables with the same ID now remain distinct as
  the message updates.

  A failed generation also no longer leaves part of a batch behind. Most protocols
  whose rules cannot be satisfied are refused before anything is saved, but a
  protocol can pass that check and still run out of usable values part-way through
  a batch, or fail to save one. Every session written during a failed batch is now
  removed — including the one being written when the failure struck — so the number
  of synthetic sessions shown always matches what is actually stored, and
  generating again cannot quietly leave you with a half-finished duplicate set.

- Generating or deleting synthetic sessions could sometimes leave the Synthetic
  data screen showing a stale protocol list and session count if the screen
  couldn't refresh right after the action finished. Generating gave no
  indication anything was wrong; deleting was worse — it could show a
  "Deleted" success message while also reopening the delete confirmation with an
  unrelated error, even though the sessions had already been removed. Both cases
  now tell you clearly when the refresh itself is what failed, so you know to
  reopen Settings rather than trust an out-of-date count.

## 8.0.0-beta.10

### Minor Changes

- Finished interviews can now be reviewed without saving changes, or marked
  unfinished when further editing is needed.

### Patch Changes

- Bring the Import a protocol card to the front when a protocol file is dragged
  over Interviewer, and improve the card's text and icon scaling on smaller
  screens.
- The installed app's icon is now optically centred, correcting a slight rightward
  lean, and renders at a consistent size whether the app was installed from Safari
  or Chrome.
- Interview text now scales smoothly with your screen size — comfortably compact
  on smaller screens and larger on wide or high-resolution displays.

## 8.0.0-beta.9

### Minor Changes

- Synthetic sessions now pick people from a protocol's actual rosters. Previously,
  a roster screen generated invented people, so test data never lined up with the
  roster file and that mismatch carried into every later stage. Generated sessions
  now draw from the real roster rows, and a stage that also allows adding people
  manually gets a mix of both. Where a side panel filters its roster, generation
  draws only from the people that panel would actually show. A roster that loads
  but has no rows — or whose panel filters out everyone — now generates an empty
  roster stage rather than inventing people. Protocols whose roster files are
  missing or unreadable still generate as before.

### Patch Changes

- Keep the case ID form stable when starting an interview on short tablet viewports, with compact responsive spacing and a focused backdrop that preserves the surrounding protocol deck.
- Animate the resume-last-interview notification out while entering a case ID for
  a new interview, then bring it back when returning to the protocol card.
- Clarify that interview data is stored locally on this device and encrypted there when app security is configured, whether Interviewer is open in a browser tab or installed as an app.
- Preserve the existing analytics preference when app security is enabled from
  Settings, and keep mandatory setup available after the optional wizard is
  exited without choosing a security method.
- Replace the startup loading ring with the same large Network Canvas spinner used by Architect for a consistent first-load experience.
- Preserve SVG image types when importing protocol assets so responsive canvas backgrounds display correctly.
- Let browser users enable app security from the Security settings with the Get
  started wizard. Settings-launched setup preserves existing data if it is exited
  after a device lock has been created.
- Fix the update dialog so Install and reload opens the new version immediately and shows progress while the update is applied.
- Use a consistent authentication and recovery dialog throughout Interviewer, avoid a duplicate identity check when refreshing an active interview, and suppress destructive recovery while an interview is protected without blocking biometric passphrase recovery.

## 8.0.0-beta.8

### Patch Changes

- Show a numeric keyboard for number entry on iOS and Android.
- Warn clearly when unexported interview data is at risk in Safari or Firefox,
  while using a calmer notice for low-risk Chromium storage and matching the Install
  action to each warning level. Persistent storage is now requested after the first
  user interaction instead of during page load.
- Keep interview prompts, Quick Add fields, and newly added nodes visible above Safari chrome and the iOS software keyboard.

## 8.0.0-beta.7

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

- Fix roster name generator stages failing to load roster data in Interviewer.
- Load the newest app shell on fresh online launches while preserving the precached offline startup path and keeping in-progress interviews on the active offline-safe shell.
- End-to-end test suite and the fixes it surfaced:

  - Settings → Synthetic data now re-queries protocols when the tab is selected, so a protocol imported moments before Settings was opened becomes selectable without closing and reopening the dialog.
  - The Security tab no longer shows the step-up "require unlock" toggles and auto-lock timeout before a vault is configured — those controls were inert (and discarded on enrolment) without a secured, unlocked vault.
  - The authenticator/device-reset UI now treats an unconfigured device the same as an explicitly unsecured one: it reads "Device lock" / "Reset device" rather than "Authenticator" / "Revoke device lock" when there is no lock to revoke.
  - Added `data-testid` hooks to app chrome (protocol deck import, DataView toolbar/resume, settings trigger, synthetic controls, new-session form, interview-complete, lock/unlock forms, ambient background) to support the new end-to-end suite.

- Use responsive shared dialogs throughout Architect while preserving Interviewer's purpose-built home modal sizing.

## 8.0.0-beta.6

### Patch Changes

- Improved the animated background on Interviewer screens so lights drift in and wrap smoothly without leaving long empty gaps.
- Improve the Interviewer start screen on narrow displays by compacting the header
  brand and footer status indicators.
- Interviewer now lets users view and copy protocol validation errors when an import fails, making it easier to request support with the relevant details.
- Fix protocol import in Safari installed apps by moving Interviewer's import card onto a mounted `react-dropzone` file input, matching Architect's working file-picker pattern. The import card still supports click, keyboard activation, and drag-and-drop, but no longer relies on an ephemeral input created only when the card is clicked.

## 8.0.0-beta.5

### Minor Changes

- Saving an export no longer asks you to confirm that the file downloaded. On desktop Chrome and Edge, "Save export" now opens the standard Save-As dialog and the app knows the file was written; on iOS, Android, and Safari the share sheet is used as before; other browsers download the archive directly. Interviews are marked as exported automatically from the save outcome.
- Refine the start and data screens on tablet, especially in portrait:
  - Harmonise the top-bar view switcher, settings and lock buttons, and the protocol deck's navigation into one consistent translucent "glass" style.
  - Fix the "resume last interview" pill overlapping the view switcher and the protocol cards in portrait.
  - Reduce the page margins on smaller tablets in portrait so content has more room.
  - Widen the settings dialog and let its sections reflow responsively; the settings navigation now uses a tabbed layout.
  - Stop the data table's rubber-band overscroll, and give the data search field and status filter the same glass treatment.
  - Fix a Chrome-only issue where the import-protocol card's background blur did not render.

### Patch Changes

- Protocol cards on the start screen no longer condense or clip the study name when a card is selected. The name now always renders in full, and the description shrinks (or hides entirely) when the card is short on space — previously it was the other way around, so selecting a card could squeeze a long study name into a single clipped line. Card text also no longer scales below a legible minimum size on small windows. On small windows the "enter a case ID" step now scrolls inside the card instead of pushing the Start interview button out of view.
- Switching to another tab or app and back no longer locks the app on its own. Locking is now governed solely by the "Auto-lock after" inactivity timer in Security settings: the app locks only once it has been left unattended for the period you configure. Time spent with the app in the background still counts toward that timer, so an idle session locks on schedule even if it was hidden the whole time.
- Fix data export failing with "Permission denied" on desktop Chrome. When the browser reports that file sharing is available but the system share sheet then refuses the file, the export now falls back to a normal file download instead of failing.
- Fix the band of empty background around the screen edges when Interviewer is installed to the home screen (as a PWA) on iPad. In standalone display mode the app was sizing to an area that stopped short of the screen (leaving the backdrop showing below the interface) and reserved the top safe area app-wide (leaving a band above the interview navigation). The app now fills the full visible viewport and renders edge-to-edge, so backgrounds reach every edge while on-screen controls stay clear of the status bar and home indicator.
- Fixed protocol import on Safari: selecting a `.netcanvas` file from the file picker now imports correctly, including when Interviewer is installed as an app (Add to Dock). Previously the picker could silently fail because Safari discards a file input that isn't part of the page while the picker is open.
- Improved the storage-durability indicator for Safari. The app now re-requests persistent storage on your first interaction — Safari grants the request silently based on interaction history, so asking only at startup was routinely denied — and the indicator updates immediately when a grant lands. When running as an installed app, an ungranted request now shows as a calm "Storage best effort" note instead of a warning: installed-app data is kept separate from browsing data and is not subject to the browser's routine cleanup, and there is no further install action to take.
- Replace the encryption and storage status hints on the start screen with proper tooltips, so they're reachable with the keyboard and readable by screen readers, not just on mouse hover.

## 8.0.0-beta.4

### Minor Changes

- Replace the update toast with a version indicator that shows when an update is available or has just been applied, and displays the release changelog. Updates now apply automatically on a fresh load when no work is in progress.

### Patch Changes

- Close data-loss and setup gaps surfaced by the pre-release audit follow-up:

  - **Export marking:** on browsers that can't report whether a file download completed (the object-URL fallback), the app now confirms the archive was saved before marking sessions as exported — a cancelled or blocked Save-As can no longer falsely mark a session "exported" (which fed the filter-to-exported → bulk-delete data-loss path).
  - **Setup wizard:** a failed same-method re-enrolment (e.g. cancelling the biometric prompt after the old vault was revoked) can no longer finish the wizard claiming a lock mode the vault doesn't actually hold.
  - **Lock screen:** a destructive "reset app data" confirmation opened while locked is now dismissed when the app unlocks, so it can't survive the lock boundary and fire over Home.

- Fixed an issue where double-clicking multiple .netcanvas files at once (with the installed app set as the file handler) could silently drop every file if even one of them had been moved or deleted since being opened. Readable files are now imported as normal, and a notification now appears if any of the files couldn't be read.

## 8.0.0-beta.3

### Patch Changes

- On the home screen, clicking a protocol or sample card no longer starts an interview or installs the sample by itself — those actions now require the card's own button. Clicking a card still brings it to the centre of the deck.
- Importing a protocol is quicker: drop a `.netcanvas` file straight onto the import card on the home screen, or click the card to choose a file. The card now carries the note about authoring protocols in Architect, and the separate import dialog it used to open has been removed.

## 8.0.0-beta.2

### Major Changes

- Renamed the app from "Network Canvas Interviewer 8" to **Network Canvas Interviewer** (package `@codaco/interviewer`).

  **This update resets the app's local data.** The internal storage identity changed, so an existing installation starts fresh after updating: previously imported protocols and collected sessions are not carried over, the encrypted vault must be set up again, and any biometric unlock must be re-enrolled. **Export any sessions you need before you update.**

### Patch Changes

- Stopped animating the decorative background during an interview. The interview screen already covers it completely, so the animation was running unseen — pausing it while a session is open reduces battery use on long interviews.

## 8.0.0-beta.1

### Patch Changes

- Fix a batch of pre-release bugs found by a full-app audit (issues #751–#764):
  - **Analytics no longer contacts the PostHog relay when opted out** (#751). The client is constructed only once analytics is enabled; opting out keeps the app fully offline. Opting in at runtime still lazily initialises without a reload.
  - **Sessions are marked exported only after the archive is actually saved** (#752). Previously `exportedAt` was set when the archive was built in memory, so a cancelled/abandoned share left sessions falsely marked exported — a data-loss risk when later pruning "exported" records. The table now refreshes on a confirmed save.
  - **Date-range filters are computed in local time** (#753), so "today" and deep-linked `started*` ranges select the right sessions in every timezone (previously off by the UTC offset west of UTC).
  - **A finished interview can no longer be silently un-finished** (#754, #756). `finishedAt` is written only by `markSessionFinished`, and `updateSession`/`markSessionFinished`/`markSessionsExported` now serialise per session id, so a trailing autosave can't revert a completion/export marker or drop concurrently-written network data.
  - **React render-error reporting actually reaches PostHog** (#755): the reporting error boundary is now mounted inside `AnalyticsProvider` (with a bare outer boundary for provider-construction crashes).
  - **Two protocols that share a name but differ in content each keep their own card** (#757) and stay independently startable and deletable; the just-installed card stays centred.
  - **Re-importing a protocol with changed assets no longer serves stale asset bytes** (#758): the asset cache key changes on re-import and superseded object URLs are revoked.
  - **The setup wizard can't finish with the wrong lock method** (#759): changing the method after configuring one re-runs enrolment for the newly chosen method.
  - **Exporting an in-progress session no longer reclassifies it as complete** (#764): completion status is derived from `finishedAt`, independent of export status, so its Resume affordance and counts stay correct.
  - **A corrupt or newer-version vault record no longer routes to fresh setup** (#762), which would overwrite the only wrapped copy of the encryption key. A dedicated recovery screen offers a reload (a newer app version may read it) or an explicit, confirmed reset.
  - **An in-flight unlock can't install a stale key after a cross-tab revoke/re-enrol** (#763): the vault is re-checked after the key is derived (relevant to biometric unlock, whose OS prompt can stay open for a while).
  - **Open dialogs no longer survive an app lock** (#760): a destructive confirm (delete protocol, reset device) or a pending step-up is dismissed when the app locks, so it can't be actioned on unlock with stale context.
  - **Back from Home no longer re-enters a just-exited interview** (#761): the interview's history guard consumes its pinned entry on exit and reuses it across lock/unlock rather than stacking duplicates.

## 8.0.0-beta.0

### Added

- Motion-native protocol deck — the protocol carousel was rewritten from Swiper
  to a motion-native implementation (velocity-aware drag snap, mouse-wheel
  stepping, keyboard navigation), with the new-session case-ID form rendered
  inline in the active deck card.
- Protocol import surfaces a pending card with live progress, and the sample
  protocol installs directly from its deck slot, morphing in place
  (sample → installing → installed).
- Setup wizard gained an explicit "no security" enrollment path.

### Changed

- Long protocol names use a stepped heading scale with a fitted whole-line clamp,
  so the card footer can never be pushed off the card.
- Swappable card regions (footer, controls row, requires-internet pill) share one
  coordinated transition.
- New onboarding / secure-data glyphs and visual refinements.

### Fixed

- Generating or deleting synthetic data in Settings now refreshes the data
  table immediately, instead of leaving it showing stale sessions.
- App error boundary now shows a non-dismissible modal with a reload action.
- Dexie remains usable after a web storage revoke.
- Privacy/analytics copy clarified; toggle thumb styling corrected.

### Removed

- `swiper` dependency.
