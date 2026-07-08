# Architect Shared-Theme Migration Implementation Plan

> **For agentic workers:** This plan is designed for execution via the multi-agent **Workflow** tool (Appendix B contains the orchestration script). Each task below is a workflow agent's work order. If executed manually instead, use superpowers:subagent-driven-development task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Architect's local Tailwind theme with `@codaco/tailwind-config/fresco.css` plus a permanent `architect-theme.css` app layer, so all fresco-ui components render correctly while Architect keeps its current visual identity.

**Architecture:** Atomic per-document swap of the main entry stylesheet (spec: `docs/superpowers/specs/2026-07-08-architect-shared-theme-migration-design.md`). Foundation (app layer + entry) lands first and is proven by a build spike; ~14 parallel shard agents then apply the rules catalog (Appendix A) to disjoint file sets; three specialists handle fonts/PWA/CSP+providers, the print view, and config; a verification fix-loop runs until two consecutive clean rounds.

**Tech Stack:** Tailwind v4 (catalog `^4.3.2`) via `@tailwindcss/vite`, `@codaco/tailwind-config` (workspace dep, already present), `@codaco/fresco-ui`, vite-plugin-pwa/workbox, oxlint/oxfmt.

## Global Constraints

- Repo root is the worktree: `/Users/jmh629/Projects/network-canvas/.claude/worktrees/pensive-shaw-8a2c16`. Never operate on paths without the `.claude/worktrees` prefix.
- `apps/architect/src/styles/preview.css`, `apps/architect/preview/**`, `packages/**`, and `tooling/**` are **untouchable**.
- No `any`, no type assertions, no barrel files, no re-exports for convenience.
- Shard/specialist agents do **not** run `git commit`, `pnpm typecheck`, `pnpm build`, or any test suite (parallel safety + one-final-verification policy). The orchestrator commits at phase boundaries; types/lint/knip/build run exactly once, in Phase 3 (then once per fix round).
- Pre-commit hooks run oxfmt on staged files automatically; agents must not run repo-wide `lint:fix`.
- Class-position edits only: rules apply to className strings, cva maps, and `@apply`/`var()` positions in CSS. Identifiers, prop names, protocol-data values (e.g. `'node-color-seq-1'` strings), and test fixtures are untouched.
- The spacing rewrite uses **Branch A or Branch B** (Appendix A, R2) as decided by Task 3; every shard prompt receives the decided branch.
- Changeset lane: app-only (`@codaco/architect`), never mixed with a library.

---

## Phase 0 — Foundation (serial; each task blocks the next)

### Task 0: Capture pre-migration visual baselines

**Files:** none modified. Artifacts → `<scratchpad>/baselines/*.png` and `<scratchpad>/baselines/NOTES.md`.

**Interfaces:** Produces the baseline set that Phase 3's visual pass re-shoots and diffs. NOTES.md must record, per screenshot: name, URL/route, exact interaction path, viewport (use 1440×900).

- [ ] **Step 1:** Start the app: `pnpm --filter @codaco/architect dev` (background); note the printed localhost URL.
- [ ] **Step 2:** Drive it with the browser tooling (Claude Preview or Playwright MCP) and capture, at 1440×900, PNGs named exactly:
      `home.png` (Home `/`), `editor-stage.png` (open the Sample/development protocol from Home → open a name-generator stage in the StageEditor), `editor-form-section.png` (a form-heavy section of the same editor, e.g. the prompts/form panel), `codebook.png` (Codebook screen), `navshell-modal.png` (open the ProjectNav modal), `appupdate-dialog.png` (AppUpdate pill's dialog — force it visible per `apps/architect/src/components/AppUpdate/AppUpdatePill.tsx`; if unforceable in dev, screenshot the pill and note it), `legacy-heavy.png` (a screen using `lib/legacy-ui` Button/icons — the Query/Rules editor), `summary-print.png` (ProtocolSummary via `/summary` route or the Summary page, plus a print-media-emulation capture).
- [ ] **Step 3:** Write NOTES.md with the interaction path for each capture (Phase 3 must be able to reproduce them exactly), then stop the dev server.

### Task 1: Author `architect-theme.css`

**Files:**

- Create: `apps/architect/src/styles/architect-theme.css`

**Interfaces:** Produces every token/utility named in Appendix A's "survives via app layer" column. Consumed by Task 2's entry file.

- [ ] **Step 1:** Create the file with exactly this content (values verified against `apps/architect/src/styles/tailwind.css` and `tooling/tailwind/shared/colors.css`; shared palette triplets are oklch, dark variants use the shared `--x--dark` double-hyphen names):

```css
/*
 * Architect app theme — layered over @codaco/tailwind-config/fresco.css.
 * Section 1 re-declares shared semantic variables with Architect's brand
 * values (the extension mechanism sanctioned by themes/default.css).
 * Sections 2-4 add Architect-only vocabulary.
 */

/* 1. Brand overrides (shared variable names, Architect values). */
@layer theme {
  :root {
    --background: oklch(var(--platinum));
    --text: oklch(var(--cyber-grape));
    --primary: oklch(var(--cyber-grape));
    --primary-contrast: oklch(var(--white));
    --secondary: oklch(var(--neon-coral));
    --secondary-contrast: oklch(var(--white));
    --accent: oklch(var(--slate-blue));
    --accent-contrast: oklch(var(--white));
    --selected: oklch(var(--mustard));
    --link: oklch(var(--neon-coral));
    --destructive: oklch(var(--tomato));
    --destructive-contrast: oklch(var(--white));
    --warning: oklch(var(--neon-carrot));
    --warning-contrast: oklch(var(--white));
    --success: oklch(var(--kiwi));
    --success-contrast: oklch(var(--white));
    --info: oklch(var(--cerulean-blue));
    --info-contrast: oklch(var(--white));
    --surface-1: oklch(var(--white));
    --surface-1-contrast: oklch(var(--navy-taupe));
    --surface-2: oklch(var(--platinum));
    --surface-2-contrast: oklch(var(--navy-taupe));
    --surface-3: oklch(var(--platinum--dark));
    --surface-3-contrast: oklch(var(--navy-taupe--dark));
    --input: oklch(var(--white));
    --input-contrast: oklch(var(--charcoal));
    /* Focus rings stay mustard through the shared focus-styles machinery. */
    --focus-color: oklch(var(--mustard));
  }
}

/* 2. Architect-only semantic tokens (no shared concept), plus runtime
   re-emission of the named palette. `static` is load-bearing twice over:
   some tokens are consumed only by fresco-ui dist classes or runtime
   var() reads (never by scanned utility classes), and the shared theme
   is `@theme inline` — it emits NO --color-* variables at runtime, so
   Architect's var(--color-x)/var(--color-x-dark) inline-style and SVG
   reads (149 sites) only resolve because of the block below. */
@theme static {
  --color-rules-type: oklch(var(--neon-coral));
  --color-rules-assert: oklch(var(--sea-green));
  --color-rules-control: oklch(var(--slate-blue));
  --color-rules-delete: oklch(var(--tomato));
  --color-rules-attribute: oklch(var(--mustard));
  --color-rules-operator: oklch(var(--cyber-grape));
  --color-rules-value: oklch(var(--sea-serpent));
  --color-rule-type: var(--color-rules-type);
  --color-rule-control: var(--color-rules-control);
  --color-rule-delete: var(--color-rules-delete);
  --color-rule-attribute: var(--color-rules-attribute);
  --color-rule-operator: var(--color-rules-operator);
  --color-rule-value: var(--color-rules-value);

  --color-timeline: oklch(var(--neon-coral));
  --color-timeline-contrast: oklch(var(--white));
  --color-sortable-background: oklch(var(--slate-blue));
  --color-sortable-contrast: oklch(var(--white));
  --color-table-row-tint: rgb(58 106 117 / 5%);
  --color-form-control: oklch(var(--sea-serpent));
  --color-action: oklch(var(--sea-green));
  --color-action-contrast: oklch(var(--white));
  --color-muted: oklch(var(--cyber-grape) / 60%);
  --color-hover: oklch(var(--sea-green--dark));
  --color-focus: oklch(var(--sea-green));
  --color-active: oklch(var(--sea-green));
  --color-input-active: oklch(var(--sea-green));
  --color-surface-accent: oklch(var(--navy-taupe));
  --color-surface-accent-contrast: oklch(var(--white));
  --color-fresco-purple: oklch(10% 0.4 290);
  --color-fresco-purple-contrast: oklch(var(--white));

  /* 2b. Runtime palette re-emission. Same names/values as the shared
     theme's utility tokens, but emitted as real :root variables. Dark
     aliases use Architect's established single-hyphen -dark suffix,
     resolving the shared double-hyphen --x--dark triplets. */
  --color-white: oklch(var(--white));
  --color-neon-coral: oklch(var(--neon-coral));
  --color-neon-coral-dark: oklch(var(--neon-coral--dark));
  --color-sea-green: oklch(var(--sea-green));
  --color-sea-green-dark: oklch(var(--sea-green--dark));
  --color-slate-blue: oklch(var(--slate-blue));
  --color-slate-blue-dark: oklch(var(--slate-blue--dark));
  --color-navy-taupe: oklch(var(--navy-taupe));
  --color-navy-taupe-dark: oklch(var(--navy-taupe--dark));
  --color-cyber-grape: oklch(var(--cyber-grape));
  --color-cyber-grape-dark: oklch(var(--cyber-grape--dark));
  --color-mustard: oklch(var(--mustard));
  --color-mustard-dark: oklch(var(--mustard--dark));
  --color-rich-black: oklch(var(--rich-black));
  --color-rich-black-dark: oklch(var(--rich-black--dark));
  --color-charcoal: oklch(var(--charcoal));
  --color-charcoal-dark: oklch(var(--charcoal--dark));
  --color-platinum: oklch(var(--platinum));
  --color-platinum-dark: oklch(var(--platinum--dark));
  --color-sea-serpent: oklch(var(--sea-serpent));
  --color-sea-serpent-dark: oklch(var(--sea-serpent--dark));
  --color-purple-pizazz: oklch(var(--purple-pizazz));
  --color-purple-pizazz-dark: oklch(var(--purple-pizazz--dark));
  --color-paradise-pink: oklch(var(--paradise-pink));
  --color-paradise-pink-dark: oklch(var(--paradise-pink--dark));
  --color-cerulean-blue: oklch(var(--cerulean-blue));
  --color-cerulean-blue-dark: oklch(var(--cerulean-blue--dark));
  --color-kiwi: oklch(var(--kiwi));
  --color-kiwi-dark: oklch(var(--kiwi--dark));
  --color-neon-carrot: oklch(var(--neon-carrot));
  --color-neon-carrot-dark: oklch(var(--neon-carrot--dark));
  --color-barbie-pink: oklch(var(--barbie-pink));
  --color-barbie-pink-dark: oklch(var(--barbie-pink--dark));
  --color-tomato: oklch(var(--tomato));
  --color-tomato-dark: oklch(var(--tomato--dark));
}

/* 3. Sequence aliases: protocol-data color names resolve against the
   shared sequences. Order 1-8 is position-identical by verification;
   -dark variants are derived (shared sequences ship none). */
:root {
  --node-color-seq-1: var(--node-1);
  --node-color-seq-2: var(--node-2);
  --node-color-seq-3: var(--node-3);
  --node-color-seq-4: var(--node-4);
  --node-color-seq-5: var(--node-5);
  --node-color-seq-6: var(--node-6);
  --node-color-seq-7: var(--node-7);
  --node-color-seq-8: var(--node-8);
  --node-color-seq-1-dark: oklch(from var(--node-1) calc(l - 0.05) c h);
  --node-color-seq-2-dark: oklch(from var(--node-2) calc(l - 0.05) c h);
  --node-color-seq-3-dark: oklch(from var(--node-3) calc(l - 0.05) c h);
  --node-color-seq-4-dark: oklch(from var(--node-4) calc(l - 0.05) c h);
  --node-color-seq-5-dark: oklch(from var(--node-5) calc(l - 0.05) c h);
  --node-color-seq-6-dark: oklch(from var(--node-6) calc(l - 0.05) c h);
  --node-color-seq-7-dark: oklch(from var(--node-7) calc(l - 0.05) c h);
  --node-color-seq-8-dark: oklch(from var(--node-8) calc(l - 0.05) c h);
  --edge-color-seq-1: var(--edge-1);
  --edge-color-seq-2: var(--edge-2);
  --edge-color-seq-3: var(--edge-3);
  --edge-color-seq-4: var(--edge-4);
  --edge-color-seq-5: var(--edge-5);
  --edge-color-seq-6: var(--edge-6);
  --edge-color-seq-7: var(--edge-7);
  --edge-color-seq-8: var(--edge-8);
  --edge-color-seq-1-dark: oklch(from var(--edge-1) calc(l - 0.05) c h);
  --edge-color-seq-2-dark: oklch(from var(--edge-2) calc(l - 0.05) c h);
  --edge-color-seq-3-dark: oklch(from var(--edge-3) calc(l - 0.05) c h);
  --edge-color-seq-4-dark: oklch(from var(--edge-4) calc(l - 0.05) c h);
  --edge-color-seq-5-dark: oklch(from var(--edge-5) calc(l - 0.05) c h);
  --edge-color-seq-6-dark: oklch(from var(--edge-6) calc(l - 0.05) c h);
  --edge-color-seq-7-dark: oklch(from var(--edge-7) calc(l - 0.05) c h);
  --edge-color-seq-8-dark: oklch(from var(--edge-8) calc(l - 0.05) c h);
  --ord-color-seq-1: var(--ord-1);
  --ord-color-seq-2: var(--ord-2);
  --ord-color-seq-3: var(--ord-3);
  --ord-color-seq-4: var(--ord-4);
  --ord-color-seq-5: var(--ord-5);
  --ord-color-seq-6: var(--ord-6);
  --ord-color-seq-7: var(--ord-7);
  --ord-color-seq-8: var(--ord-8);
  --ord-color-seq-1-dark: oklch(from var(--ord-1) calc(l - 0.05) c h);
  --ord-color-seq-2-dark: oklch(from var(--ord-2) calc(l - 0.05) c h);
  --ord-color-seq-3-dark: oklch(from var(--ord-3) calc(l - 0.05) c h);
  --ord-color-seq-4-dark: oklch(from var(--ord-4) calc(l - 0.05) c h);
  --ord-color-seq-5-dark: oklch(from var(--ord-5) calc(l - 0.05) c h);
  --ord-color-seq-6-dark: oklch(from var(--ord-6) calc(l - 0.05) c h);
  --ord-color-seq-7-dark: oklch(from var(--ord-7) calc(l - 0.05) c h);
  --ord-color-seq-8-dark: oklch(from var(--ord-8) calc(l - 0.05) c h);
}

/* 4. Ported utilities, variant, and base layer. */
@custom-variant short (@media (max-height: 760px));

@layer base {
  html,
  body {
    @apply h-full w-full;
  }
  body {
    @apply overflow-hidden;
  }
  strong {
    @apply font-extrabold;
  }
  h1 {
    @apply h1;
  }
  h2 {
    @apply h2;
  }
  h3 {
    @apply h3;
  }
  h4 {
    @apply h4;
  }
  p {
    @apply text-base;
    margin: 1em 0;
  }
}

@utility h1 {
  @apply font-heading mx-0 my-6 text-3xl leading-tight font-bold;
}
@utility h2 {
  @apply font-heading mx-0 my-6 text-2xl leading-tight font-bold;
}
@utility h3 {
  @apply font-heading mx-0 my-2 text-xl leading-tight font-semibold;
}
@utility h4 {
  @apply font-heading mx-0 my-2 text-lg leading-normal font-semibold;
}
@utility hero {
  @apply font-heading leading-tight font-bold tracking-tight;
  font-size: clamp(2.75rem, 8vh, 4.5rem);
}
@utility lead {
  @apply text-muted text-lg leading-normal;
}
@utility hint {
  @apply text-muted text-xs leading-normal;
}
@utility code {
  @apply bg-text/5 rounded-sm px-1 py-0.5 font-mono text-[0.9em];
}
@utility action-link {
  @apply cursor-pointer font-bold underline decoration-2 underline-offset-4;
  text-decoration-color: var(--color-action);
}
@utility small-heading {
  font-family: var(--heading-font);
  font-size: var(--text-sm);
  font-weight: 900;
  line-height: 1.5;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
@utility scrollable {
  @apply overflow-hidden overflow-y-auto;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
}
@utility form-field {
  @apply border-outline w-full rounded-sm border;
  background-color: var(--color-white);
  color: var(--color-input-contrast);
  padding: 0.6rem 1.2rem;
  line-height: 1.5;

  &:focus {
    @apply ring-1 outline-none;
    border-color: var(--color-primary);
    --tw-ring-color: var(--color-primary);
  }
  &::placeholder {
    color: var(--color-muted);
  }
  & .form-field__label {
    font-size: var(--text-base);
    font-weight: 200;
    display: block;
    margin: 0;
    color: var(--color-input-contrast);
  }
}
@utility clickable {
  box-shadow: 0 0.2rem 0.2rem rgba(17, 21, 27, 0.664);
  transition:
    transform 150ms cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1);

  &:not(:disabled):hover {
    text-decoration: none;
    cursor: pointer;
    transform: translateY(-0.2rem);
    box-shadow: 0 0.4rem 0.2rem 0 rgba(0, 0, 0, 0.35);
  }
  &:not(:disabled):active {
    box-shadow: unset;
    transform: translateY(0.2rem);
  }
}
/* Print surface: re-bases the fluid type scale via --theme-root-size
   (replaces the old html { font-size: var(--base-font-size) } trick). */
@utility protocol-summary-surface {
  --page-size-height: 29.7cm;
  --page-size-width: 21cm;
  --theme-root-size: 12px;
  font-size: var(--theme-root-size);

  @media print {
    color: #000;
    font-family:
      -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif,
      'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';
    -webkit-print-color-adjust: exact !important;
  }
}
```

- [ ] **Step 2:** Deliberately dropped (do not port): `focusable` (shared version + `--focus-color` covers it), `nav-link`, `allow-text-selection`, `prevent-text-selection` (zero consumers).

### Task 2: Rewrite the entry stylesheet and index.html

**Files:**

- Modify: `apps/architect/src/styles/tailwind.css` (replace all 749 lines)
- Modify: `apps/architect/index.html` (font links; stylesheet link already points at tailwind.css — unchanged)

- [ ] **Step 1:** Replace `apps/architect/src/styles/tailwind.css` entirely with:

```css
@import '@codaco/tailwind-config/fresco.css';
/* Class-scanner glue: fresco-ui's own @source is relative to its dist and
   can't be resolved from a consumer, so import its styles.css re-export. */
@import '@codaco/fresco-ui/styles.css';
@import './architect-theme.css';
```

- [ ] **Step 2:** In `apps/architect/index.html`, delete the Google Fonts `<link rel="preconnect">`/stylesheet tags (lines ~8–13, the `fonts.googleapis.com` block). Leave the boot-loader inline `<style>` (`#edf2f8`) untouched.

### Task 3: Build spike + spacing-branch decision

**Files:** none kept (scratch probe only). Produces: `SPACING_BRANCH` = `A` or `B`, recorded for all shard prompts.

- [ ] **Step 1:** Create a scratch probe `apps/architect/src/spike-probe.tsx` containing `export const Probe = () => <div className="p-4.8 z-1000 tablet-portrait:w-auto bg-rules-type text-muted var-probe" />;` (unreferenced file — Tailwind scans it regardless).
- [ ] **Step 2:** Run `pnpm --filter @codaco/architect build`. Expected: build succeeds (Tailwind compile errors here mean Task 1/2 have a bug — fix before proceeding).
- [ ] **Step 3:** `grep -o 'p-4\.8\|z-1000\|bg-rules-type' apps/architect/dist/assets/*.css | sort -u`. If `.p-4\.8` is present → **Branch A**; absent → **Branch B**. If `z-1000` absent, shard rule R4 uses `z-[1000]`-style arbitrary values. `bg-rules-type` must be present (else the `@theme static` block in the app layer isn't merging — stop and fix). Also `grep -c -- '--color-platinum-dark:' apps/architect/dist/assets/*.css` — expected ≥1 (proves the runtime palette re-emission works; if 0, the 149 `var(--color-*)` runtime reads will silently break — stop and fix).
- [ ] **Step 4:** Delete `apps/architect/src/spike-probe.tsx`. Record the branch decision.
- [ ] **Step 5 (orchestrator):** Commit: `git add -A && git commit -m "feat(architect): adopt shared fresco theme foundation"`. NOTE: the app now builds but renders visually broken until Phase 1 completes — expected mid-migration state; do not run visual checks yet.

---

## Phase 1 — Codemod fan-out (parallel shards)

### Task 4: Shard planning

**Interfaces:** Produces JSON `{ shards: [{ name, files: string[] }] }` consumed by Task 5's fan-out.

- [ ] **Step 1:** List all `.ts`/`.tsx`/`.css` files under `apps/architect/src` **excluding**: `src/styles/**`, `src/lib/ProtocolSummary/**` (owned by Task 7), `src/preview-main.tsx`, `src/components/PreviewHost/**` (preview document), `src/main.tsx` (owned by Task 6), `__mocks__`, `templates/*.json`.
- [ ] **Step 2:** Partition into shards of whole directories, ≤50 files each, targeting ~12–14 shards. Fixed shards: `legacy-ui` = `src/lib/legacy-ui/**` alone; `sections` split into 4 alphabetical sub-shards (159 files); `Form` split into 2 (92 files). Every remaining file appears in exactly one shard. Output the full file list per shard.

### Task 5 (×N shards): Apply the rules catalog to shard files

**Files:** Modify only the files in the assigned shard list.

**Interfaces:** Consumes: Appendix A rules + the Task 3 `SPACING_BRANCH`. Produces: shard files with zero remaining Appendix A / R7 matches.

- [ ] **Step 1:** Read Appendix A of this plan in full (`docs/superpowers/plans/2026-07-08-architect-shared-theme-migration.md`).
- [ ] **Step 2:** For each file in the shard, apply rules R1–R6. Judgment sites (do not blind-replace): `sm:` remaps (R6 — review the layout at 480px vs 640px intent; pick `phone-landscape:` or `tablet-portrait:` accordingly and note the choice), `hsl(var(--x) / N)` opacity forms (R5 — prefer utility opacity modifiers like `bg-navy-taupe/50` in class positions, `color-mix(in oklab, var(--color-x) N%, transparent)` in CSS positions), `text-5xl`/`text-6xl` (→ `text-4xl` or `hero`, whichever matches the heading's role).
- [ ] **Step 3:** Self-check the shard: run the R7 forbidden-pattern greps (Appendix A) restricted to the shard's files. Expected: zero matches. Fix any stragglers.
- [ ] **Step 4:** Return a summary: files touched, per-rule counts, judgment calls made (especially every `sm:` decision).
- [ ] **Step 5 (orchestrator, after all shards):** Commit: `git add -A && git commit -m "refactor(architect): migrate src to shared theme tokens"`.

---

## Phase 2 — Specialists (parallel; disjoint files)

### Task 6: Fonts, PWA/CSP, providers, stacking

**Files:**

- Modify: `apps/architect/src/main.tsx`, `apps/architect/vite.config.ts`

- [ ] **Step 1:** In `main.tsx`, add as the first two imports (mirrors `apps/architect/src/preview-main.tsx:1-2` and `apps/interviewer/src/main.tsx:1-2`):

```ts
import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
```

- [ ] **Step 2:** In `vite.config.ts` `CONTENT_SECURITY_POLICY` (lines 22–35): remove `https://fonts.googleapis.com` from `style-src`, `https://fonts.gstatic.com` from `font-src`, and both font hosts from `connect-src`. Everything else stays.
- [ ] **Step 3:** In the `workbox` block: delete the two Google-Fonts `runtimeCaching` entries (lines ~130–143) and add self-hosted font caching (pattern copied from `apps/interviewer/vite.config.ts:82-92`):

```ts
{
  urlPattern: /\.(?:woff2?|ttf|otf|eot)$/i,
  handler: 'CacheFirst',
  options: {
    cacheName: 'architect-fonts',
    expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
    cacheableResponse: { statuses: [0, 200] },
  },
},
```

- [ ] **Step 4:** Wrap the app for fresco-ui overlays: in `main.tsx` (or `App` if that's where the top-level div lives), give the root wrapper `className="root h-full"` and mount the providers around the app tree:

```tsx
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { PortalContainerProvider } from '@codaco/fresco-ui/PortalContainer';

// PortalContainerProvider outermost so dialogs portal into its layer:
<PortalContainerProvider>
  <DialogProvider>{/* existing app tree */}</DialogProvider>
</PortalContainerProvider>;
```

Do not migrate any existing Architect modal to `useDialog` — wiring only.

- [ ] **Step 5:** Stacking audit: fresco-ui's `PortalContainer` renders a `fixed inset-0 isolate z-50` layer. Architect z values (R4: `z-100`…`z-3000`) sit in the root stacking context. Verify: open the NavShell `ModalPopup` and the AppUpdate dialog over a screen with Architect panels; fresco-ui overlays must not render beneath Architect UI. If they do, the fix is lowering the Architect z map (all seven values, proportionally) — record what was chosen.
- [ ] **Step 6:** `manifest.background_color` (`#edf2f8`) and `theme_color` stay — background remains platinum.

### Task 7: ProtocolSummary print view

**Files:**

- Modify: `apps/architect/src/lib/ProtocolSummary/styles/protocol-summary.css`, plus every `.tsx` under `apps/architect/src/lib/ProtocolSummary/**` (this directory was excluded from Phase 1 shards; apply Appendix A rules here too)

- [ ] **Step 1:** In `protocol-summary.css`: `hsl(var(--platinum))` (line 49) → `var(--color-platinum)`; `border: 1px hsl(var(--platinum-dark)) solid` (line 61) → `border: 1px var(--color-platinum-dark) solid`; the print-block `--base-font-size: 12px` re-base (lines 29–34) → `--theme-root-size: 12px` (the ported `protocol-summary-surface` utility in `architect-theme.css` already sets it for screen; keep the print block consistent).
- [ ] **Step 2:** Apply Appendix A rules R1–R6 to the ProtocolSummary `.tsx` files (known sites: `var(--heading-font-family)` in `components/Stage/Stage.tsx` → `var(--heading-font)`; `bg-platinum`, `text-neon-coral`, `border-platinum-dark`, `text-navy-taupe/70`, `bg-cyber-grape`, `table-row-tint` in `MiniTable.tsx` survive by name).
- [ ] **Step 3:** Self-check with the R7 greps over `lib/ProtocolSummary/**` — zero matches expected.

### Task 8: Lint config + dead-config cleanup

**Files:**

- Modify: `apps/architect/.oxlintrc.json`
- Delete (if still present): `apps/architect/tailwind.config.js`; `sass` dep in `apps/architect/package.json`; `css.preprocessorOptions.scss` block in `apps/architect/vite.config.ts`; stale SCSS claims in `apps/architect/README.md`

- [ ] **Step 1:** In `.oxlintrc.json`, set the tailwind plugin entrypoint to the rewritten entry: `"settings": { "tailwindcss": { "entryPoint": "apps/architect/src/styles/tailwind.css" } }` — the path is unchanged but verify it still resolves; the other packages point at `tooling/tailwind/fresco/fresco.css`, which is wrong for Architect (it would miss the app layer's custom utilities).
- [ ] **Step 2:** Dead-config removals: **skip each item that the independent cleanup session (background task "Remove dead styling config from Architect") already landed** — check `git log --oneline -10 -- apps/architect` first. Coordinate, don't duplicate. Note Task 6 also edits `vite.config.ts`; if executing in parallel, leave the scss-block removal to this task but apply it after Task 6 completes (the workflow script serializes these two edits).
- [ ] **Step 3 (orchestrator, after Tasks 6–8):** Commit: `git add -A && git commit -m "feat(architect): self-hosted fonts, fresco-ui wiring, config repoint"`.

---

## Phase 3 — Verification (single pass per round)

### Task 9: Machine gates

- [ ] **Step 1:** `pnpm typecheck` — expected: clean (first run may surface shard misses; failures go to the Phase 4 fix loop).
- [ ] **Step 2:** `pnpm lint` (repo root) — expected: no new errors vs `main`; tailwind-plugin unknown-class warnings in `apps/architect` are real misses, send to fix loop.
- [ ] **Step 3:** `pnpm knip` — expected: clean (Task 1 dropped utilities; Task 8 removed deps).
- [ ] **Step 4:** `pnpm --filter @codaco/architect build` — expected: success, no Tailwind `@apply`/unknown-utility errors.
- [ ] **Step 5:** R7 forbidden-pattern sweep (Appendix A, exact commands) over `apps/architect/src` + `index.html`, excluding `preview.css`/`preview-main.tsx`/`PreviewHost` — expected: zero matches.

### Task 10: Visual pass

- [ ] **Step 1:** Start the dev server; re-shoot every capture from Task 0 using NOTES.md's exact interaction paths and viewport.
- [ ] **Step 2:** Diff against baselines. Acceptance per spec: near-nil diffs, except (a) fresco-ui components going broken→correct — **required**: AppUpdate tooltip has an opaque `surface-popover` panel, its dialog has a visible backdrop + constrained panel + colored primary button; (b) fluid-type deltas at the capture viewport (should be small at 1440×900); (c) sub-2px spacing drift iff Branch B; (d) charcoal/rich-black sites — list each visible one with a keep/swap recommendation.
- [ ] **Step 3:** Print check: `summary-print.png` re-shoot + print-media emulation — page cards, 12px re-base, and platinum card backgrounds must match baseline.
- [ ] **Step 4:** Regression check: open the preview popup (launch a stage preview from StageEditor) — must render identically to baseline (its document is untouched).
- [ ] **Step 5:** Return a findings list: `{screen, description, severity, suspected files}` per issue.

### Task 11: Adversarial diff review

- [ ] **Step 1:** Two reviewers over `git diff main...HEAD -- apps/architect`, each with a distinct lens: (1) correctness — mis-renames, class-position edits that hit identifiers/data, missed `var()` sites, `sm:` decisions that changed layout semantics; (2) completeness — Appendix A families with surviving instances, `@apply` of nonexistent utilities, elevation-plugin `--scoped-bg` interactions. Findings in the same `{file, line, description, severity}` shape.

---

## Phase 4 — Fix loop and delivery

### Task 12: Fix loop

- [ ] **Step 1:** Merge Task 9–11 findings; fan out fix agents (≤1 per file cluster). Re-run Task 9 steps 1–5 and re-shoot only the affected Task 10 captures. Repeat until **two consecutive rounds produce zero findings** (cap: 4 rounds; if still failing, stop and report).
- [ ] **Step 2 (orchestrator):** Commit fixes per round: `git commit -m "fix(architect): theme migration round N fixes"`.

### Task 13: Changeset + handoff

- [ ] **Step 1:** Create an **app-only** changeset (see `creating-a-changeset` skill): patch/minor bump for `@codaco/architect` only, describing the shared-theme adoption and fresco-ui fix. Never include a `packages/*` entry.
- [ ] **Step 2:** Commit the changeset. Hand off to the `shipping-a-pull-request` skill for PR creation and CI watching (outside the workflow).

---

## Appendix A — Rules catalog

Authoritative copy in the spec (`docs/superpowers/specs/2026-07-08-architect-shared-theme-migration-design.md` §Rules catalog); duplicated here so shard agents need only this document. Rules apply to class positions and CSS `var()` positions only.

**R1 — Semantic renames:**

| From                                                                                                                                                     | To                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `*-error` / `*-error-foreground`                                                                                                                         | `*-destructive` / `*-destructive-contrast`                         |
| `text-foreground` (any `*-foreground` where stem is `foreground` itself)                                                                                 | `text-text` etc.                                                   |
| `*-muted-foreground`                                                                                                                                     | `*-muted`                                                          |
| `*-{primary,secondary,accent,surface-1,surface-2,surface-3,surface-accent,timeline,input,sortable,action,warning,success,info,fresco-purple}-foreground` | same stem + `-contrast`                                            |
| `sortable-background`                                                                                                                                    | unchanged (app token); `sortable-foreground` → `sortable-contrast` |
| `border-border`                                                                                                                                          | `border-outline`                                                   |
| `*-divider`                                                                                                                                              | `*-outline`                                                        |
| `*-input-placeholder`                                                                                                                                    | `placeholder:text-input-contrast/50` idiom                         |
| `bg-shadow` / `bg-shadow-elevated` (1 site)                                                                                                              | inline `bg-black/15` / `bg-black/25`                               |
| `var(--modal-overlay)` (1 site)                                                                                                                          | `var(--color-overlay)` (or `bg-overlay` in class position)         |
| `var(--heading-font-family)` / `var(--body-font-family)`                                                                                                 | `var(--heading-font)` / `var(--body-font)`                         |

Survive via app layer (leave alone): `background`, `selected`, `warning`, `success`, `info`, `link`, `primary`, `secondary`, `accent`, `surface-1/2/3`, `input`, `white`, `black`, `transparent`, named palette utilities, `rules-*`/`rule-*`, `timeline`, `sortable-background`, `table-row-tint`, `form-control`, `action`, `hover`/`focus`/`active`, `input-active`, `surface-accent`, `fresco-purple`, `muted`.

**R2 — Spacing (Branch decided by Task 3):**

| Token         | rem | Branch A | Branch B |
| ------------- | --- | -------- | -------- |
| `--space-0`   | 0   | `0`      | `0`      |
| `--space-xs`  | 0.3 | `1.2`    | `1`      |
| `--space-sm`  | 0.6 | `2.4`    | `2.5`    |
| `--space-md`  | 1.2 | `4.8`    | `5`      |
| `--space-lg`  | 1.8 | `7.2`    | `7`      |
| `--space-xl`  | 2.4 | `9.6`    | `10`     |
| `--space-2xl` | 3.6 | `14.4`   | `14`     |
| `--space-3xl` | 4.8 | `19.2`   | `19`     |
| `--space-4xl` | 6   | `24`     | `24`     |
| `--space-5xl` | 7.2 | `28.8`   | `29`     |
| `--space-6xl` | 8.4 | `33.6`   | `34`     |

Forms: `p-(--space-md)` → `p-4.8`/`p-5`; `gap-(--space-sm)` → `gap-2.4`/`gap-2.5`; raw `var(--space-md)` in CSS → literal `1.2rem` (Branch A and B alike — CSS positions keep exact values).

**R3 — Motion:** `duration-(--animation-duration-standard)` → `duration-300`; `-fast` → `duration-150`; `-slow` → `duration-500`; `ease-(--animation-easing)` → `ease-in-out`. Raw CSS `var()` forms → literals `300ms`/`150ms`/`500ms`/`cubic-bezier(0.4, 0, 0.2, 1)`.

**R4 — Z-index:** `--z-fx`→`z-1`, `--z-panel`→`z-10`, `--z-global-ui`→`z-20`, `--z-default`→`z-100`, `--z-dialog`→`z-1000`, `--z-modal`→`z-2000`, `--z-tooltip`→`z-3000`. Use `z-[N]` arbitrary form if Task 3 found bare numbers don't compile. Raw CSS `var(--z-*)` → the literal number.

**R5 — hsl()/vars:** Background: the shared theme is `@theme inline` and emits **no** `--color-*` variables at runtime; `var(--color-x)` only resolves because the app layer's `@theme static` re-emission block (Task 1 §2b) defines it. Rules: `hsl(var(--x))` → `var(--color-x)`; `hsl(var(--x-dark))` → `var(--color-x-dark)`; `hsl(var(--x) / N)` → opacity modifier (e.g. `bg-navy-taupe/50`) in class positions, `color-mix(in oklab, var(--color-x) N%, transparent)` in CSS positions (judgment). **Existing `var(--color-x)` / `var(--color-x-dark)` reads (SVG icons, inline styles — 149 sites) are left unchanged** — they resolve via §2b. Dynamic sites: determine each site's value domain first; codebook sequence names (`node/edge/ord-color-seq-N`) → `var(--${color})` and `var(--${color}-dark)` (app-layer aliases, single-hyphen dark); palette-name domains → `var(--color-${color})` / `var(--color-${color}-dark)`. `var(--picker-size)`/`var(--picker-border-size)` (ColorPicker only) → literals `60px`/`4px`.

**R6 — Breakpoints:** `md:`→`tablet-portrait:`, `lg:`→`tablet-landscape:`, `xl:`→`laptop:`, `2xl:`→`desktop:` (mechanical); `sm:`→ judgment per site (`phone-landscape:` at 480 or `tablet-portrait:` at 768 — pick by layout intent, record the decision).

**R7 — Forbidden patterns (zero matches at completion).** From repo root, scope `apps/architect/src apps/architect/index.html`, excluding `src/styles/preview.css`, `src/preview-main.tsx`, `src/components/PreviewHost`:

```bash
grep -rn "hsl(var(" --include='*.tsx' --include='*.ts' --include='*.css'
grep -rn -- "--space-\|--animation-\|--z-\|--picker-\|--modal-overlay\|--heading-font-family\|--body-font-family\|--base-font-size" --include='*.tsx' --include='*.ts' --include='*.css'
grep -rnE "\b(text|bg|border|outline|ring|fill|stroke|decoration)-(error|foreground|muted-foreground|divider)\b|border-border|-(foreground)\b" --include='*.tsx' --include='*.ts' --include='*.css'
grep -rnE "[\"'\` ](sm|md|lg|xl|2xl):" --include='*.tsx' --include='*.ts'
grep -rn "@import 'tailwindcss'" apps/architect/src
```

(The `-foreground` grep intentionally catches all remaining `*-foreground` class tokens; `--base-font-size` must be gone everywhere including the print CSS after Task 7.)

## Appendix B — Workflow orchestration script

Run with the Workflow tool from the worktree session. Phase titles match `meta.phases`. The script assumes this plan file and the spec are committed (agents read them from the repo).

```js
export const meta = {
  name: 'architect-theme-migration',
  description: 'Execute the architect shared-theme migration plan',
  phases: [
    { title: 'Foundation', detail: 'baselines, app layer, entry, spike' },
    { title: 'Codemods', detail: 'sharded R1-R6 application' },
    { title: 'Specialists', detail: 'fonts/PWA/providers, print view, config' },
    { title: 'Verify', detail: 'gates, visual pass, adversarial review' },
    { title: 'Fix', detail: 'loop until two clean rounds' },
  ],
};

const ROOT =
  '/Users/jmh629/Projects/network-canvas/.claude/worktrees/pensive-shaw-8a2c16';
const PLAN =
  'docs/superpowers/plans/2026-07-08-architect-shared-theme-migration.md';
const PREAMBLE = `Repo root (git worktree; NEVER use paths without the .claude/worktrees prefix): ${ROOT}. Read ${PLAN} before acting; your task number is authoritative. Do not commit, typecheck, build, or run tests unless your task says to. Never touch preview.css, preview/, PreviewHost/, packages/, tooling/.`;

phase('Foundation');
const baseline = await agent(
  `${PREAMBLE} Execute Task 0 (visual baselines). Return the scratchpad paths + NOTES.md content.`,
  { label: 'baselines', phase: 'Foundation' },
);
await agent(
  `${PREAMBLE} Execute Task 1 exactly (create architect-theme.css with the plan's content verbatim).`,
  { label: 'app-layer', phase: 'Foundation' },
);
await agent(
  `${PREAMBLE} Execute Task 2 exactly (entry rewrite + index.html font links).`,
  { label: 'entry', phase: 'Foundation' },
);
const spike = await agent(
  `${PREAMBLE} Execute Task 3 (build spike). Return JSON.`,
  {
    label: 'spike',
    phase: 'Foundation',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['spacingBranch', 'bareZWorks', 'buildOk', 'notes'],
      properties: {
        spacingBranch: { enum: ['A', 'B'] },
        bareZWorks: { type: 'boolean' },
        buildOk: { type: 'boolean' },
        notes: { type: 'string' },
      },
    },
  },
);
if (!spike || !spike.buildOk)
  throw new Error(
    'Foundation build failed — fix before fan-out: ' + (spike && spike.notes),
  );
await agent(
  `${PREAMBLE} Run: git add -A && git commit -m "feat(architect): adopt shared fresco theme foundation" (from ${ROOT}). Return the commit hash.`,
  { label: 'commit-foundation', phase: 'Foundation' },
);

phase('Codemods');
const plan = await agent(
  `${PREAMBLE} Execute Task 4 (shard planning). Return JSON.`,
  {
    label: 'shard-planner',
    phase: 'Codemods',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['shards'],
      properties: {
        shards: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'files'],
            properties: {
              name: { type: 'string' },
              files: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  },
);
const shardResults = await parallel(
  plan.shards.map(
    (s) => () =>
      agent(
        `${PREAMBLE} Execute Task 5 for shard "${s.name}". SPACING_BRANCH=${spike.spacingBranch}; bare z numbers ${spike.bareZWorks ? 'work' : 'do NOT work — use z-[N]'}. Your files (touch nothing else):\n${s.files.join('\n')}\nApply Appendix A rules R1-R6, self-check with R7 restricted to these files, return: files touched, per-rule counts, every judgment call (all sm: decisions).`,
        { label: `shard:${s.name}`, phase: 'Codemods' },
      ),
  ),
);
log(
  `${shardResults.filter(Boolean).length}/${plan.shards.length} shards complete`,
);
await agent(
  `${PREAMBLE} Run: git add -A && git commit -m "refactor(architect): migrate src to shared theme tokens" (from ${ROOT}).`,
  { label: 'commit-codemods', phase: 'Codemods' },
);

phase('Specialists');
const fontsProviders = await agent(
  `${PREAMBLE} Execute Task 6 (fonts, PWA/CSP, providers, stacking audit). Report the stacking-audit outcome explicitly.`,
  { label: 'fonts-providers', phase: 'Specialists' },
);
await parallel([
  () =>
    agent(
      `${PREAMBLE} Execute Task 7 (ProtocolSummary print view + its tsx codemods). SPACING_BRANCH=${spike.spacingBranch}.`,
      { label: 'print-view', phase: 'Specialists' },
    ),
  () =>
    agent(
      `${PREAMBLE} Execute Task 8 (oxlint repoint + dead config; check git log first — a parallel cleanup session may have landed some removals; Task 6 already finished, so vite.config.ts is free to edit). Context from Task 6: ${String(fontsProviders).slice(0, 500)}`,
      { label: 'config', phase: 'Specialists' },
    ),
]);
await agent(
  `${PREAMBLE} Run: git add -A && git commit -m "feat(architect): self-hosted fonts, fresco-ui wiring, config repoint" (from ${ROOT}).`,
  { label: 'commit-specialists', phase: 'Specialists' },
);

const FINDINGS = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'description', 'severity'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          description: { type: 'string' },
          severity: { enum: ['blocker', 'major', 'minor'] },
        },
      },
    },
  },
};

let cleanRounds = 0;
let round = 0;
while (cleanRounds < 2 && round < 4) {
  round += 1;
  phase('Verify');
  const [gates, visual, reviewA, reviewB] = await parallel([
    () =>
      agent(
        `${PREAMBLE} Execute Task 9 (machine gates: typecheck, lint, knip, architect build, R7 sweep — you ARE authorized to run these). Return findings JSON (empty if all clean).`,
        { label: `gates-r${round}`, phase: 'Verify', schema: FINDINGS },
      ),
    () =>
      agent(
        `${PREAMBLE} Execute Task 10 (visual pass) against these baselines: ${String(baseline).slice(0, 800)}. Round ${round}${round > 1 ? ' — re-shoot only screens affected by the last fix round, plus any prior failures' : ''}. Return findings JSON.`,
        { label: `visual-r${round}`, phase: 'Verify', schema: FINDINGS },
      ),
    () =>
      agent(
        `${PREAMBLE} Execute Task 11 lens 1 (correctness review of git diff main...HEAD -- apps/architect). Return findings JSON.`,
        {
          label: `review-correctness-r${round}`,
          phase: 'Verify',
          schema: FINDINGS,
          effort: 'high',
        },
      ),
    () =>
      agent(
        `${PREAMBLE} Execute Task 11 lens 2 (completeness review). Return findings JSON.`,
        {
          label: `review-completeness-r${round}`,
          phase: 'Verify',
          schema: FINDINGS,
          effort: 'high',
        },
      ),
  ]);
  const all = [gates, visual, reviewA, reviewB]
    .filter(Boolean)
    .flatMap((r) => r.findings);
  const actionable = all.filter((f) => f.severity !== 'minor');
  log(
    `Round ${round}: ${all.length} findings (${actionable.length} actionable)`,
  );
  if (actionable.length === 0) {
    cleanRounds += 1;
    continue;
  }
  cleanRounds = 0;
  phase('Fix');
  const byFile = {};
  actionable.forEach((f) => {
    (byFile[f.file] = byFile[f.file] || []).push(f);
  });
  await parallel(
    Object.entries(byFile).map(
      ([file, fs]) =>
        () =>
          agent(
            `${PREAMBLE} Execute Task 12 fixes for ${file} (consult Appendix A):\n${fs.map((f) => `- [${f.severity}] ${f.description}${f.line ? ' (line ' + f.line + ')' : ''}`).join('\n')}`,
            { label: `fix:${file.split('/').pop()}`, phase: 'Fix' },
          ),
    ),
  );
  await agent(
    `${PREAMBLE} Run: git add -A && git commit -m "fix(architect): theme migration round ${round} fixes" (from ${ROOT}).`,
    { label: `commit-fixes-r${round}`, phase: 'Fix' },
  );
}
if (cleanRounds < 2)
  return {
    status: 'NEEDS_ATTENTION',
    message: 'Fix loop hit round cap without two clean rounds',
  };
return { status: 'CLEAN', rounds: round, spacingBranch: spike.spacingBranch };
```

After the workflow returns `CLEAN`: Task 13 (changeset + `shipping-a-pull-request`) runs in the main session, not inside the workflow.
