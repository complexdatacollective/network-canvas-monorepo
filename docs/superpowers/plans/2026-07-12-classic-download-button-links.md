# Classic Download Button Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-styled Architect Classic and Interviewer Classic platform download anchors with the existing Fresco-derived `ButtonLink` component.

**Architecture:** Keep downloads as semantic external anchors while delegating sizing, typography, focus, and interaction styling to `@codaco/fresco-ui/Button` through `ButtonLink`. Preserve the existing platform icon, label, external-link icon, accessible name, destination, and wrapping layout.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, `@codaco/fresco-ui`, Lucide React.

## Global Constraints

- Modify only `apps/networkcanvas.com/components/get-started/AppChoiceCard.tsx` production code.
- Preserve all copy, URLs, icons, accessible labels, and external-link behavior.
- Use `ButtonLink` with Fresco UI's outline treatment; retain only card-specific translucency and pill rounding as local classes.
- Add no new tests, as requested by the user.

---

### Task 1: Migrate Classic platform downloads to ButtonLink

**Files:**

- Modify: `apps/networkcanvas.com/components/get-started/AppChoiceCard.tsx:10-79`

**Interfaces:**

- Consumes: `ButtonLink({ href, external, variant, color, size, className, children, ...anchorProps })` from `~/components/ui/ButtonLink`.
- Produces: semantic external platform download links styled by Fresco UI button variants.

- [ ] **Step 1: Import the existing ButtonLink primitive**

Add this import beside the other local UI imports:

```tsx
import { ButtonLink } from '~/components/ui/ButtonLink';
```

- [ ] **Step 2: Replace each hand-styled platform anchor**

Replace the `<a>` in `PlatformActions` with:

```tsx
<ButtonLink
  key={platform.id}
  href={platform.href}
  external
  variant="outline"
  color="dynamic"
  aria-label={`${platform.label} for ${app.name}`}
  className="rounded-full bg-white/70 hover:bg-white"
>
  <PlatformIcon aria-hidden className="size-4" />
  {platform.label}
  <ExternalLink aria-hidden className="size-3.5" />
</ButtonLink>
```

This removes the locally reimplemented focus, border, typography, padding, and transform styles while preserving anchor semantics and content.

- [ ] **Step 3: Format, lint, and type-check**

Run:

```bash
pnpm exec oxfmt --write apps/networkcanvas.com/components/get-started/AppChoiceCard.tsx
pnpm exec oxlint --fix apps/networkcanvas.com/components/get-started/AppChoiceCard.tsx
pnpm --filter networkcanvas.com typecheck
```

Expected: all commands exit successfully with no diagnostics.

- [ ] **Step 4: Verify the static build and live page**

Run:

```bash
pnpm --filter networkcanvas.com build
```

Expected: `/get-started` is generated as static content. Inspect the Classic cards at desktop and narrow widths; confirm the buttons wrap, retain all three icons/labels, show visible focus, and open the unchanged external URLs.

- [ ] **Step 5: Commit the implementation**

```bash
git add apps/networkcanvas.com/components/get-started/AppChoiceCard.tsx docs/superpowers/plans/2026-07-12-classic-download-button-links.md
git commit -m "refactor(website): use button links for classic downloads"
```
