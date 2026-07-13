# NetworkCanvas.com Get Started Flow Design

**Date:** 2026-07-12

## Goal

Replace the website's legacy download-first journey with a purpose-first Get
Started flow for the new browser-based Network Canvas apps. Keep Architect
Classic and Interviewer Classic 6.6.0 available for studies that require schema
7 or established offline workflows. Remove Network Canvas Server completely.

## Product Model

Network Canvas now has two generations of applications:

- **Current generation:** Architect, Interviewer, and Fresco run in a web
  browser and use schema 8 protocols.
- **Classic generation:** Architect Classic and Interviewer Classic are
  downloadable desktop applications for schema 7 workflows. They remain
  supported in maintenance mode for compatibility and bug fixes.

The page must not present browser apps and Classic apps as equivalent defaults.
It first asks what the researcher wants to accomplish, then recommends the
current-generation app while explaining the narrower reason to use Classic.

## Routes and CTA Language

The primary route becomes `/get-started`.

- The desktop navbar action changes from **Download** to **Get Started**.
- The mobile navbar action changes from **Download** to **Get Started**.
- The hero action changes from **Download Now** to **Get Started**.
- All three actions link to `/get-started`.
- The existing `/download` path permanently redirects to `/get-started`.

The redirect has two layers:

1. `app/download/page.tsx` is a static Next.js redirect fallback for local
   development and non-Netlify hosting.
2. `apps/networkcanvas.com/netlify.toml` contains a forced permanent redirect so
   Netlify returns the correct redirect status even though static export emits a
   file for the old path.

The page metadata changes from download language to:

- **Title:** Get Started
- **Description:** Choose the right Network Canvas app for designing a protocol
  or collecting network data.

## Purpose-First Page Flow

### Opening question

The page opens with the eyebrow **Choose your workflow**, the headline **What
would you like to do?**, and a short explanation that the visitor should start
with their research task.

Two high-impact pathway cards appear immediately:

1. **Design or create an interview protocol** — links to `#design`.
2. **Collect data using Network Canvas** — links to `#collect`.

These are ordinary in-page anchor links. Both destination sections remain in the
static HTML, so the flow does not depend on client state or JavaScript and both
paths remain linkable and searchable.

### Path 1: Design or create a protocol

This section compares Architect and Architect Classic.

#### Architect

Architect is visually dominant and carries the badge **Recommended for new
studies**.

Use Architect when:

- starting a new study;
- designing a schema 8 protocol;
- collecting with the new Interviewer or Fresco; or
- upgrading a schema 7 protocol created in Architect Classic.

Supporting copy explains that Architect runs in the browser, needs no install,
and is always current. The primary action is **Open Architect**, linking to
`https://architect.networkcanvas.com/` in a new tab.

#### Architect Classic

Architect Classic is visually secondary and carries the badge **Classic ·
Maintenance mode**.

Use Architect Classic only when:

- an existing study must remain compatible with Interviewer Classic; or
- a schema 7 protocol must continue to be edited without migration.

It exposes version 6.6.0 platform actions for:

- **Apple Silicon** — direct macOS arm64 installer;
- **Apple Intel** — direct macOS x64 installer;
- **Windows** — direct x64 installer; and
- **Linux** — the Architect 6.6.0 GitHub release page, where the researcher can
  select the appropriate AppImage, Debian, RPM, or archive package.

### Path 2: Collect data

This section compares Interviewer, Fresco, and Interviewer Classic.

#### Interviewer

Interviewer is visually dominant and carries the badge **In person ·
Recommended**.

Use Interviewer when:

- interviews are conducted in person;
- a trained interviewer guides the participant;
- data collection happens on a researcher-controlled device; and
- the study uses a schema 8 protocol.

Supporting copy explains that the current Interviewer opens in the browser. The
primary action is **Open Interviewer**, linking to
`https://interviewer.networkcanvas.com/` in a new tab.

#### Fresco

Fresco carries the badge **Large Teams · Remote Administration ·
Recommended**.

Use Fresco when:

- participants complete interviews remotely in their own browser;
- study and participant management should be centralized;
- data should be managed and exported from a shared dashboard; and
- the team can deploy and host a Fresco instance.

Fresco has two actions:

- **Fresco Sandbox Access Guide** — opens the credentialed sandbox
  documentation in a new tab so visitors have the public login details.
- **Deployment Guide** — opens the Fresco deployment documentation in a new
  tab.

The sandbox is described as a public demonstration environment, not a place to
run a real study.

#### Interviewer Classic

Interviewer Classic is visually secondary and carries the badge **Classic ·
Existing studies**.

Use Interviewer Classic when:

- an established study depends on schema 7;
- the existing desktop or tablet workflow must be preserved; or
- the study requires the older offline collection workflow.

It exposes version 6.6.0 platform actions for:

- **Apple Silicon** — direct macOS arm64 installer;
- **Apple Intel** — direct macOS x64 installer;
- **Windows** — direct x64 installer; and
- **Linux** — the Interviewer 6.6.0 GitHub release page, where the researcher can
  select the appropriate package;
- **iPhone and iPad** — the Interviewer Classic App Store listing; and
- **Android** — the Interviewer Classic Google Play listing.

## Compatibility Warning

A concise warning appears immediately after the Design stage description and
before the Architect and Architect Classic cards:

> **Classic compatibility is one-way.** Architect can upgrade a schema 7
> protocol to schema 8, but schema 8 protocols cannot be opened in Classic apps.
> Keep the original file if your study still depends on Classic.

This warning is informational, not alarming. It uses the mustard accent and an
accessible warning icon without destructive styling.

## Server Removal

Network Canvas Server is removed completely from the website:

- remove the Server section and explanatory copy;
- remove all Server binary URLs;
- remove the Server download data and types;
- remove Server-specific tests; and
- ensure no rendered website copy contains a standalone reference to the Server
  app.

The refactor does not add a Server archive link or replacement notice.

## Visual Direction

The approved visual direction is purpose-first and editorial rather than a
conventional download grid.

### Hierarchy

- The opening question occupies generous vertical space and uses the same bold,
  centered heading language as the homepage hero.
- The two pathway cards are large translucent surfaces over the existing
  page-wide BackgroundBlobs treatment.
- Section headers use a small numbered path label, a large task heading, and a
  concise explanatory paragraph.
- Recommended apps use the strongest brand color, elevation, and scale.
- Classic apps use quieter translucent surfaces and maintenance badges without
  becoming hard to find or read.
- Fresco uses slate blue, consistent with the homepage product section.
- Platform choices are compact, clearly labeled controls inside the relevant
  Classic card rather than a page-level operating-system grid.

### Surfaces and spacing

- Reuse the website's existing brand tokens, typography, `focusable` treatment,
  BackgroundBlobs, pill actions, rounded surfaces, and backdrop blur.
- Do not introduce hardcoded colors where a current theme token exists.
- Allow labels and translated copy to expand without fixed-height clipping.
- Maintain a clear reading rhythm at desktop and mobile widths; product cards
  become a single column on narrow screens.

## Motion

The page uses one coordinated entrance and restrained interactive motion:

1. navbar;
2. eyebrow and main question;
3. Design pathway card;
4. Collect pathway card.

Destination sections use the existing Reveal pattern: section heading first,
then the recommended app, then secondary options. Cards lift subtly on hover and
keyboard focus. In-page links use smooth scrolling only when motion is allowed.

All JavaScript animation uses `motion/react` and project spring conventions.
Reduced-motion users receive the final state immediately, with no initial
transform, stagger, delayed reveal, or smooth scrolling.

## Accessibility

- The page has one `h1`; each workflow path has an `h2`; each app has an `h3`.
- Pathway cards are descriptive anchor links with visible focus treatment.
- External app and documentation links announce meaningful action text and open
  in a new tab consistently with the rest of the site.
- Platform controls identify both the platform and target app in their
  accessible names.
- Badges are supplementary text, not the only way status is communicated.
- The compatibility notice uses semantic text; its icon is decorative.
- Hover effects have equivalent focus-visible behavior.
- Mobile reading and keyboard order follow the visible document order.

## Release Links

Classic links target version 6.6.0 in:

- `complexdatacollective/architect`; and
- `complexdatacollective/interviewer`.

macOS and Windows actions point directly to the corresponding release assets.
Linux actions point to each repository's `v6.6.0` release page because multiple
Linux formats and architectures are available. The final implementation must
derive filenames from the Electron Builder artifact configuration and verify
them against the published v6.6.0 releases before delivery. Until those releases
are published, tests validate the intended repository, tag, architecture, and
platform URL structure rather than making network requests.

## Testing and Verification

Implementation follows test-driven development.

### Component and route tests

- navbar and hero CTAs say **Get Started** and link to `/get-started`;
- `/download` redirects permanently to `/get-started`;
- page metadata uses Get Started language;
- both pathway anchors and target IDs exist;
- Architect, Interviewer, and Fresco actions use the approved web URLs;
- Fresco exposes Sandbox and Deployment Guide actions;
- Architect Classic and Interviewer Classic each expose Apple Silicon, Apple
  Intel, Windows, and Linux controls for 6.6.0;
- Server copy and links are absent;
- the compatibility warning is present;
- headings follow the semantic hierarchy;
- external links and accessible names are correct; and
- reduced-motion rendering skips entrance transforms and delays.

### Quality checks

- all website tests pass;
- website type checking passes;
- lint runs with automatic fixes and passes;
- every touched file passes oxfmt;
- `pnpm knip` passes;
- the production static build passes; and
- `git diff --check` passes.

### Browser verification

Verify `/get-started` at representative desktop and mobile widths:

- entrance order and spring motion;
- reduced-motion final-state rendering;
- `#design` and `#collect` navigation;
- hover and keyboard-focus equivalence;
- responsive card order and un-clipped content;
- correct external destinations;
- no Server content;
- no console errors; and
- no hydration warnings.

## Relationship to Internationalisation Work

This structural refactor lands before the approved internationalisation and CSV
content work. After implementation, update both documents:

- `docs/superpowers/specs/2026-07-12-networkcanvas-i18n-csv-content-design.md`
- `docs/superpowers/plans/2026-07-12-networkcanvas-i18n-csv-content.md`

The revisions must:

- replace `download` routes and namespaces with `get-started`;
- generate `/en-US/get-started`, `/en-GB/get-started`, and `/es/get-started`;
- redirect legacy `/download` and localized download routes appropriately;
- translate the complete purpose chooser, app guidance, compatibility warning,
  platform names, maintenance labels, and accessible names; and
- preserve the approved visual hierarchy and motion in both languages.
