# @codaco/documentation

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
