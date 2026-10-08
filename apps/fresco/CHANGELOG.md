# fresco

## 4.3.0

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
- b7a4711: The Fresco sandbox's sign-in page and dashboard no longer lose their
  interactive behaviour.

  The Netlify badge and the sign-in page's sandbox-credentials notice each decided
  whether to render by reading the `SANDBOX_MODE` environment variable from the
  browser, where it does not exist. The server rendered both and the browser
  rendered neither, a disagreement React resolves by discarding the page it was
  handed: on the sandbox, every element below the failure stopped responding and
  the notice carrying the demo sign-in credentials disappeared as the page
  finished loading.

  Both are now rendered by the server only when the deployment is a sandbox, so
  the decision is made where the variable exists.

- c4c3fc4: Fresco's own error reports are more reliable. A page that fails to load now
  reports the identifier the server recorded alongside it, so a failure can be
  traced to its cause. Deployments whose settings cannot be read are told that
  error reporting is off rather than being left to assume it is working. A
  deployment whose cache directory is a fresh mount no longer reports a failure of
  its own for it, and one that genuinely cannot write there now says so as it
  starts rather than only failing later.
- 1084cfa: Passkey sign-in and registration now use version 14 of the SimpleWebAuthn
  libraries. Devices and password managers that support post-quantum (ML-DSA)
  passkeys can now register one with Fresco, and existing passkeys keep working
  without any change.
- d9111d1: When interviews are frozen after completion, a save that was already under
  way as the interview finished (for example, from a second tab) could still
  overwrite the finished interview. Such a save is now declined, like any other
  save to a frozen interview.
- ad9d1df: Interview analytics now follow their design in three places. `interview_started` is no longer lost when the analytics client arrives after the interview first renders, which happened on every host: stage navigation is recorded from the moment a client is available. `interview_finished` is reported once the host has finished the interview, instead of when the finish screen is reached, so a cancelled or refused finish no longer counts as a completed interview. `form_validation_failed` no longer carries the rendered validation messages, which can contain protocol-authored text; each invalid field is reported by its position and input type only.
- 0313691: Interview analytics no longer send codebook type keys, which a protocol author
  chooses and can make readable. `node_added`, `edge_created`, `node_binned` and
  `node_rebinned` now report the type's position in the codebook
  (`node_type_index`, `edge_type_index`) in place of `node_type` and `edge_type`.
- 96405a2: `@codaco/interview/protocol-payload` exports `currentProtocolToPayload` on its own. A host whose server code runs directly under Node, without a bundler, can import the converter from it without loading the rest of the interview contract.
- 4e6916e: The interview `Shell` accepts any posthog-js client that provides `capture`, `captureException` and `register`, rather than only the `PostHog` class of the default `posthog-js` entrypoint, so a host built on another posthog-js build (such as `posthog-js/dist/module.no-external`) can pass its client without a cast. The runtime's own instance, used when a host passes no client, now loads that no-external build as well: it carries no remote script loader, so it works under a host's `script-src 'self'` policy.
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

- 78e0a46: The dashboard navigation bar no longer disagrees with the page the server
  sent.

  The bar decided its starting position from the researcher's "reduce motion"
  setting, which the server cannot know when it writes the page. A researcher
  with that setting enabled was therefore sent one starting position and then
  produced another, a disagreement React reports as one it will not reconcile.

  Fresco already applied the preference for every animation in the dashboard, so
  the bar had no need to consult it a second time. Reduced motion still means the
  bar appears without sliding into view.

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
- 6f2b0d2: A protocol whose stored design cannot be read is no longer treated as if it
  were empty. Fresco used to start interviews for such a protocol with no stages,
  export its interviews without the protocol's variable definitions, and generate
  synthetic interviews from it that held nothing. It now refuses each of these
  instead. Participants see an error rather than an empty interview. Recruitment
  links and synthetic data generation report that the protocol could not be
  read. An export that includes the protocol stops with an error, and the
  interview data API returns an error. Each refusal is recorded in error
  tracking.
- Updated dependencies ([5339bf8](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5339bf83bd791585b0002381ec2e52792f7e0697), [263c5ef](https://github.com/complexdatacollective/network-canvas-monorepo/commit/263c5ef39a5fb92be91484d41b08ea7dda525fa3), [c5dc35b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c5dc35b889d75c4f21657ce473ef6ec030660e24), [08fd0f7](https://github.com/complexdatacollective/network-canvas-monorepo/commit/08fd0f7dc2c1a7b757b2caf64ae68aacaaf31572), [4d8ce20](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4d8ce20d1a2a173579d4ac76dfa519126e3d9725), [8e9852f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/8e9852f096c250585d805fa72e0a100d1a682093), [e6f137b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e6f137b276214e418748bc027afcad797f817ad2), [c7aa307](https://github.com/complexdatacollective/network-canvas-monorepo/commit/c7aa30724b3050d29c4f4f80cf4a56847b3b193f), [ee4ad52](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ee4ad52b14e081d25f883d9d170454932749d5ab), [34965ed](https://github.com/complexdatacollective/network-canvas-monorepo/commit/34965ed87bd69764bfb48afdac07de34cfe923d3), [d0c3ada](https://github.com/complexdatacollective/network-canvas-monorepo/commit/d0c3ada1469ecb345d920e5af8d4fb4e07236a73), [6dc47ba](https://github.com/complexdatacollective/network-canvas-monorepo/commit/6dc47ba0ead3dca990c44ee5be168dacc9730799), [3d0a7d1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3d0a7d1f0a04bd98a3b8f5c82fbf912e1db9597c), [747ee33](https://github.com/complexdatacollective/network-canvas-monorepo/commit/747ee3366831b85231a17a3a8173404af46c3d3a), [489bf51](https://github.com/complexdatacollective/network-canvas-monorepo/commit/489bf5173aad4d29e79c6a2a29d018223e369031), [bff61d5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/bff61d58f17fbb7b021e6591da9575ed4c12cc16), [649f7a3](https://github.com/complexdatacollective/network-canvas-monorepo/commit/649f7a37175c0910a74393ef95c2656c32a73bd4), [b84263e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b84263ec1076dc14e407b4919f5fdbaae45c6883), [62617a9](https://github.com/complexdatacollective/network-canvas-monorepo/commit/62617a9c21d7e6e200adc162417090a522fac1e6), [ad9d1df](https://github.com/complexdatacollective/network-canvas-monorepo/commit/ad9d1df75297d9c64abd1d985f4769302a756c79), [0313691](https://github.com/complexdatacollective/network-canvas-monorepo/commit/031369103585699bfe24d77521995bc5c8c92fff), [96405a2](https://github.com/complexdatacollective/network-canvas-monorepo/commit/96405a2396db787e32a530d5c732f10c0b403347), [4e6916e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/4e6916e140d5d0d568ceea140b1054ba8f04cabb), [5b12f3b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5b12f3b977d4244c398301541d978d825f53ea13), [216e8c4](https://github.com/complexdatacollective/network-canvas-monorepo/commit/216e8c4e1cc63357f121d65150851536996ef3af), [f32135f](https://github.com/complexdatacollective/network-canvas-monorepo/commit/f32135fd036f07157198728377dfdbeb30dff747), [56e16d0](https://github.com/complexdatacollective/network-canvas-monorepo/commit/56e16d0de03049200559dbf6bf07671689e4d99b), [dfcbc73](https://github.com/complexdatacollective/network-canvas-monorepo/commit/dfcbc7382eedbdbfc83aa06e8141d1e04ffdf4e1), [a6c5e2b](https://github.com/complexdatacollective/network-canvas-monorepo/commit/a6c5e2b222f09948cd0bf1e32fbde182a7248900), [3093df5](https://github.com/complexdatacollective/network-canvas-monorepo/commit/3093df504bae4a945b77a7441aefd04c6abb4a7f), [2659fb1](https://github.com/complexdatacollective/network-canvas-monorepo/commit/2659fb14d0090fc7040f48da515db7b43385b549), [fb4b061](https://github.com/complexdatacollective/network-canvas-monorepo/commit/fb4b061a341f26aef772842ce7dd934dfdb27a56), [7e225bf](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7e225bfd84b6563b47b9d84bffcf1a2b79754314), [5dd537e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/5dd537e08de27371e14b052a5a461992e15ab559), [7d7b84a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/7d7b84a6031a10d7147292c4b043b1ff50c566f6), [6a88e57](https://github.com/complexdatacollective/network-canvas-monorepo/commit/6a88e57c53a947d158486f6544c84334fe115b64), [968624e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/968624e79eb0b4ab7f776cfc505118d6897dcdbe), [810604e](https://github.com/complexdatacollective/network-canvas-monorepo/commit/810604e8e3d5ecfd2d45b38619488660dd69f538), [0554def](https://github.com/complexdatacollective/network-canvas-monorepo/commit/0554def9c17db95f4d61a360a3bf068b3d391994), [254a887](https://github.com/complexdatacollective/network-canvas-monorepo/commit/254a8878ce934e8ebe03b0d7037cb2e98b1d9b0f), [b8405ea](https://github.com/complexdatacollective/network-canvas-monorepo/commit/b8405ea8126f0bc585b73a72f0d0b9b2982380e2), [513d87a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/513d87a73804d2b1dcc96b06e6e138df198bbc77), [73b2af6](https://github.com/complexdatacollective/network-canvas-monorepo/commit/73b2af6e7711638360d58c644f985319ab8f1834), [d8c5523](https://github.com/complexdatacollective/network-canvas-monorepo/commit/d8c552308b298a144b9801c0df5347c248be4fc2), [16b1178](https://github.com/complexdatacollective/network-canvas-monorepo/commit/16b11782aa5f22fb3efbe55f46612d37c5bbb827), [76722bb](https://github.com/complexdatacollective/network-canvas-monorepo/commit/76722bb9d8f3d3e7e5eca94e802f48584ef37e8a), [e5f6a9a](https://github.com/complexdatacollective/network-canvas-monorepo/commit/e5f6a9ac0760f4a67ba353996b43327a5d1b0855))
  - @codaco/fresco-ui@8.0.0
  - @codaco/interview@10.0.0
  - @codaco/protocol-validation@15.0.0
  - @codaco/app-i18n@0.3.0
  - @codaco/network-exporters@4.0.0
  - @codaco/protocol-utilities@5.0.0
  - @codaco/shared-consts@6.2.0
  - @codaco/tailwind-config@1.5.1

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
