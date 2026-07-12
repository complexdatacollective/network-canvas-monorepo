# NetworkCanvas.com Get Started Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy download journey with a visually distinctive,
purpose-first `/get-started` flow for browser apps while retaining clearly
secondary Architect Classic and Interviewer Classic 6.6.0 downloads.

**Architecture:** A static, server-rendered page owns the workflow content and
uses small focused presentation components for the hero, workflow sections, app
cards, and compatibility warning. Existing homepage CTAs point to the new route;
the old route redirects at both Next static-export and Netlify layers. Structured
app/link data stays in one typed source while motion reuses project conventions.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript 6, Tailwind CSS 4,
`motion/react`, Lucide, Vitest, Testing Library, Netlify redirects, oxlint, and
oxfmt.

## Global Constraints

- Keep the site statically exported; no middleware, server functions, runtime
  detection, or client-only product chooser.
- Preserve the approved purpose-first flow and visual direction from
  `docs/superpowers/specs/2026-07-12-website-get-started-flow-design.md`.
- Keep both workflow paths in static HTML and use ordinary `#design` and
  `#collect` anchors.
- Current-generation Architect, Interviewer, and Fresco are browser apps.
- Architect Classic and Interviewer Classic are version 6.6.0, visually
  secondary, and described as maintenance/existing-study options.
- Each Classic app exposes Apple Silicon, Apple Intel, Windows, and Linux;
  macOS/Windows are direct release assets and Linux is the v6.6.0 release page.
- Remove Network Canvas Server content, URLs, types, and rendered references
  completely.
- Change navbar and hero actions to “Get Started” at `/get-started`.
- Permanently redirect `/download` to `/get-started` in Next and Netlify.
- Reuse existing brand tokens, typography, PageBackground, PillLink/ButtonLink,
  Reveal, focus treatment, spring conventions, and reduced-motion behavior.
- The signature element is the paired purpose cards followed by asymmetrical
  recommended-versus-Classic product surfaces; do not turn the page into a
  generic equal-weight card grid.
- No hardcoded colors where current theme tokens exist; no fixed heights that
  clip expanded or translated copy.
- Do not add `any`, assertions, ignore rules, barrels, convenience re-exports, or
  self-attribution.
- Follow TDD: observe each focused test fail before production changes.
- Run oxlint with `--fix` and oxfmt on every touched file.
- This private website app does not require a changeset.

---

### Task 1: Replace Download Semantics and Define the App Model

**Files:**

- Create: `apps/networkcanvas.com/lib/getStarted.ts`
- Create: `apps/networkcanvas.com/lib/__tests__/getStarted.test.ts`
- Create: `apps/networkcanvas.com/netlify.toml`
- Modify: `apps/networkcanvas.com/lib/content.ts`
- Modify: `apps/networkcanvas.com/components/layout/Header.tsx`
- Modify: `apps/networkcanvas.com/components/layout/__tests__/Header.test.tsx`
- Modify: `apps/networkcanvas.com/components/sections/Hero.tsx`
- Modify: `apps/networkcanvas.com/components/sections/__tests__/Hero.test.tsx`
- Replace: `apps/networkcanvas.com/app/download/page.tsx`
- Create: `apps/networkcanvas.com/app/download/__tests__/page.test.tsx`

**Interfaces:**

- Produces `GET_STARTED_PATH = '/get-started'`.
- Produces `webApps`, `classicApps`, and `compatibilityWarning` typed structured
  data consumed by Task 2.
- `classicApps` has IDs `architect-classic` and `interviewer-classic`; each has
  exactly four platform links.
- `/download` calls `permanentRedirect(GET_STARTED_PATH)`.

- [ ] **Step 1: Write failing semantic, model, and redirect tests**

Add tests asserting:

```ts
expect(GET_STARTED_PATH).toBe('/get-started');
expect(webApps.map(({ id }) => id)).toEqual([
  'architect',
  'interviewer',
  'fresco',
]);
expect(classicApps.map(({ id }) => id)).toEqual([
  'architect-classic',
  'interviewer-classic',
]);
expect(classicApps.every(({ version }) => version === '6.6.0')).toBe(true);
expect(
  classicApps.every(({ platforms }) =>
    ['apple-silicon', 'apple-intel', 'windows', 'linux'].every((platform) =>
      platforms.some(({ id }) => id === platform),
    ),
  ),
).toBe(true);
expect(
  JSON.stringify({ webApps, classicApps, compatibilityWarning }),
).not.toMatch(
  /Network Canvas Server|Network-Canvas-Server|\/Server\/releases/i,
);
```

Mock `next/navigation` and assert invoking `DownloadPage()` calls
`permanentRedirect('/get-started')`. Update Header/Hero tests to expect **Get
Started**, `/get-started`, and no **Download Now** or top-level **Download** CTA.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm --filter networkcanvas.com test -- lib/__tests__/getStarted.test.ts app/download/__tests__/page.test.tsx components/layout/__tests__/Header.test.tsx components/sections/__tests__/Hero.test.tsx
```

Expected: FAIL because the new model/route do not exist and current CTAs still
say Download.

- [ ] **Step 3: Implement the typed app model**

Use literal unions for `Workflow`, `WebAppId`, `ClassicAppId`, and `PlatformId`.
Each record contains only page content and shared destinations; no JSX.

Define web destinations:

```ts
architect: 'https://architect.networkcanvas.com/';
interviewer: 'https://interviewer.networkcanvas.com/';
frescoSandbox: 'https://fresco-sandbox.networkcanvas.com/';
frescoDeployment: 'https://documentation.networkcanvas.com/en/fresco/deployment/guide';
```

Define v6.6.0 Classic repository/tag roots:

```ts
architectRelease: 'https://github.com/complexdatacollective/architect/releases/tag/v6.6.0';
interviewerRelease: 'https://github.com/complexdatacollective/interviewer/releases/tag/v6.6.0';
```

Use direct `releases/download/v6.6.0/` asset URLs for Apple Silicon, Apple Intel,
and Windows, following each app's Electron Builder artifact names. Linux points
to the tag page. Encode spaces in asset URLs. Keep all names, status labels,
best-use guidance, schema guidance, bullets, and CTA labels exactly as approved
in the design spec.

- [ ] **Step 4: Replace old route and CTA semantics**

Replace the entire old Download page with the static redirect. Change
`navLinks`, Header filtering/CTA, and Hero CTA to `GET_STARTED_PATH` and **Get
Started**. Remove every Server link and the Google Play link with the deleted
Download page implementation.

Create `netlify.toml`:

```toml
[[redirects]]
from = "/download"
to = "/get-started"
status = 301
force = true
```

- [ ] **Step 5: Verify GREEN and quality**

Run the focused tests from Step 2, website typecheck, targeted oxlint `--fix`,
targeted oxfmt, and `git diff --check`.

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/networkcanvas.com
git commit -m "refactor(website): replace download journey"
```

---

### Task 2: Build the Purpose-First Get Started Experience

**Files:**

- Create: `apps/networkcanvas.com/app/get-started/page.tsx`
- Create: `apps/networkcanvas.com/app/get-started/__tests__/page.test.tsx`
- Create: `apps/networkcanvas.com/components/get-started/GetStartedIntro.tsx`
- Create: `apps/networkcanvas.com/components/get-started/WorkflowPath.tsx`
- Create: `apps/networkcanvas.com/components/get-started/AppChoiceCard.tsx`
- Create: `apps/networkcanvas.com/components/get-started/CompatibilityNotice.tsx`
- Create: focused tests under
  `apps/networkcanvas.com/components/get-started/__tests__/`

**Interfaces:**

- `GetStartedIntro` renders Header, purpose question, and the two anchor cards.
- `WorkflowPath` receives one workflow plus its ordered app records.
- `AppChoiceCard` renders featured, Fresco, or Classic visual treatment based on
  typed data rather than inferred names.
- `CompatibilityNotice` renders the approved one-way migration copy.
- Page metadata title is `Get Started`; description matches the spec.

- [ ] **Step 1: Write failing page and component behavior tests**

Render the page and assert:

- one h1 named **What would you like to do?**;
- links **Design or create an interview protocol** → `#design` and **Collect
  data using Network Canvas** → `#collect`;
- sections `#design` and `#collect` with h2 headings;
- Architect and Interviewer are marked recommended;
- Architect Classic and Interviewer Classic say maintenance/existing studies;
- Fresco has Sandbox and Deployment Guide links;
- each Classic card exposes four accessible platform link names including the
  app name;
- the one-way migration warning is rendered;
- no standalone Server app content exists; and
- metadata is localized to Get Started wording.

Add focused class/semantics tests for:

```ts
expect(featuredCard).toHaveClass('bg-cyber-grape', 'text-white');
expect(classicCard).toHaveClass('bg-white/55', 'backdrop-blur-md');
expect(frescoCard).toHaveClass('bg-slate-blue/10');
expect(pathLink).toHaveClass('focusable');
```

Mock `motion/react` as needed and add reduced-motion coverage proving the intro
does not start hidden or schedule staggered animation when reduced motion is
enabled.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm --filter networkcanvas.com test -- app/get-started components/get-started
```

Expected: FAIL because the page and components do not exist.

- [ ] **Step 3: Implement the approved visual system**

Build the page inside the same `homepage-body relative isolate` and
`PageBackground` layering used by the homepage. Use one h1 and semantic h2/h3
hierarchy. Reproduce the approved companion direction with repository tokens:

- generous centered opening question;
- paired translucent pathway cards with colored circular arrows;
- small path labels and large task headings;
- asymmetric product grids where featured current apps carry cyber-grape and
  Classic cards carry `bg-white/55 backdrop-blur-md`;
- Fresco uses a restrained `bg-slate-blue/10` surface and slate action;
- compact platform pills inside Classic cards; and
- mustard compatibility notice.

Use existing `Container`, `Header`, `Footer`, `PageBackground`, `PillLink`,
`Reveal`, and theme utilities. Use Lucide icons only as supporting decorative
elements with `aria-hidden`. Keep content height fluid and stack cards in
document order on mobile.

- [ ] **Step 4: Implement coordinated motion**

Follow the hydration-safe entrance pattern in `HeroIntro`: derive variants from
`createHeroEntrance`, use animation controls, activate only after normal-motion
hydration, and render final state immediately for reduced motion. Sequence
navbar, eyebrow/headline, Design card, then Collect card. Reuse `Reveal` for
section headings and app cards. Give pathway/card hover lift equivalent
`whileFocus` or focus-visible styling; do not add scattered decorative motion.

- [ ] **Step 5: Verify GREEN and inspect visually**

Run focused tests, full website tests, typecheck, oxlint `--fix`, oxfmt, and
`git diff --check`. Use the in-app browser at desktop and mobile widths to compare
against the approved visual companion. Verify both anchors, external link
targets, keyboard focus, reduced motion, and no hydration/console errors.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/networkcanvas.com/app/get-started apps/networkcanvas.com/components/get-started
git commit -m "feat(website): add purpose-first get started flow"
```

---

### Task 3: Reconcile Internationalisation Plans and Complete Verification

**Files:**

- Modify:
  `docs/superpowers/specs/2026-07-12-networkcanvas-i18n-csv-content-design.md`
- Modify:
  `docs/superpowers/plans/2026-07-12-networkcanvas-i18n-csv-content.md`
- Modify implementation files only if verification exposes a defect.

**Interfaces:**

- Future locale routes are `/en/get-started` and `/es/get-started`.
- The `Download` message namespace and page task become `GetStarted`.
- Legacy download redirects are retained and adapted to locale routing.

- [ ] **Step 1: Update the paused i18n design and plan**

Replace every intended current-page `/download` route, Download namespace,
Download page file, and download-specific copy with Get Started equivalents.
Specify complete translation coverage for pathway cards, app guidance, schema
warning, status badges, platform labels, and accessible names. Preserve the old
route only in redirect requirements. Do not alter the already-approved CSV
content pipeline.

- [ ] **Step 2: Run complete repository-scope verification**

```bash
pnpm --filter networkcanvas.com test
pnpm --filter networkcanvas.com typecheck
pnpm exec oxlint --fix apps/networkcanvas.com
pnpm exec oxfmt apps/networkcanvas.com docs/superpowers/specs/2026-07-12-networkcanvas-i18n-csv-content-design.md docs/superpowers/plans/2026-07-12-networkcanvas-i18n-csv-content.md
pnpm knip
pnpm --filter networkcanvas.com build
git diff --check
```

Inspect `out/get-started.html` and the `/download` fallback. Confirm the dev
server remains available for user review.

- [ ] **Step 3: Commit Task 3**

```bash
git add docs/superpowers/specs/2026-07-12-networkcanvas-i18n-csv-content-design.md docs/superpowers/plans/2026-07-12-networkcanvas-i18n-csv-content.md
git commit -m "docs: align i18n plan with get started flow"
```

---

### Task 4: Refine Compatibility and Fresco Presentation

**Files:**

- Modify: `apps/networkcanvas.com/app/get-started/page.tsx`
- Modify: `apps/networkcanvas.com/components/get-started/WorkflowPath.tsx`
- Modify: `apps/networkcanvas.com/components/get-started/CompatibilityNotice.tsx`
- Modify: `apps/networkcanvas.com/components/get-started/AppChoiceCard.tsx`
- Modify: `apps/networkcanvas.com/lib/getStarted.ts`
- Modify: focused Get Started tests

**Requirements:**

- Render the compatibility notice with `Alert` and `AlertDescription` imported
  directly from `@codaco/fresco-ui/Alert`.
- Place the notice immediately beneath the Design path description, before the
  Architect/Architect Classic card grid.
- Remove the former standalone notice below both workflow sections.
- Preserve the exact compatibility title and description.
- Add `backdrop-blur-md` to the Fresco card treatment while retaining its
  slate-blue tint.
- Change Fresco's status to **Recommended for large teams or remote
  administration**.

- [ ] **Step 1: Change focused tests and verify RED**

Assert the warning has `role="status"`, appears after the Design description but
before the Architect heading, and no warning follows the Collect section. Assert
the Fresco article has both `bg-slate-blue/10` and `backdrop-blur-md`, and its
status uses the exact new wording. Run:

```bash
pnpm --filter networkcanvas.com test -- app/get-started components/get-started lib/__tests__/getStarted.test.ts
```

Expected: FAIL on the old notice placement/custom markup, missing Fresco blur,
and old Fresco status.

- [ ] **Step 2: Implement the minimal refinement**

Make `CompatibilityNotice` return the fresco-ui warning Alert without its own
Container. Keep the title as strong paragraph text inside AlertDescription so it
does not introduce an out-of-order heading. Allow `WorkflowPath` to receive an
optional compatibility notice and render it immediately after the Design
description inside the heading Reveal. Pass it only to the Design path from the
page. Update the Fresco treatment class and status data.

- [ ] **Step 3: Verify and commit**

Run focused/full website tests, website typecheck, targeted oxlint `--fix`,
targeted oxfmt, and `git diff --check`.

```bash
git add apps/networkcanvas.com
git commit -m "refine(website): clarify classic compatibility"
```

---

## Final Review and Delivery

- [ ] Generate a review package for every task and require both spec-compliance
      and code-quality approval before advancing.
- [ ] Generate a whole-branch review package and resolve every Critical or
      Important finding with covering tests.
- [ ] Re-run every Task 3 verification command after review fixes.
- [ ] Push the existing feature branch and update the existing pull request.
- [ ] Leave the local development server running and provide
      `http://localhost:3000/get-started` for review.
