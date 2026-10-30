# @codaco/documentation

## 0.7.0

### Minor Changes

- The documentation now covers dynamic values: values the interview fills into
  the text participants read, such as the participant's name, an earlier answer,
  the labels of the nodes a census question asks about, or today's date. A new
  Dynamic Values page explains how to insert a value in Architect with the
  syringe button or by typing `{`, how a node's label is chosen (on a Family
  Pedigree, the label its family tree shows), which values
  each kind of text can show, why a value
  that can be missing needs a version of the text for when it is missing, how to
  give the text a version for each answer or for each plural form of a number,
  how participants see values, and that every translation must show the values
  its default-language text shows. It also lists the problems protocol
  validation reports. The Prompts, Translating Your Protocol and protocol schema
  pages link to it, and the schema 9 notes list dynamic values among what is
  new.
- The documentation now describes encrypted attributes as a standard feature
  of schema 9, not an experiment. The Anonymisation interface page no longer
  says it must be turned on from Architect's Experimental Features page, which
  Architect no longer has, and the Interfaces, Variables and Export Data Dictionary
  pages no longer call it experimental. The Anonymisation page also now gives
  the exported placeholder for an encrypted value as `ENCRYPTED`, the string
  exports actually write.

  The Anonymisation page now explains how answers are protected: one key for
  each interview, derived from the participant's passphrase with PBKDF2-SHA256
  (600,000 iterations, with a salt derived from the interview's id) and used
  with AES-256-GCM; each answer bound to the person and question it belongs to,
  and padded; and how a passphrase entered again is checked against the answers
  already encrypted, without anything about the passphrase or the key being
  stored. It explains that a participant
  confirms the passphrase when choosing it, that it must be at least 8
  characters long unless the stage sets its own minimum, which replaces the
  default even when shorter, that a maximum shorter than 8 lowers the default
  minimum to match, and that a forgotten passphrase cannot be recovered by
  anyone. The export
  section now says that only answers saved encrypted are replaced with
  `ENCRYPTED`. Another new section explains that skip logic and filters can't
  compare the answers to an encrypted attribute, except in a panel over an
  external data file, but can still check whether it is answered. It explains
  that upgrading removes the rules that compared these answers and keeps the
  others, that a stage whose skip logic loses all its rules is always shown, so
  one that was shown only when a removed rule matched may appear for the first
  time, and how the rules that remain may match differently. It also explains
  that a list sorted by an encrypted attribute is sorted by the participant's
  answers only once the passphrase is entered.

  The schema information page says that schema 9 keeps a protocol's
  `experiments` setting, for features released within a schema version, and
  that encrypted attributes are no longer one of them. It explains that
  upgrading a schema 8 protocol removes the Encrypted Attributes experiment,
  and what that does to its encrypted attributes. If the experiment was on, they stay marked and
  answers are encrypted, while the interviews already collected stay with the
  schema 8 protocol and keep the answers the experimental version protected. If the
  experiment was off, the attributes are unmarked, so they keep being collected
  without encryption.

- The documentation covers the Finish Screen, the stage that ends every
  interview. A new interface page explains its two ways of finishing
  (participants confirm, or the interview finishes automatically), how to write
  its closing text and finished text, the words participants read while they
  finish, and how to choose the outcome it records. It also explains how to end
  a protocol with more than one Finish Screen, such as a separate ending for
  participants who are not eligible, how Finish Screens stay together at the end
  of the protocol, and the text Architect needs before it will download a
  protocol. The data export and data dictionary pages describe the new
  `networkCanvasFinishOutcome` column and `nc:finishOutcome` attribute. The
  skip logic, translation, preview, schema 9, Fresco and Interviewer pages are
  updated to match, including choosing a later Finish Screen as a skip
  destination, the Fresco API's new `finishStageId` and `finishOutcome` fields
  and the removal of Fresco's separate "interview finished" page.
- The documentation now says that current releases of Architect, Fresco and
  Interviewer are backwards compatible with protocols made for earlier schema
  versions. Architect opens and edits them without upgrading them, and lists
  schema 8 protocols in its library with their own menu. Fresco and Interviewer
  run schema 8 protocols as they are, mark them as older protocols, and include
  them in Interviewer's single offline status. The compatibility table no longer
  says that the current apps migrate every schema 8 protocol to schema 9, and the
  light bulb and obsolete-protocol guidance is now labelled as applying to
  Interviewer Classic.
- The documentation now says that only Architect upgrades a protocol to schema 9,
  and only when you choose to. Opening a schema 7 or schema 8 protocol in
  Architect offers to upgrade it, which makes an upgraded copy and leaves the
  original unchanged, or to keep editing it as schema 8 in the previous version
  of Architect built into it. Fresco and Interviewer never upgrade a protocol to
  schema 9: a schema 8 protocol and its interviews keep running as schema 8. They
  still migrate a schema 7 protocol to schema 8 automatically when you import it,
  because that is how protocols made in the Classic apps move to them.

  The schema information, Migrating from the Classic Apps, Architect FAQ,
  Anonymisation, translation, glossary, Interviewer and Fresco pages are updated
  to match. The Fresco 5.0.0 upgrade notes no longer say that Fresco upgrades the
  protocols you have already uploaded, or adds a Finish Screen to them.

- The Dynamic Values page is now a Piped Text article at
  `/en/design-protocols/piped-text`, rewritten in the documentation's academic
  register. It sets out why network instruments pipe node labels and earlier
  answers into questions, the methodological precautions piping calls for, and
  how to insert piped values in Architect, with current screenshots of the insert
  menu, the value pills, missing-value versions and the interview preview. The old
  URL redirects to it. The Building a Protocol tutorial now names the university
  in the Per-Alter Form question and both classmates in the Dyad Census prompt,
  the CEGRM tutorial explains the template's piped pedigree and "Something else"
  questions, and the glossary defines piped text.
- The documentation now covers translated protocols. A new Translating Your
  Protocol page explains how to choose the language a protocol is written in,
  add and remove languages, set the default language, find missing translations,
  translate in the translation table, which shows everything participants see
  beside its translation into each language, change the language a protocol's text is recorded as, for a protocol upgraded
  from an earlier version, preview each language, print every translation in
  the protocol summary, and how participants get their language. It explains
  that languages have no order and are always listed alphabetically, that a
  text needs a translation in at least one language and a missing translation
  is only a warning, that a translation must include the placeholders, such as
  a person's name or a number, that Network Canvas's English includes, and how
  participants are shown the best available translation of each text: in their
  own language or a close regional match, then in the other languages their
  browser lists, then in the default language, then in any language that has it.
  It explains that participants never see codebook names, and that Narrative
  legend labels, Network Composer edge type labels and Network Composer field
  labels are translated, and the Narrative and Network Composer pages say
  where each label is shown and that every Network Composer field needs a label.
  A new page documents the Language Chooser interface, including how to manage
  the protocol's languages from its editor in Architect. The preview, Fresco and
  Interviewer guides describe how an interview's language follows the
  participant's browser rather than a settings menu, and that the language is
  neither saved with the interview nor exported, and the schema 9 notes describe what the upgrade to schema 9
  does to a protocol's text. Pages that listed three interface languages now
  list all ten.
- The documentation describes schema 9 stages without introduction panels.
  The Per Alter Form, Per Alter Edge Form and Dyad Census pages explain that
  instructions for participants now go in an Information stage before the
  stage; an Ego Form keeps its introduction. The
  protocol-building tutorial, the translation guide and the schema information
  page are updated to match, including how upgrading a schema 8 protocol moves
  each panel into an Information stage.
- The documentation now covers protocol schema 9, which lets variables, node
  and edge types, and answer options be named in any language, with spaces and
  punctuation. The Variables page explains what a name can contain and which
  names Architect refuses because they would clash in exported data, including
  names that an export would write the same way. The roster
  tutorial explains the rules for column headings and values, and how to fix a
  roster that Architect refuses. The Data Export page and the Export Data
  Dictionary explain how export files and GraphML attributes are named, why some
  CSV values start with an apostrophe, what happens when characters are removed
  from GraphML files or columns are renamed, and how to open the UTF-8 CSV files
  correctly in Excel, R and Python. The compatibility table and other pages that
  named schema 8 as the latest version now refer to schema 9, and name the
  releases that run it: Architect 9.0, Fresco 5.0 and Interviewer 9.0. The Fresco
  upgrade guide has a section on upgrading to 5.0.0.

### Patch Changes

- The Anonymisation page explains that the explanation participants read is one
  text whose title is a heading at its start, and the schema information page
  says that upgrading a schema 8 protocol moves each Anonymisation title there.
- The dynamic values page explains that an Ordinal Bin or Categorical Bin set to tap to place can name the node being placed in its prompts, and that the prompt needs an "If not known" version for when every node is placed.
- Menu, select and combobox items now have a small gap between them, so a run of checked or selected items no longer merges into one block.
- The Family Pedigree page describes the interface as it now works. A new
  section, How the family is drawn, explains where a sibship's line of descent
  comes from, that donor, surrogate, step and adoptive lines run straight from
  symbol to symbol and cross without hops, and how a child adopted into a family
  shares the sibling line. The page explains how the view is framed and reset,
  how the add menu opens, that a new person is described one group of questions
  at a time with Skip, Continue, Back and Save, and which questions each kind of
  relative is asked: adoptive parents are not asked who carried the pregnancy,
  nor are adopted children unless the other parent is their biological parent, the twin question waits until a sibling shares whoever
  carried the person when that is known, and the person panel asks "Who carried the pregnancy?"
  once. It says that gender identity, where asked, must be answered and counts
  as a missing detail, describes the progress list, and explains that names in
  the stage's wording show as piped text. It covers **Participant or someone
  else** in additional person fields, the piped-text editor for the stage's
  wording, the Save and Don't know answers moving to the protocol's interview
  text, the name attribute's Required answer rule no longer being offered, and
  the step and in-law rule for birth parents of adopted children. American
  spelling is used throughout. Translating Your Protocol lists Save and Don't
  know among the interview text's buttons. Four screenshots show the add buttons, the
  first group of questions for a new parent, a drawn family and the progress list.

  Translating Your Protocol's stage wording table, and the Name Generator, Quick
  Add, Roster, Geospatial, Narrative and Sociogram pages, no longer list the
  words that became interview text: the message for a data file that could not
  be loaded, the search placeholder and no-results message, and the tooltips for
  pausing and resuming automatic layout. The Sociogram has no Words on the canvas
  section. The interview text list now includes these words and the new Search
  group.

- The documentation now explains where the words a participant reads come from, and how to change and translate them.

  Translating Your Protocol has a new section, Words Network Canvas supplies. It explains the two places these words live: stage wording, which is a setting of one kind of stage, and interview text, which is shared across stages and held by the protocol. It lists which stages have wording and what section of the stage editor holds it, says what the interview text holds (Back, Continue, Cancel, Done and Delete, validation messages for the rules a protocol uses, passphrase words, and form words), and says where each appears in the translation table. It also explains that conditional wording, such as a Sociogram's layout tooltips, is added when its setting is switched on and removed when it is switched off. The Adding languages section now says Architect fills in all of this supplied wording in each new language, and the page no longer says the interview's buttons and messages come only in Network Canvas's fixed languages.

  Each affected stage page now says what wording it holds and where to find it: the Finish Screen (the finish button, confirmation question, finished notice and finishing-failed message, which can now be changed), Name Generator, Quick Add and Roster messages, Geospatial messages, the Network Composer, Narrative and Sociogram canvas words, the Narrative Pedigree key, condition and snapshot words, and the Family Pedigree's participant wording (three groups of settings). The Anonymisation page explains where the passphrase words live. Field Validation now describes the validation messages as part of the protocol, one wording per rule.

  The Language Chooser, Fresco, Interviewer and Preview pages, and the schema 9 notes, are corrected to match: the Language Chooser has no visible heading, only a label read by screen readers, and the buttons and messages every stage shares follow your protocol's language, while only the interview's own built-in words follow the participant's language settings.

- The Language Chooser page explains that the screen's heading is part of the
  protocol: it starts with "Choose a language", is shown in the participant's
  chosen language, and is edited and translated in the stage editor's new
  Participant wording section.
- Translating Your Protocol is rewritten as a full article on localization. It
  now covers translation as part of instrument design, with references to the
  cross-cultural survey literature, and gains current Architect screenshots. It
  also corrects the Languages page's buttons: the pencil opens the translation
  table, and the two-arrows button changes a language's recorded language. The
  Building a Protocol tutorial gains a section that adds Spanish to the sample
  protocol, translates a stage and adds a Language Chooser; the CEGRM tutorial
  explains how to translate and adapt that instrument; and the rosters tutorial
  notes that a roster's values are the same in every language.
- The Narrative Pedigree article is rewritten to match the interface. It now
  describes the condition menu in the toolbar, the key that opens beside the
  family once a condition is chosen, each symbol and when it is shown, the path
  highlighted when the participant focuses on a person, the Clear focus button,
  snapshots, and keyboard and screen reader use. It sets out what is inferred
  under each inheritance pattern, follows the stage editor's sections in Architect,
  and gains two screenshots of the interview.
- The Family Pedigree page now finds the checklist's words where Architect shows them: in a Completeness checklist group of Participant wording, which appears only while the stage has a completeness requirement. Translating Your Protocol links there too.
- The Family Pedigree page explains that a second carrier, a second same-sex genetic parent and identical twins with different parents are now resolved by the newest answer, and says when the Gestational carrier attribute is left unset because someone else was recorded as having carried the person.
- The Family Pedigree page now explains that a sex at birth saved by mistake can be corrected from the person's own panel: the newest answer wins, the field says what saving will change, and saving removes the conflicting carried-pregnancy record or clears the other genetic parent's sex at birth.
- The Family Pedigree page explains that participants read the codebook's labels
  for the sex assigned at birth answers and the kinds of parent, which
  researchers can reword and translate but not leave blank, and that Architect fills in those labels
  in each language Network Canvas has wording for. Translating Your Protocol now lists those labels as a second text Architect
  fills in when a language is added, and says that changing the language a
  protocol's text is recorded as turns unchanged supplied text into the
  supplied text of the language chosen.
- The Family Pedigree page now explains Undo and Redo: what one step is, the keyboard shortcuts, when the buttons are unavailable, and that the zoom buttons sit in a small toolbar of their own.
- The Name Generator for Roster Data page explains the panel title above the
  roster's cards, and Translating Your Protocol lists it with the other text
  Architect fills in when a language is added.
- The warning color, used for warning tip boxes and the "migrate" status in the app compatibility table, shifts slightly toward red. It follows a hue change to the Neon Carrot brand color in the shared color palette used across Network Canvas.

  The "Collect data" section color is slightly lighter and less saturated, following a change to the Neon Coral brand color.

- The Family Pedigree interface page describes the redesigned interface. It
  covers how participants add and describe relatives, who the stage draws,
  generated labels and encrypted names, the person and relationship attributes
  the stage records, the wording, completeness and nomination prompt settings,
  and where a person's symbol comes from. It states the rule that derives which
  parent gave the egg or the sperm, and when it is unknown, and describes the
  optional relationship-to-the-participant attribute, its values and how to
  filter on it.

  The Narrative Pedigree page describes the interface as it reads the redesigned
  Family Pedigree. It explains that sex-linked inheritance follows sex assigned
  at birth, that an intersex person is never assumed to have one X chromosome or
  two, and that mitochondrial donation can be traced only in imported data.

  The Implementing CEGRM tutorial matches the bundled template's 14 stages. It
  asks about the condition and testing through nomination prompts, ends with a
  Narrative Pedigree, and marks non-kin people with a `non_kin` attribute. It no
  longer describes an attribute that nothing writes.

## 0.6.2

### Patch Changes

- The Anonymisation interface documentation now explains how to reach Architect's Experimental Features page (by adding `/protocol/experiments` to Architect's address), and the docs now call the setting by its label in Architect, **Encrypted Attributes**.
- The Fresco self-hosting guides now describe Garage as the storage bundled with the Docker deployment, in place of MinIO. The Advanced Deployment guide explains how to generate the two Garage values for your `.env`, which configure both Garage and Fresco's storage, and the Docker versions the bundled configuration needs. The FAQ for IT Departments now explains how to encrypt the bundled storage at rest. The guide also explains how to replace the storage access key. It warns deployments that already run the bundled MinIO that switching compose files does not move their files to Garage.
- The Getting Started guide for Architect now lists the Help-Seeking After
  Intimate Partner Violence template.

## 0.6.1

### Patch Changes

- The documentation search window now uses DocSearch 5, Algolia's refreshed
  search interface, with an improved results layout and better accessibility.
  Searching, the section badges on results and the keyboard shortcut work as
  before.
- Saving and backing up explains what happens when a protocol is open in more
  than one browser tab: the second tab can look through it read-only, and becomes
  editable when the first tab closes the protocol.
- Pages no longer re-render part of themselves on load. The footer's copyright
  year is now fixed when the site is published, instead of being read from the
  reader's device, which could disagree with the published page and force the
  browser to rebuild it.
- Update third-party dependencies to their latest minor and patch releases, including Base UI 1.8, next-intl 4.14, Motion 13.4, Lucide 1.49 and PostHog.
- Pages reached through an older link no longer fail to load. When the address
  does not name a documentation section, or the navigation data cannot be
  fetched, the page keeps its search box instead of showing an error.
- Add a Get Started article that points to the Updates page on networkcanvas.com and explains how each app is upgraded.
- The two DOI links on "Citing the Software" now resolve.

  Both were written as `https://doi:10.xxxx/…` rather than `https://doi.org/10.xxxx/…`.
  That address cannot be parsed as a URL — the part after `https://` reads as a
  host named `doi` on port `10` — so the Network Science citation link went
  nowhere and threw an error when the page tried to prefetch it, and the Social
  Networks citation displayed an address no reader could follow. Both now point at
  doi.org, matching the other citations on the page.

- The documentation site now honours the operating-system "reduce motion"
  setting.

  The animation library the site uses ignores that setting unless it is told to
  honour it, and the site never told it to, so until now headings, paragraphs and
  sidebar items animated into place for every reader, including those who had
  asked their device for less movement. Those elements now arrive already in
  position for those readers, with only gentle fades retained.

## 0.6.0

### Minor Changes

- Update the documentation for Architect 8.3, Interviewer 8.3 and Fresco 4.2.

  - **Interface languages.** Architect, Interviewer and Fresco can each be used in English, English (UK) or Español. The docs cover where each app's language switcher is, the language chooser inside an interview, and what a language choice never changes: protocol text, labels and collected data.
  - **Architect.**
    - The building-a-protocol tutorial now walks through the searchable attribute window and uses Architect's own button names.
    - New pages cover the two-pane form-field dialog with its participant preview and **Check response**, validation rules set outside forms, creating node and edge types from the type picker, and the stage editor's section list.
    - Also covered: renaming an attribute from its pill, per-node-type switches on the Anonymisation stage, mapping shapes to an attribute, and what undo and redo cover.
  - **Missing resources.** Architect opens a protocol whose resource files are missing so they can be added again. It won't download the protocol until they are, and Interviewer and Fresco refuse such a protocol.
  - **Interviewer.** Settings lists all seven sections. The interview menu, the home top bar, the setup wizard and the device checklist match the app.
  - **Fresco.**
    - A new "Upgrading to 4.2.0" section: passkeys must verify you, the health check no longer reports the version, two-factor authentication can be required, and import messages are clearer.
    - The Fresco version is shown on the Settings page.
    - The analytics and GDPR pages now describe exactly what the optional analytics send.

### Patch Changes

- The section label on each search result, and the schema, app and requirement
  chips on each interface page, are the shared `Badge`, so they match the chips
  used across the other Network Canvas apps.

## 0.5.2

### Patch Changes

- Corrected the "Freeze completed interviews" section of the Fresco guide, which
  described the setting as off by default when Fresco actually freezes completed
  interviews by default. The section now explains the default behaviour and how
  to switch it off if you want re-opened interviews to keep syncing changes.

## 0.5.1

### Patch Changes

- Fix the corner radius on the copy-code confirmation bubble and the interface-summary badges (Schema, Available In, Requires). They used `rounded-md`, a step the shared theme's radius scale does not define (it goes straight from the default radius to `rounded-lg`), so the plugin serving the scale silently applied no rounding at those corners. They now use `rounded-lg`, matching their pre-theme-migration radius.
- Sidebar folders now open and close in step with the page you navigate to, instead of showing their previous state for a moment first.

## 0.5.0

### Minor Changes

- Expanded the Fresco "FAQ for IT Departments" to answer the questions institutional IT and security teams ask before approving a deployment: who develops and funds Network Canvas and who owns it, whether Fresco is a vendor product and on what terms it may be used, where to obtain the software, which sites the project itself hosts and what data they hold, whether Fresco supports institutional single sign-on and how to restrict the dashboard to an institutional network in the meantime, and how vulnerabilities and updates are handled, including the project's responsibilities and timelines. Updated the project FAQ's funding answer to list the current and maintenance awards. Corrected two related statements elsewhere in the Fresco docs: container image tags carry no `v` prefix (Advanced Deployment), and a passkey is not guaranteed to be multi-factor because Fresco requests but does not require user verification (Accounts).

### Patch Changes

- Document Fresco's `/api/health` liveness endpoint in the Advanced Deployment guide and the IT FAQ: it is unauthenticated, reports only the service status, and never names the running version or uptime.
- Describe Fresco's new `REQUIRE_TWO_FACTOR` environment variable in the Accounts & Security guide, the deployment environment-variable reference, and the FAQ for IT departments: what it enforces for password accounts, why it is an environment variable rather than a dashboard setting, how a locked-out colleague is recovered, and why passkey accounts are exempt.
- The Fresco FAQ for IT departments' network-restriction mitigation now discloses a real gap: Next.js dispatches Server Actions by a request header rather than by URL, so a signed-in researcher's session cookie can still authorize an action (export, deletion, settings changes) through a path the guidance leaves public. Closing this requires app-level enforcement that does not exist yet; the section now says so plainly rather than implying the path split is a complete boundary.
- Disclose a limit of the Fresco IT FAQ's institutional network-restriction guidance: a Server Action can be invoked through any URL a valid session cookie reaches, including routes the guidance leaves public, the same way the `/api/uploadthing` exception is already documented as session-gated rather than network-gated. Also add the not-yet-configured `/expired` page, which binds a Server Action, to the list of researcher surfaces to restrict.
- The Fresco Accounts & Security guide and the FAQ for IT Departments now state that Fresco requires WebAuthn user verification for every passkey, so a passkey sign-in always combines possession of the authenticator with a biometric or PIN check, and explain what to do about a passkey registered on a security key that cannot verify its user.

## 0.4.2

### Patch Changes

- The documentation layout now marks its `<main>` as the target of the site
  header's new skip link, so keyboard and screen-reader visitors can bypass the
  navigation on every page.

## 0.4.1

### Patch Changes

- Point Fresco setup instructions at GitHub's working account entry point.

## 0.4.0

### Minor Changes

- Document the Background Creator — draw responsive canvas backgrounds, define zones, and export ready-to-run Python or R scripts that classify nodes by zone — as the recommended way to build responsive SVG backgrounds, alongside the existing manual template and graphics-editor workflows. Links to the hosted tool at bg-creator.networkcanvas.com and shows it in use with annotated screenshots.

## 0.3.3

### Patch Changes

- Populate PostHog's built-in app name and version metadata for Documentation
  events.

## 0.3.2

### Patch Changes

- Update the Architect preview guidance for the default-off Respect skip logic setting and explain how to test both every stage and participant routes.
- Add an advanced tutorial for implementing the Colored Eco-Genetic Relationship Map (CEGRM) method in Network Canvas, including a worked template architecture, screenshots, analysis guidance, ethical cautions, and links to the foundational literature.
- Update analytics sanitization dependencies to resolve security vulnerabilities.

## 0.3.1

### Patch Changes

- Update the Interviewer guide's description of the in-interview navigation: the
  standalone exit (door icon) control is now a settings (gear) menu containing
  the Exit interview action and a participant Text size option.

## 0.3.0

### Minor Changes

- Pages reorganized to live where readers look for them, with redirects from every old URL:

  - Protocol-design reference moved out of Get Started: Node Labelling now lives in Key Concepts, and the protocol file-format page merged into The Protocol File (with a new "Inside a .netcanvas file" section). Protocol Schema Information moved to the top of Get Started, and the Advanced Topics folder is gone.
  - The Small and Large Roster Name Generator pages merged into Name Generator for Roster Data, which now carries their sorting and nomination guidance.
  - Previewing Your Protocol and Responsive SVG Backgrounds moved from Key Concepts to the Design Protocols section root, alongside the other task guides.
  - The security-model page merged into IRB and Security Best Practices, which now includes a "What data is stored where" inventory.
  - The Network Canvas GraphML format reference merged into Data Export as a "Network Canvas GraphML extensions" section.
  - The project FAQ's security answers now correctly describe the current Interviewer's optional anonymous analytics.

- Six new pages close the documentation's remaining reader-journey gaps:

  - **Migrating from the Classic Apps** walks returning users through the decision to switch, one-way protocol migration, and what changes day to day.
  - **Piloting Your Study** connects Preview Mode, Interviewer's synthetic-data generator, and the Fresco Sandbox into a full dry-run workflow with a pre-launch checklist.
  - **About Interviewer** gives the Interviewer section an orientation landing page, and **Data Storage and Safety** answers the field team's operational questions about where interview data lives, what protects it, and what destroys it.
  - **Export Data Dictionary** documents exactly how every variable type is serialized in CSV and GraphML exports, derived directly from the exporter source; the Data Export page's layout-coordinate examples, CSV filenames, and Python pathway are corrected and expanded to match.
  - A **Glossary** defines the suite's vocabulary for readers who arrive outside the protocol-design section.

- Section landing pages now introduce each phase of the research workflow:

  - Every section landing page (Get Started, Design Protocols, Collect Data, Analyze Data) now opens by introducing that step of the research process and how Network Canvas supports it, before handing off to tutorials and reference pages.
  - The Architect vs Architect Classic comparison moved from the Design Protocols landing page to a dedicated "Choosing Architect or Architect Classic" page.
  - The "Release Announcements" page has been removed; its app-compatibility matrix now lives on Protocol Schema Information, which is the single reference for schema versions and app compatibility. The old URL redirects there.
  - Homepage section cards now describe the workflow step each section covers.

- Document how to create responsive SVG canvas backgrounds, with a downloadable example and workflows for Adobe Illustrator and Inkscape.

### Patch Changes

- Use the shared display and subheading typography variants on the documentation homepage.
- Keep documentation search available in deploy previews and show recovery actions when an unexpected error interrupts the app.
- Clarify how protocols and interview data move through Network Canvas studies, with detailed online and offline workflows for Interviewer and Interviewer Classic.
- Duplicated content consolidated onto canonical pages:

  - Data Export is now the single reference for export file types, options, and data structure; the Interviewer, Fresco, and workflow guides keep their app-specific steps and link there. The screen-layout coordinate option now correctly describes all three apps.
  - GDPR guidance now lives on the GDPR Compliance Guide alone; the Fresco FAQ and project FAQ answers link there instead of repeating it.
  - The Vercel deployment guide is marked as a legacy path that is no longer updated; the Netlify Deployment Guide is the supported route.
  - Database-reset guidance now covers both Netlify/Neon and Docker deployments in one recovery section, and upgrading now covers Docker deployments.
  - The project FAQ's dated answers (2020 release narrative, old test-device list, future-events promises) have been refreshed.
  - Interviewer's browser support is now documented and linked, and the Protocol Gallery is now reachable from the Getting Started and Building a Protocol tutorials.

- Content modernized to match the current apps:

  - The Narrative interface page is rewritten around what it actually does — presets, their configuration in Architect, and researcher-led qualitative elicitation — and the Sociogram page gains a full Configuring section (layout variables, automatic layout, backgrounds, edge creation, attribute highlighting), both verified against the stage schemas.
  - Protocol and Data Workflows now leads with the current Interviewer workflow, keeps the Fresco web workflow, and explicitly labels the cloud/USB logistics as Interviewer Classic workflows; colliding section anchors are made unique and inbound links retargeted.
  - Configuring Devices adopts the version switcher, keeping device-level advice shared and scoping Classic-only settings correctly; Working with Rosters is modernized for both Architect generations, with its outdated forward-looking promises removed.
  - The Project Overview reflects the current three-application suite instead of its 2020 snapshot, while keeping the project's history and design principles.
  - The Geospatial page's ad-hoc availability warning is replaced by the standard per-interface availability display; the last stale mention of Network Canvas Studio is removed.
  - The documentation now uses US English spelling throughout (page URLs unchanged), and the narrative and sociogram screenshots show the current interview interfaces.

- Correctness and navigation fixes across the documentation:

  - The GDPR and IRB compliance pages now distinguish Interviewer from Interviewer Classic, correctly documenting the current app's encryption at rest and its optional anonymous analytics.
  - Fresco is now described as a fully supported application rather than a pilot project.
  - The interface catalogue and the schema 8 feature list now include Network Composer, Tie-Strength Census, Narrative Pedigree, and Name Generator for Roster Data.
  - The "Building a protocol" tutorial now walks through creating the university roster stage that its Per-Alter Form section depends on, and its sociogram attribute-toggling section has its own heading.
  - Sidebar navigation is now deliberately ordered: Key Concepts follows a learning sequence, Interface Documentation groups interface families with Shared Interface Options first, "Installing Architect Classic" follows the current-app pages, and the Fresco pages follow the deployment journey.
  - Factual fixes on interface pages (Dyad Census screen scaling, Per Alter Form node type, name-generator counts) and a repaired database-reset link on the Accounts page.
  - The sidebar now highlights a section's landing page when viewing the section root, and the Get Started homepage card describes what the section actually contains.

- Corrected two claims on the Data Export page:

  - The R import example now uses the egor package (the CRAN package is `egor`, not "egoR") and its `threefiles_to_egor()` function with the Network Canvas identifier columns, replacing an example that called a function signature that doesn't exist. The tutorial page's package link label was fixed to match.
  - The "Merge sessions by protocol" export option now states its availability explicitly: it is only offered by Interviewer Classic up to version 6.5 (removed in 6.6), while Interviewer and Fresco always export each session as separate files. The section also now correctly describes merged GraphML output as a single file with one `<graph>` element per session.

- Remove the Terms of Use link from the documentation footer.
- The shared site navigation bar's "Docs" link now reads "Documentation".
- Expand the "Integration with other survey tools" guide to cover Prolific alongside the existing Qualtrics example. The new section explains how to pass a participant identifier using Prolific's URL placeholders — both recruiting participants straight into Fresco and routing them through a survey tool first — and highlights that, because the integration is one-way, you need to plan how participants return to Prolific to be marked complete. Also corrects a formatting slip in the participant-identifier warning, where a fragment of markup appeared in the text.
- Correct the Scalar variable description. It described examples as being on a
  "0-100 scale", but a scalar response is recorded on a normalised 0 to 1 scale
  and is configured with a label at each end rather than a numeric range.
- Describe Fresco consistently as a mature web platform, replacing outdated
  language that characterized the project or its shared platform as new.
- Make Network Canvas website links follow the active local or deploy-preview site, automate paired local site development, replace obsolete download and self links, and render documentation section separators consistently across browsers.
- Give the documentation background weave a quieter palette of distinct purple shades.
- Keep documentation sitemaps current on every deployment.
- Remove beta labels from Interviewer documentation ahead of the app's stable launch.

## 0.2.0

### Minor Changes

- Refresh the documentation site onto the shared Network Canvas design system. The site now uses the same fonts, colour palette, and UI components (via `@codaco/fresco-ui` and the shared Tailwind theme) as Architect and Interviewer, and gains a redesigned dark mode. Content and navigation are unchanged.
- Document configurable node shapes and variable-driven shape mappings.
- Reorganise the documentation and gate production releases through the dedicated release pull request.

### Patch Changes

- Updated the "create a GitHub account" links in the Fresco deployment guides to point to a URL that loads reliably.
