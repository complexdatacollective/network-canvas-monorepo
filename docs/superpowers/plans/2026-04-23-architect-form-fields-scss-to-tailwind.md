# architect-vite form-field SCSS-to-Tailwind Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all form-field legacy stylesheets from `apps/architect-vite` by porting fresco-next's design-system foundations (tokens, plugins, CVA variants, field wrapper components) and rewriting each field component to consume them.

**Architecture:** Seven-phase execution. Phase 1 registers plugins/utilities/breakpoints. Phase 2 is a rip-and-replace sweep renaming architect's tokens to fresco-compatible names. Phase 3 ports the shared `controlVariants.ts` module. Phase 4 ports `BaseField`/`FieldLabel`/`FieldErrors`/`Hint`. Phase 5 migrates fresco-shape fields one at a time. Phase 6 migrates orphan fields structurally. Phase 7 deletes residual CSS and aggregator imports. Each phase ends with build + typecheck + lint + dev-server smoke test + commit.

**Tech Stack:** React 19, Vite, Tailwind CSS v4, `cva` (class-variance-authority via `defineConfig`), `redux-form`, `base-ui` (for Select), `classnames` (legacy, being phased out). Biome for formatter/linter (tabs, 120-col, double quotes). `pnpm` workspace; commands scoped with `pnpm --filter architect-vite`.

**Reference paths (the sources we port FROM — read-only):**
- `~/Projects/fresco-next/styles/shared/controlVariants.ts`
- `~/Projects/fresco-next/styles/plugins/tailwind-inset-surface/index.ts`
- `~/Projects/fresco-next/styles/plugins/tailwind-elevation/{index.ts,jwc.ts,utils.ts}`
- `~/Projects/fresco-next/lib/form/components/Field/BaseField.tsx`
- `~/Projects/fresco-next/lib/form/components/FieldLabel.tsx`
- `~/Projects/fresco-next/lib/form/components/FieldErrors.tsx`
- `~/Projects/fresco-next/lib/form/components/Hint.tsx`
- `~/Projects/fresco-next/lib/form/components/fields/*.tsx`

**Spec:** `docs/superpowers/specs/2026-04-23-architect-form-fields-scss-to-tailwind-design.md`

---

## Conventions for every task

- Work in branch `design/refinement`. Do **not** create worktrees (user preference).
- Use `pnpm --filter architect-vite <command>` for all pnpm operations.
- Commit after every task. Each task's last step is a commit step.
- `pnpm typecheck`, `pnpm build`, `pnpm lint` in this plan always mean the `--filter architect-vite` form.
- When the plan says "copy verbatim from fresco", read the source file from the reference path above and write the same content into the destination. Only apply edits this plan explicitly calls out.
- Never use `as` assertions or `any`. Fix type errors at their root.
- Never add barrel files (`index.ts`). If an existing `index.ts` is encountered in a file-path, it's pre-existing; don't create new ones.
- Biome will auto-format on commit via pre-commit hook; don't hand-format.
- When deleting tracked files, always use `git rm <path>` (not `rm <path>`). `git rm` removes the file from the working tree AND stages the deletion in one command; a plain `rm` followed by `git rm` in the commit step will fail because the file is already gone. The commit step then only needs to `git add` modified/created files.

---

# Phase 1 — Plugins, breakpoints, focus utilities

## Task 1.1: Install @tailwindcss/forms

**Files:**
- Modify: `apps/architect-vite/package.json`
- Modify: `pnpm-lock.yaml` (auto)

- [ ] **Step 1: Check if already installed**

Run: `rg '"@tailwindcss/forms"' apps/architect-vite/package.json pnpm-workspace.yaml`
Expected: no matches (confirm it's not already present)

- [ ] **Step 2: Install from catalog**

Check `pnpm-workspace.yaml` to see if `@tailwindcss/forms` is in the `catalog:`. If yes: `pnpm --filter architect-vite add @tailwindcss/forms@catalog:`. If no: look up the latest stable version compatible with Tailwind v4 (check `fresco-next/package.json` for the version fresco uses), add to the catalog, then install via catalog. Use the same pattern other shared tailwind deps follow.

Run: `pnpm --filter architect-vite add @tailwindcss/forms@<version>`
Expected: installed cleanly, `package.json` shows new dep

- [ ] **Step 3: Verify install**

Run: `pnpm --filter architect-vite list @tailwindcss/forms`
Expected: shows the installed version

- [ ] **Step 4: Commit**

```bash
git add apps/architect-vite/package.json pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "chore(architect-vite): add @tailwindcss/forms dep"
```

---

## Task 1.2: Port tailwind-inset-surface plugin

**Files:**
- Create: `apps/architect-vite/src/styles/plugins/tailwind-inset-surface/index.ts`

- [ ] **Step 1: Read fresco source**

Read `~/Projects/fresco-next/styles/plugins/tailwind-inset-surface/index.ts`. This is the exact file to port.

- [ ] **Step 2: Create the directory and file**

Write the file at `apps/architect-vite/src/styles/plugins/tailwind-inset-surface/index.ts` with the verbatim content of fresco's file. No edits.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter architect-vite typecheck`
Expected: passes (the plugin isn't registered yet, so it's inert — just verifies imports resolve)

- [ ] **Step 4: Commit**

```bash
git add apps/architect-vite/src/styles/plugins/tailwind-inset-surface
git commit -m "feat(architect-vite): port tailwind-inset-surface plugin from fresco-next"
```

---

## Task 1.3: Port tailwind-elevation plugin (three files)

**Files:**
- Create: `apps/architect-vite/src/styles/plugins/tailwind-elevation/index.ts`
- Create: `apps/architect-vite/src/styles/plugins/tailwind-elevation/jwc.ts`
- Create: `apps/architect-vite/src/styles/plugins/tailwind-elevation/utils.ts`

- [ ] **Step 1: Read fresco sources**

Read all three from `~/Projects/fresco-next/styles/plugins/tailwind-elevation/`.

- [ ] **Step 2: Create the three files**

Write each file at its architect counterpart path with the verbatim content. No edits.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter architect-vite typecheck`
Expected: passes

- [ ] **Step 4: Commit**

```bash
git add apps/architect-vite/src/styles/plugins/tailwind-elevation
git commit -m "feat(architect-vite): port tailwind-elevation plugin from fresco-next"
```

---

## Task 1.4: Add fresco breakpoints to tailwind.css

**Files:**
- Modify: `apps/architect-vite/src/styles/tailwind.css`

- [ ] **Step 1: Locate the `@theme static` block**

Open `apps/architect-vite/src/styles/tailwind.css`. Find the `@theme static { ... }` block (starts around line 245).

- [ ] **Step 2: Insert the breakpoint block**

Insert the following inside `@theme static { ... }`, immediately after the `--color-*` definitions and before `--space-0` (so it sits between colors and spacing):

```css
/* Breakpoints — override Tailwind defaults with the fresco set */
--breakpoint-*: initial;
--breakpoint-phone: 320px;
--breakpoint-phone-portrait-max: 479px;
--breakpoint-phone-landscape: 480px;
--breakpoint-phone-landscape-max: 767px;
--breakpoint-tablet-portrait: 768px;
--breakpoint-tablet-portrait-max: 1023px;
--breakpoint-tablet-landscape: 1024px;
--breakpoint-tablet-landscape-max: 1279px;
--breakpoint-laptop: 1280px;
--breakpoint-laptop-max: 1535px;
--breakpoint-desktop: 1536px;
--breakpoint-desktop-max: 1919px;
--breakpoint-desktop-lg: 1920px;
--breakpoint-desktop-xl: 2560px;
```

- [ ] **Step 3: Build to verify**

Run: `pnpm --filter architect-vite build`
Expected: passes. There WILL be visual breakage at this point because default breakpoint utilities (`md:`, `lg:`) now don't resolve — Task 2.6 fixes those.

- [ ] **Step 4: Commit**

```bash
git add apps/architect-vite/src/styles/tailwind.css
git commit -m "feat(architect-vite): add fresco breakpoints, remove Tailwind defaults"
```

---

## Task 1.5: Add focus utilities and custom variant to tailwind.css

**Files:**
- Modify: `apps/architect-vite/src/styles/tailwind.css`

- [ ] **Step 1: Append utilities and variant**

At the end of `tailwind.css`, after the existing `@utility clickable-3 { ... }` block, append:

```css
@custom-variant focus-visible-within (&:has(:focus-visible));

@utility focus-styles {
	@apply outline-4 outline-offset-3 transition-all duration-200 ease-in-out;
}

@utility focusable {
	outline-color: var(--focus-color, currentColor);
	@apply focus-visible:focus-styles;
}

@utility focusable-within {
	outline-color: var(--focus-color, currentColor);
	@apply focus-visible-within:focus-styles;
}
```

- [ ] **Step 2: Build to verify**

Run: `pnpm --filter architect-vite build`
Expected: passes

- [ ] **Step 3: Commit**

```bash
git add apps/architect-vite/src/styles/tailwind.css
git commit -m "feat(architect-vite): add focus-styles, focusable utilities and focus-visible-within variant"
```

---

## Task 1.6: Register plugins in tailwind.css

**Files:**
- Modify: `apps/architect-vite/src/styles/tailwind.css`

- [ ] **Step 1: Add @plugin directives**

At the top of `tailwind.css`, immediately after `@import "tailwindcss";`, insert:

```css
@plugin "@tailwindcss/forms";
@plugin "./plugins/tailwind-inset-surface/index.ts";
@plugin "./plugins/tailwind-elevation/index.ts";
```

- [ ] **Step 2: Build to verify**

Run: `pnpm --filter architect-vite build`
Expected: passes. The build log should show Tailwind loading the three plugins. If elevation's `matchUtilities` or forms reset fails, fix before proceeding.

- [ ] **Step 3: Boot dev server and visually check**

Run: `pnpm --filter architect-vite dev`
Navigate to the home page. Expected: app loads. Some inputs may look slightly different now that `@tailwindcss/forms` is applying — that's expected and will be normalized when fields are migrated in Phase 5. If the app fails to load or throws console errors, stop and diagnose.

Kill the dev server once verified.

- [ ] **Step 4: Commit**

```bash
git add apps/architect-vite/src/styles/tailwind.css
git commit -m "feat(architect-vite): register forms, inset-surface, elevation plugins"
```

---

# Phase 2 — Token rename sweep (rip-and-replace)

## Task 2.1: Rename tokens in tailwind.css definitions

**Files:**
- Modify: `apps/architect-vite/src/styles/tailwind.css`

- [ ] **Step 1: Apply the full rename table**

In `tailwind.css`, rename every CSS custom property definition according to the spec's Section 2 rename table. Concrete edits (the order matters — do `--color-error-foreground` before `--color-error` to avoid partial matches):

- `--color-input-foreground` → `--color-input-contrast` (both the definition and any uses within the same file)
- `--color-primary-foreground` → `--color-primary-contrast`
- `--color-secondary-foreground` → `--color-secondary-contrast`
- `--color-accent-foreground` → `--color-accent-contrast`
- `--color-action-foreground` → `--color-action-contrast`
- `--color-timeline-foreground` → `--color-timeline-contrast`
- `--color-success-foreground` → `--color-success-contrast`
- `--color-warning-foreground` → `--color-warning-contrast`
- `--color-info-foreground` → `--color-info-contrast`
- `--color-error-foreground` → `--color-destructive-contrast`
- `--color-error` → `--color-destructive`
- `--color-surface-1-foreground` → `--color-surface-1-contrast`
- `--color-surface-2-foreground` → `--color-surface-2-contrast`
- `--color-surface-3-foreground` → `--color-surface-3-contrast`
- `--color-surface-accent-foreground` → `--color-surface-accent-contrast`
- `--color-sortable-foreground` → `--color-sortable-contrast`
- `--color-border` → `--color-outline`
- `--color-foreground` → `--color-text`

Also: within the `body { ... }` rule under `@layer base`, update `@apply bg-background text-foreground ...` → `@apply bg-background text-text ...`.

- [ ] **Step 2: Add new surface-popover tokens**

In the `@theme static { ... }` block, add:

```css
--color-surface-popover: hsl(var(--white));
--color-surface-popover-contrast: hsl(var(--navy-taupe));
```

Place them near the other `--color-surface-*` definitions.

- [ ] **Step 3: Verify grep shows only the new names in tailwind.css**

Run: `rg "foreground|--color-error|--color-border" apps/architect-vite/src/styles/tailwind.css`
Expected: no matches, except any legitimate `font-weight` usages. If `--color-error-foreground` or `--color-input-foreground` etc. appear, fix them.

- [ ] **Step 4: Build to verify**

Run: `pnpm --filter architect-vite build`
Expected: build fails, because code outside `tailwind.css` still references old tokens. That's expected; Tasks 2.2–2.5 fix those usages. DO NOT commit yet — commit with Task 2.5.

---

## Task 2.2: Sweep `text-foreground` and `text-*-foreground` utility classes

**Files:** multiple `.ts/.tsx/.css` in `apps/architect-vite/src/**`

- [ ] **Step 1: Identify all utility-class usages**

Run (separately, capture output):
```
rg -n --type-add 'web:*.{ts,tsx,css}' -t web 'text-foreground' apps/architect-vite/src
rg -n --type-add 'web:*.{ts,tsx,css}' -t web 'text-([a-z0-9-]+)-foreground' apps/architect-vite/src
rg -n --type-add 'web:*.{ts,tsx,css}' -t web 'bg-([a-z0-9-]+)-foreground' apps/architect-vite/src
rg -n --type-add 'web:*.{ts,tsx,css}' -t web 'border-([a-z0-9-]+)-foreground' apps/architect-vite/src
rg -n --type-add 'web:*.{ts,tsx,css}' -t web 'fill-([a-z0-9-]+)-foreground' apps/architect-vite/src
rg -n --type-add 'web:*.{ts,tsx,css}' -t web 'stroke-([a-z0-9-]+)-foreground' apps/architect-vite/src
```

- [ ] **Step 2: Rewrite each match**

For every hit in the above output:
- `text-foreground` → `text-text`
- `text-<name>-foreground` → `text-<name>-contrast` (where `<name>` is primary, secondary, accent, action, timeline, success, warning, info, surface-1, surface-2, surface-3, surface-accent, sortable, input)
- same mapping for `bg-`, `border-`, `fill-`, `stroke-` prefixes

Use multi-file sed-like edits via the Edit tool (one file at a time — `replace_all: true` where the match is unambiguous within a file; inspect first if the utility class appears inside a longer compound class or a string).

- [ ] **Step 3: Re-grep to confirm clean**

Run the same `rg` commands from Step 1. Expected: no hits remain.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter architect-vite typecheck`
Expected: passes

---

## Task 2.3: Sweep error/destructive utility classes

**Files:** multiple `.ts/.tsx/.css` in `apps/architect-vite/src/**`

- [ ] **Step 1: Identify all `bg-error` / `text-error` / `border-error` usages**

```
rg -n --type-add 'web:*.{ts,tsx,css}' -t web '(?:text|bg|border|fill|stroke|ring)-error(?!-)' apps/architect-vite/src
```

Note: the `(?!-)` negative lookahead avoids false positives on something like `text-error-foreground` (already handled by Task 2.2) and the old name spaces.

- [ ] **Step 2: Rewrite each hit**

- `bg-error` → `bg-destructive`
- `text-error` → `text-destructive`
- `border-error` → `border-destructive`
- `fill-error` → `fill-destructive`
- `stroke-error` → `stroke-destructive`
- `ring-error` → `ring-destructive`

- [ ] **Step 3: Re-grep to confirm clean**

Same rg pattern. Expected: no hits remain.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter architect-vite typecheck`
Expected: passes

---

## Task 2.4: Sweep `border-border` → `border-outline`

**Files:** multiple `.ts/.tsx/.css` in `apps/architect-vite/src/**`

- [ ] **Step 1: Identify all `border-border` usages**

```
rg -n --type-add 'web:*.{ts,tsx,css}' -t web 'border-border' apps/architect-vite/src
```

- [ ] **Step 2: Rewrite each hit**

`border-border` → `border-outline`. Also `divide-border` → `divide-outline` if any appear.

- [ ] **Step 3: Re-grep to confirm clean**

Expected: no hits.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter architect-vite typecheck`
Expected: passes

---

## Task 2.5: Sweep raw `var(--color-*)` / `hsl(var(--color-*))` references in CSS files

**Files:** multiple `.css` files in `apps/architect-vite/src/**`

- [ ] **Step 1: Grep for raw variable references that still use old names**

```
rg -n 'var\(--color-(?:[a-z0-9-]+-)?foreground\)' apps/architect-vite/src
rg -n 'var\(--color-error\b|var\(--color-error-\b|var\(--color-border\b|var\(--color-foreground\b' apps/architect-vite/src
```

- [ ] **Step 2: Rewrite each hit**

Apply the same rename table as Task 2.1 (e.g. `var(--color-error)` → `var(--color-destructive)`, `var(--color-input-foreground)` → `var(--color-input-contrast)`, `var(--color-border)` → `var(--color-outline)`, `var(--color-foreground)` → `var(--color-text)`).

- [ ] **Step 3: Re-grep to confirm clean**

Expected: no hits.

- [ ] **Step 4: Build to verify**

Run: `pnpm --filter architect-vite build`
Expected: passes (all renames now complete and consistent)

- [ ] **Step 5: Visual smoke test**

Run `pnpm --filter architect-vite dev`. Navigate to Home → open a sample protocol → open the stage editor. Verify: no missing colors, no components rendering black-on-black or white-on-white. If any component looks broken, grep the affected class name, find the missed token, and fix.

Kill dev server when done.

- [ ] **Step 6: Commit Phase 2's rename sweep**

```bash
git add apps/architect-vite/src
git commit -m "refactor(architect-vite): rename tokens to fresco-compatible names"
```

---

## Task 2.6: Sweep default Tailwind breakpoint utilities

**Files:** primarily `apps/architect-vite/src/components/Home/*.tsx`, `apps/architect-vite/src/components/Node/Node.tsx`, plus anything newly-matching.

- [ ] **Step 1: Identify responsive utility usages**

```
rg -n --type-add 'web:*.{ts,tsx,css}' -t web '(?<![a-z-])(?:sm|md|lg|xl|2xl):' apps/architect-vite/src
```

Note: this returns both CVA size-variant keys (e.g. `sm: "size-20"`) and breakpoint utilities (e.g. `md:grid-cols-2`). Only the latter need rewriting. CVA keys appear as JavaScript object-literal keys and end in `:` followed by a string value, not inside a className string. Review each hit before editing.

- [ ] **Step 2: Apply the breakpoint mapping**

For each genuine responsive utility:
- `sm:foo` → `phone-landscape:foo`
- `md:foo` → `tablet-portrait:foo`
- `lg:foo` → `tablet-landscape:foo`
- `xl:foo` → `laptop:foo`
- `2xl:foo` → `desktop:foo`

Known instances per the spec:
- `src/components/Home/LaunchPad.tsx:79`: `md:grid-cols-2 lg:grid-cols-3` → `tablet-portrait:grid-cols-2 tablet-landscape:grid-cols-3`
- `src/components/Home/LaunchPad.tsx:113`: `md:grid-cols-2` → `tablet-portrait:grid-cols-2`
- `src/components/Home/ProtocolDropzone.tsx:55`: `md:flex-row` → `tablet-portrait:flex-row`
- `src/components/Home/Home.tsx:25`: `md:flex-row` → `tablet-portrait:flex-row`

Apply any additional hits the grep reveals.

- [ ] **Step 3: Build and visually verify**

Run: `pnpm --filter architect-vite build`
Expected: passes.

Boot the dev server. Confirm the Home page renders correctly at multiple viewport widths: narrow (one column) and wide (multi-column). If columns don't update at expected widths, the breakpoint mapping is off — re-check.

Kill dev server.

- [ ] **Step 4: Commit**

```bash
git add apps/architect-vite/src
git commit -m "refactor(architect-vite): migrate breakpoint utilities to fresco names"
```

---

# Phase 3 — Shared variants module

## Task 3.1: Port controlVariants.ts from fresco

**Files:**
- Create: `apps/architect-vite/src/styles/shared/controlVariants.ts`

- [ ] **Step 1: Read fresco source**

Read `~/Projects/fresco-next/styles/shared/controlVariants.ts`. This is the content to port.

- [ ] **Step 2: Write port with single deviation**

Copy the entire file verbatim to `apps/architect-vite/src/styles/shared/controlVariants.ts`, with one change:

In `nativeSelectVariants`, **remove** the `in-[.scheme-dark]:bg-[url('data:...')]` line entirely. Keep only the light-scheme `bg-[url('data:...')]` with the dark chevron. The final `nativeSelectVariants` base should be:

```ts
export const nativeSelectVariants = cva({
	base: cx(
		"size-full",
		"cursor-[inherit]",
		"[font-size:inherit]",
		"appearance-none border-none bg-transparent bg-none p-0 outline-none focus:ring-0",
		"disabled:bg-transparent",
		"bg-no-repeat",
		"bg-[length:1.2em_1.2em]",
		"bg-right",
		"bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%230f172a%22%20stroke-width%3D%222.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]",
		"pr-[1.5em]",
	),
});
```

Also update the import at the top of the file from fresco's path to architect's: `import { compose, cva, cx } from "~/utils/cva";` (architect's `cva.ts` is at `src/utils/cva.ts`, which re-exports `compose`, `cva`, `cx` — check it exists).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter architect-vite typecheck`
Expected: passes

- [ ] **Step 4: Commit**

```bash
git add apps/architect-vite/src/styles/shared/controlVariants.ts
git commit -m "feat(architect-vite): port controlVariants shared module from fresco"
```

---

## Task 3.2: Create getInputState utility

**Files:**
- Create: `apps/architect-vite/src/utils/getInputState.ts`

- [ ] **Step 1: Write the utility**

Create `apps/architect-vite/src/utils/getInputState.ts`:

```ts
type ReduxFormMeta = {
	touched?: boolean;
	invalid?: boolean;
};

type InputStateProps = {
	disabled?: boolean;
	readOnly?: boolean;
	meta?: ReduxFormMeta;
};

export type InputState = "normal" | "disabled" | "readOnly" | "invalid";

export function getInputState({ disabled, readOnly, meta }: InputStateProps): InputState {
	if (disabled) return "disabled";
	if (readOnly) return "readOnly";
	if (meta?.touched && meta?.invalid) return "invalid";
	return "normal";
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter architect-vite typecheck`
Expected: passes

- [ ] **Step 3: Commit**

```bash
git add apps/architect-vite/src/utils/getInputState.ts
git commit -m "feat(architect-vite): add getInputState utility"
```

---

# Phase 4 — BaseField and helper components

## Task 4.1: Create FieldLabel

**Files:**
- Create: `apps/architect-vite/src/components/Form/FieldLabel.tsx`

- [ ] **Step 1: Read fresco source for reference**

Read `~/Projects/fresco-next/lib/form/components/FieldLabel.tsx`. Study its structure. Port the visual treatment but simplify: architect doesn't need fresco's form-store integration, just the rendering.

- [ ] **Step 2: Write FieldLabel**

Create `apps/architect-vite/src/components/Form/FieldLabel.tsx`:

```tsx
import type { ReactNode } from "react";
import { cx } from "~/utils/cva";

type FieldLabelProps = {
	id: string;
	htmlFor: string;
	required?: boolean;
	children: ReactNode;
	className?: string;
};

export function FieldLabel({ id, htmlFor, required = false, children, className }: FieldLabelProps) {
	return (
		<label
			id={id}
			htmlFor={htmlFor}
			className={cx(
				"block text-base leading-normal font-medium text-text",
				"mb-2",
				className,
			)}
		>
			{children}
			{required && <span className="text-destructive ml-1" aria-hidden="true">*</span>}
		</label>
	);
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter architect-vite typecheck`
Expected: passes

- [ ] **Step 4: Commit**

```bash
git add apps/architect-vite/src/components/Form/FieldLabel.tsx
git commit -m "feat(architect-vite): add FieldLabel component"
```

---

## Task 4.2: Create Hint

**Files:**
- Create: `apps/architect-vite/src/components/Form/Hint.tsx`

- [ ] **Step 1: Write Hint**

Create `apps/architect-vite/src/components/Form/Hint.tsx`:

```tsx
import type { ReactNode } from "react";
import { cx } from "~/utils/cva";

type HintProps = {
	id: string;
	children: ReactNode;
	className?: string;
};

export function Hint({ id, children, className }: HintProps) {
	if (children == null || children === false) return null;
	return (
		<p id={id} className={cx("text-sm text-text/70 leading-normal mt-1", className)}>
			{children}
		</p>
	);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter architect-vite typecheck`
Expected: passes

- [ ] **Step 3: Commit**

```bash
git add apps/architect-vite/src/components/Form/Hint.tsx
git commit -m "feat(architect-vite): add Hint component"
```

---

## Task 4.3: Create FieldErrors

**Files:**
- Create: `apps/architect-vite/src/components/Form/FieldErrors.tsx`

- [ ] **Step 1: Write FieldErrors**

Create `apps/architect-vite/src/components/Form/FieldErrors.tsx`:

```tsx
import { AnimatePresence, motion } from "motion/react";
import { cx } from "~/utils/cva";

type FieldErrorsProps = {
	id: string;
	name?: string;
	errors: string[];
	show: boolean;
	className?: string;
};

export function FieldErrors({ id, name, errors, show, className }: FieldErrorsProps) {
	const visible = show && errors.length > 0;
	return (
		<AnimatePresence initial={false}>
			{visible && (
				<motion.div
					key={`${id}-errors`}
					id={id}
					role="alert"
					aria-live="polite"
					data-field-name={name}
					initial={{ opacity: 0, height: 0 }}
					animate={{ opacity: 1, height: "auto" }}
					exit={{ opacity: 0, height: 0 }}
					transition={{ duration: 0.2 }}
					className={cx(
						"bg-destructive text-destructive-contrast",
						"rounded-sm px-3 py-2 mt-2 text-sm",
						"flex items-center gap-2",
						className,
					)}
				>
					{errors.map((e, i) => (
						<span key={`${id}-err-${i}`}>{e}</span>
					))}
				</motion.div>
			)}
		</AnimatePresence>
	);
}
```

Note: architect has `motion/react` available (check `package.json`). If it isn't, drop the animation wrapper and use a plain `<div>` conditional on `visible`.

- [ ] **Step 2: Verify motion is available**

Run: `rg '"motion"' apps/architect-vite/package.json`
If no match, fall back to the plain `<div>` version (remove the `AnimatePresence`/`motion.div`, return `{visible && <div id={id} role="alert" ...>{errors...}</div>}`).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter architect-vite typecheck`
Expected: passes

- [ ] **Step 4: Commit**

```bash
git add apps/architect-vite/src/components/Form/FieldErrors.tsx
git commit -m "feat(architect-vite): add FieldErrors component"
```

---

## Task 4.4: Create BaseField

**Files:**
- Create: `apps/architect-vite/src/components/Form/BaseField.tsx`

- [ ] **Step 1: Write BaseField**

Create `apps/architect-vite/src/components/Form/BaseField.tsx`:

```tsx
import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "~/utils/cva";
import { FieldErrors } from "./FieldErrors";
import { FieldLabel } from "./FieldLabel";
import { Hint } from "./Hint";

type BaseFieldProps = {
	id: string;
	name?: string;
	label?: string;
	hint?: ReactNode;
	validationSummary?: ReactNode;
	required?: boolean;
	errors?: string[];
	showErrors?: boolean;
	inline?: boolean;
	children: ReactNode;
	containerProps?: Omit<HTMLAttributes<HTMLDivElement>, "className" | "id">;
};

export function BaseField({
	id,
	name,
	label,
	hint,
	validationSummary,
	required = false,
	errors = [],
	showErrors = false,
	inline = false,
	children,
	containerProps,
}: BaseFieldProps) {
	return (
		<div
			{...containerProps}
			className={cx(
				"group w-full grow not-last:mb-6",
				"tablet-landscape:not-last:mb-8 desktop:not-last:mb-10",
				"flex flex-col",
			)}
		>
			<div
				className={cx(
					"flex flex-col",
					inline &&
						"tablet-portrait:flex-row tablet-portrait:items-center tablet-portrait:justify-between tablet-portrait:gap-4 tablet-portrait:align-middle",
				)}
			>
				<div className={cx(inline ? "min-w-0" : "mb-4")}>
					{label && (
						<FieldLabel id={`${id}-label`} htmlFor={id} required={required}>
							{label}
						</FieldLabel>
					)}
					{(hint ?? validationSummary) && (
						<Hint id={`${id}-hint`}>
							{hint}
							{validationSummary}
						</Hint>
					)}
				</div>
				<div className={cx(inline && "shrink-0")}>{children}</div>
			</div>
			<FieldErrors id={`${id}-error`} name={name} errors={errors} show={showErrors} />
		</div>
	);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter architect-vite typecheck`
Expected: passes

- [ ] **Step 3: Commit**

```bash
git add apps/architect-vite/src/components/Form/BaseField.tsx
git commit -m "feat(architect-vite): add BaseField component"
```

---

# Phase 5 — Fresco-styled field migrations

Each field follows the same pattern:

1. Read the existing architect field component and its CSS file
2. Read the fresco reference component
3. Rewrite the architect component: consume CVA variants, wrap in `BaseField`, remove custom label/error markup
4. Delete the CSS file
5. Remove the `@import` line from the aggregator
6. Build + typecheck + lint
7. Boot dev server, smoke-test the field in a protocol stage editor
8. Commit

The first field (Text) is documented in full depth. Subsequent fields document the deltas.

## Task 5.1: Migrate Text / Number / Search (InputField pattern)

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/Text.tsx`
- Modify: `apps/architect-vite/src/components/Form/Fields/Number.tsx`
- Modify: `apps/architect-vite/src/components/Form/Fields/Search.tsx`
- Delete: `apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/text.css`
- Delete: `apps/architect-vite/src/styles/components/form/fields/input-preview.css` — **NO, that's InputPreview, not text. Skip.**
- Modify: `apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields.css` (remove `@import "./fields/text.css";`)

- [ ] **Step 1: Read fresco's InputField**

Read `~/Projects/fresco-next/lib/form/components/fields/InputField.tsx`. Understand the wrapper/input split, `inputWrapperVariants` composition, and the number-stepper branch.

- [ ] **Step 2: Read architect's Text.tsx current state**

Read `apps/architect-vite/src/components/Form/Fields/Text.tsx`. Note the props shape (`input`, `meta`, `label`, `placeholder`, `fieldLabel`, `adornmentLeft`, `adornmentRight`, etc.).

- [ ] **Step 3: Rewrite Text.tsx**

Replace the full content of `apps/architect-vite/src/components/Form/Fields/Text.tsx` with:

```tsx
import { memo, type ReactNode } from "react";
import { v4 as uuid } from "uuid";
import { BaseField } from "~/components/Form/BaseField";
import {
	controlVariants,
	heightVariants,
	inlineSpacingVariants,
	inputControlVariants,
	interactiveStateVariants,
	placeholderVariants,
	proportionalLucideIconVariants,
	stateVariants,
	textSizeVariants,
	wrapperPaddingVariants,
} from "~/styles/shared/controlVariants";
import { compose, cva, cx, type VariantProps } from "~/utils/cva";
import { getInputState } from "~/utils/getInputState";

const inputWrapperVariants = compose(
	heightVariants,
	textSizeVariants,
	controlVariants,
	inputControlVariants,
	inlineSpacingVariants,
	wrapperPaddingVariants,
	proportionalLucideIconVariants,
	stateVariants,
	interactiveStateVariants,
	cva({
		base: cx("max-w-full min-w-0", "w-auto shrink-0", "[&_button]:h-10"),
	}),
);

const inputVariants = compose(
	placeholderVariants,
	cva({
		base: cx(
			"cursor-[inherit]",
			"[font-size:inherit]",
			"p-0",
			"field-sizing-content min-w-0 grow basis-0",
			"border-none bg-transparent outline-none focus:ring-0",
			"transition-none",
			"[&::-webkit-search-cancel-button]:hidden",
			"[&::-webkit-search-decoration]:hidden",
		),
	}),
);

type TextInputProps = {
	input?: {
		name?: string;
		value?: string;
		onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
		onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
		onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
	};
	meta?: { error?: string; touched?: boolean; invalid?: boolean };
	label?: string | null;
	fieldLabel?: string | null;
	placeholder?: string | number;
	type?: "text" | "search";
	hidden?: boolean;
	disabled?: boolean;
	readOnly?: boolean;
	adornmentLeft?: ReactNode;
	adornmentRight?: ReactNode;
	size?: VariantProps<typeof heightVariants>["size"];
};

function TextInput({
	input = {},
	meta = {},
	label = null,
	fieldLabel = null,
	placeholder = "Enter some text…",
	type = "text",
	hidden = false,
	disabled,
	readOnly,
	adornmentLeft,
	adornmentRight,
	size = "md",
}: TextInputProps) {
	const id = uuid();
	const state = getInputState({ disabled, readOnly, meta });
	const errors = meta.error ? [meta.error] : [];
	const showErrors = Boolean(meta.touched && meta.invalid);
	const resolvedLabel = fieldLabel ?? label ?? undefined;

	if (hidden) return null;

	return (
		<BaseField
			id={id}
			name={input.name}
			label={resolvedLabel ?? undefined}
			errors={errors}
			showErrors={showErrors}
		>
			<div className={inputWrapperVariants({ size, state })}>
				{adornmentLeft}
				<input
					id={id}
					name={input.name}
					type={type}
					placeholder={placeholder?.toString()}
					disabled={disabled}
					readOnly={readOnly}
					value={input.value ?? ""}
					onChange={input.onChange}
					onBlur={input.onBlur}
					onFocus={input.onFocus}
					className={inputVariants({})}
				/>
				{adornmentRight}
			</div>
		</BaseField>
	);
}

export default memo(TextInput);
```

Note: `classnames` import removed, `Icon` import removed, `MarkdownLabel` usage removed (BaseField handles label rendering). If MarkdownLabel behavior is required (markdown-in-label rendering), pass `resolvedLabel` through to a MarkdownLabel *inside* the `label` prop — but deferring that enrichment to the label itself isn't possible since `label` is a string. Accept that labels are now plain text for this component; if any existing consumer passes markdown labels to Text, track them in a follow-up TODO commented in the PR (do NOT add TODO comments to the code).

- [ ] **Step 4: Rewrite Number.tsx**

Read `apps/architect-vite/src/components/Form/Fields/Number.tsx`. Apply the same pattern, with the addition of fresco's stepper button branch. Study fresco's InputField.tsx for the Minus/Plus IconButton pattern and adapt using architect's `Button` (`~/lib/legacy-ui/components/Button`) or equivalent. If architect lacks an `IconButton` equivalent, render plain `<button>` elements with the `stepperButtonVariants`:

```tsx
const stepperButtonVariants = cx(
	"aspect-square h-full! rounded-none",
	"elevation-none! translate-y-0!",
	"bg-input-contrast/5 text-input-contrast",
	"hover:bg-accent hover:text-accent-contrast",
	"disabled:pointer-events-none disabled:opacity-30",
);
```

Use `stepUp()` / `stepDown()` on the underlying input ref for the step handlers, matching fresco's approach. If the existing Number.tsx has unique validation or formatting logic (percent sign, min/max), preserve it.

- [ ] **Step 5: Rewrite Search.tsx**

Read `apps/architect-vite/src/components/Form/Fields/Search.tsx`. If it's a thin wrapper around Text with `type="search"`, update the import and pass `type="search"`. If it has additional search-specific logic (clear button, suggestions), preserve that logic while migrating to the new variant-based styling.

- [ ] **Step 6: Delete text.css and update aggregator**

```bash
git rm apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/text.css
```

Edit `apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields.css` and remove the line `@import "./fields/text.css";`.

- [ ] **Step 7: Build + lint + typecheck**

Run: `pnpm --filter architect-vite typecheck && pnpm --filter architect-vite lint && pnpm --filter architect-vite build`
Expected: all pass.

- [ ] **Step 8: Smoke test**

Boot dev server. Open a protocol. Navigate to a stage that uses Text fields (e.g. a Name Generator prompt's text input, or the stage label field in the stage editor). Verify:
- Input renders with fresco's visual style (bordered, padded)
- Typing updates the value
- Tab focus shows the focus ring
- Blur with invalid value shows the error message
- Disabled state renders visibly disabled

Do the same for Number (if used anywhere — grep for consumers) and Search.

Kill dev server.

- [ ] **Step 9: Commit**

```bash
git add apps/architect-vite/src/components/Form/Fields/Text.tsx \
        apps/architect-vite/src/components/Form/Fields/Number.tsx \
        apps/architect-vite/src/components/Form/Fields/Search.tsx \
        apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields.css
git commit -m "refactor(architect-vite): migrate Text/Number/Search fields to fresco styles"
```

---

## Task 5.2: Migrate TextArea

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/TextArea.tsx`
- Modify: `apps/architect-vite/src/styles/components/form/fields.css` aggregator (remove textarea import — verify if the textarea.css is referenced there or at the top-level `components.css`; remove wherever it's imported)
- Delete: `apps/architect-vite/src/styles/components/form/fields/textarea.css`

- [ ] **Step 1: Read fresco's TextArea.tsx**

Read `~/Projects/fresco-next/lib/form/components/fields/TextArea.tsx`. Note how it composes `multilineContentVariants` with the same state/interactive/placeholder/control variants used by InputField.

- [ ] **Step 2: Read architect's TextArea.tsx current state**

Read `apps/architect-vite/src/components/Form/Fields/TextArea.tsx`. Note the props shape.

- [ ] **Step 3: Rewrite TextArea.tsx**

Rewrite the file following the Text.tsx pattern from Task 5.1, substituting:

```ts
const textareaVariants = compose(
	textSizeVariants,
	controlVariants,
	inputControlVariants,
	multilineContentVariants,
	stateVariants,
	interactiveStateVariants,
	placeholderVariants,
	cva({ base: cx("resize-vertical max-w-full") }),
);
```

Replace the inner `<input>` with a `<textarea>`. Remove any CSS classname strings (`form-field-text form-field-text--area`). Use `BaseField` for the wrapper.

- [ ] **Step 4: Delete textarea.css**

Find where `textarea.css` is imported. Run: `rg '"./fields/textarea.css"' apps/architect-vite/src`. Remove the matching `@import` line, then:

```bash
git rm apps/architect-vite/src/styles/components/form/fields/textarea.css
```

- [ ] **Step 5: Typecheck + build + lint**

Expected: pass.

- [ ] **Step 6: Smoke test**

Boot dev server. Navigate to a field using a TextArea (the protocol description field in protocol settings is a good candidate). Verify typing, multi-line behavior, vertical resize, focus ring, error state.

- [ ] **Step 7: Commit**

```bash
git add apps/architect-vite/src/components/Form/Fields/TextArea.tsx \
        apps/architect-vite/src/styles/components/form/fields.css 2>/dev/null || true
git commit -m "refactor(architect-vite): migrate TextArea field to fresco styles"
```

---

## Task 5.3: Migrate NativeSelect

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/NativeSelect.tsx`
- Delete: `apps/architect-vite/src/styles/components/form/fields/native-select.css`

- [ ] **Step 1: Read fresco reference**

Fresco doesn't have a standalone NativeSelect; it's styled via `nativeSelectVariants` inside a generic Select wrapper. Read fresco's `controlVariants.ts` `nativeSelectVariants` export and the `Select/` components for patterns.

- [ ] **Step 2: Rewrite NativeSelect.tsx**

Compose `inputWrapperVariants` (like Text) around a native `<select>`, and apply `nativeSelectVariants` to the `<select>` itself:

```tsx
const selectWrapperVariants = compose(
	heightVariants,
	textSizeVariants,
	controlVariants,
	inputControlVariants,
	inlineSpacingVariants,
	wrapperPaddingVariants,
	stateVariants,
	interactiveStateVariants,
	cva({ base: cx("max-w-full min-w-0 w-full") }),
);
```

Render `<select className={nativeSelectVariants()}>` inside `<div className={selectWrapperVariants({ size, state })}>`. Wrap in `BaseField`. Map redux-form `input.onChange` to the native `<select>` change event.

- [ ] **Step 3: Delete native-select.css**

Find the import and remove:

```bash
rg '"./fields/native-select.css"' apps/architect-vite/src
```
Remove matching `@import` line, then `rm` the file.

- [ ] **Step 4: Typecheck + build + lint**

Expected: pass.

- [ ] **Step 5: Smoke test**

Grep for NativeSelect consumers: `rg 'NativeSelect' apps/architect-vite/src --type tsx`. Open a page that uses one (likely in a stage configuration section). Verify: options render, change event fires, chevron arrow visible, disabled state, error state.

- [ ] **Step 6: Commit**

```bash
git add apps/architect-vite/src/components/Form/Fields/NativeSelect.tsx \
        apps/architect-vite/src/styles/components/form/fields.css || true
git rm apps/architect-vite/src/styles/components/form/fields/native-select.css
git commit -m "refactor(architect-vite): migrate NativeSelect field to fresco styles"
```

---

## Task 5.4: Migrate Checkbox

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/Checkbox.tsx`
- Delete: `apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/checkbox.css`

- [ ] **Step 1: Read fresco's Checkbox.tsx**

Read `~/Projects/fresco-next/lib/form/components/fields/Checkbox.tsx`.

- [ ] **Step 2: Rewrite Checkbox.tsx**

Compose:
```ts
const checkboxVariants = compose(
	smallSizeVariants,
	groupOptionVariants,
	cva({ base: cx("focusable rounded-sm border-2 border-input-contrast/30 checked:bg-primary checked:border-primary") }),
);
```

Render a native `<input type="checkbox">` with this variant. Wrap in `<label>` with `controlLabelVariants` applied. Use `BaseField` only if rendering as a single field; if the Checkbox is always a child of CheckboxGroup, accept an optional `label` and render it inline with the checkbox instead of via BaseField. Follow fresco's pattern.

- [ ] **Step 3: Delete checkbox.css**

Find the import, remove it, then `rm` the file.

- [ ] **Step 4: Typecheck + build + lint**

Expected: pass.

- [ ] **Step 5: Smoke test**

Find a Checkbox usage (grep for `Form/Fields/Checkbox`). Verify: click toggles state, visual check/uncheck shows correctly, focus ring on tab.

- [ ] **Step 6: Commit**

```bash
git add apps/architect-vite/src/components/Form/Fields/Checkbox.tsx
git rm apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/checkbox.css
git add apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields.css || true
git commit -m "refactor(architect-vite): migrate Checkbox field to fresco styles"
```

---

## Task 5.5: Migrate Radio

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/Radio.tsx`
- Delete: `apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/radio.css`

- [ ] **Step 1: Read fresco's RadioGroup.tsx for the item pattern**

Read `~/Projects/fresco-next/lib/form/components/fields/RadioGroup.tsx` — look at how individual radio items are styled.

- [ ] **Step 2: Rewrite Radio.tsx**

Same approach as Checkbox but for radio: `<input type="radio">` with a round indicator. Compose `smallSizeVariants`, `groupOptionVariants`, and a base that renders the round radio shape (`rounded-full`, `checked:bg-primary`, `checked:border-primary`). Wrap in label with `controlLabelVariants`.

- [ ] **Step 3: Delete radio.css**

Find import, remove, then `rm`.

- [ ] **Step 4: Typecheck + build + lint**

- [ ] **Step 5: Smoke test**

Grep for Radio consumers, verify visually.

- [ ] **Step 6: Commit**

```bash
git add apps/architect-vite/src/components/Form/Fields/Radio.tsx \
        apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields.css || true
git rm apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/radio.css
git commit -m "refactor(architect-vite): migrate Radio field to fresco styles"
```

---

## Task 5.6: Migrate CheckboxGroup

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/CheckboxGroup.tsx`
- Delete: `apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/checkbox-group.css`

- [ ] **Step 1: Read fresco's CheckboxGroup.tsx**

- [ ] **Step 2: Rewrite CheckboxGroup.tsx**

Compose:
```ts
const groupVariants = compose(groupSpacingVariants, orientationVariants, cva({ base: "" }));
```

Wrap options in a `<div className={groupVariants({ size, orientation, useColumns })}>`. Each child is an already-migrated Checkbox. Use `BaseField` around the whole group for the label/error.

- [ ] **Step 3: Delete css**

Find import, remove, `rm`.

- [ ] **Step 4: Typecheck + build + lint**

- [ ] **Step 5: Smoke test**

Grep for CheckboxGroup consumers; verify group layout (vertical/horizontal), selection, focus, error.

- [ ] **Step 6: Commit**

```bash
git add apps/architect-vite/src/components/Form/Fields/CheckboxGroup.tsx \
        apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields.css || true
git rm apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/checkbox-group.css
git commit -m "refactor(architect-vite): migrate CheckboxGroup field to fresco styles"
```

---

## Task 5.7: Migrate RadioGroup

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/RadioGroup.tsx`
- Delete: `apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/radio-group.css`

- [ ] **Step 1: Read fresco's RadioGroup.tsx**

Read `~/Projects/fresco-next/lib/form/components/fields/RadioGroup.tsx`.

- [ ] **Step 2: Rewrite RadioGroup.tsx**

Wrap options in `<div className={groupVariants({ size, orientation, useColumns })}>` where `groupVariants = compose(groupSpacingVariants, orientationVariants, cva({ base: "" }))`. Each child is a `Radio` (already migrated). Use `BaseField` around the whole group for label/error. For redux-form, the group receives `{ input, meta }`; pass `input.value` and `input.onChange` into each Radio so selection is a mutually-exclusive single value.

- [ ] **Step 3: Delete radio-group.css**

```bash
git rm apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/radio-group.css
```

Then remove the matching `@import "./fields/radio-group.css";` line from `apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields.css`.

- [ ] **Step 4: Typecheck + build + lint**

Run: `pnpm --filter architect-vite typecheck && pnpm --filter architect-vite lint && pnpm --filter architect-vite build`
Expected: pass.

- [ ] **Step 5: Smoke test**

Grep for RadioGroup consumers. Verify: only one option selectable at a time, selection persists, focus ring, error state.

- [ ] **Step 6: Commit**

```bash
git add apps/architect-vite/src/components/Form/Fields/RadioGroup.tsx \
        apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields.css
git commit -m "refactor(architect-vite): migrate RadioGroup field to fresco styles"
```

---

## Task 5.8: Migrate Toggle + ToggleButton + ToggleButtonGroup

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/Toggle.tsx`
- Delete: `apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/toggle.css`
- Delete: `apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/toggle-button.css`
- Delete: `apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/toggle-button-group.css`

- [ ] **Step 1: Read fresco's ToggleField.tsx and ToggleButtonGroup.tsx**

- [ ] **Step 2: Rewrite Toggle.tsx**

A Toggle is a switch (on/off). Use base-ui's `Switch` primitive if already used elsewhere in architect; otherwise use a native `<input type="checkbox" role="switch">` with the fresco visual treatment: a pill container with a sliding thumb. Compose `smallSizeVariants` + custom track/thumb CVA.

- [ ] **Step 3: Handle ToggleButton and ToggleButtonGroup**

Check if there are standalone `ToggleButton.tsx` / `ToggleButtonGroup.tsx` components or if they're embedded somewhere else. If standalone, migrate similarly using fresco's `ToggleButtonGroup.tsx` as reference. If only referenced through compound components, migrate in context.

- [ ] **Step 4: Delete all three CSS files**

Find imports, remove, `rm`.

- [ ] **Step 5: Typecheck + build + lint**

- [ ] **Step 6: Smoke test Toggle, ToggleButton, ToggleButtonGroup consumers**

- [ ] **Step 7: Commit**

```bash
git add apps/architect-vite/src/components/Form/Fields \
        apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields.css || true
git rm apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/{toggle,toggle-button,toggle-button-group}.css
git commit -m "refactor(architect-vite): migrate Toggle/ToggleButton/ToggleButtonGroup fields to fresco styles"
```

---

## Task 5.9: Migrate BooleanField + legacy-ui Boolean primitives

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/BooleanField.tsx`
- Modify: `apps/architect-vite/src/lib/legacy-ui/components/Boolean/Boolean.tsx`
- Modify: `apps/architect-vite/src/lib/legacy-ui/components/Boolean/RoundCheckbox.tsx`
- Modify: `apps/architect-vite/src/lib/legacy-ui/components/Boolean/BooleanOption.tsx`
- Delete: `apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/boolean.css`

- [ ] **Step 1: Read fresco's Boolean.tsx**

- [ ] **Step 2: Read all four architect files**

Understand how `Boolean`, `RoundCheckbox`, `BooleanOption` compose with `BooleanField`.

- [ ] **Step 3: Rewrite each**

The shared CVA fragments replace the per-component CSS. `BooleanField` wraps in `BaseField`. `Boolean` becomes the visual container. `RoundCheckbox` + `BooleanOption` get variants for selected/unselected visual states.

Preserve the existing prop shapes (this is deep-integration code; behavior must not regress).

- [ ] **Step 4: Delete boolean.css**

- [ ] **Step 5: Typecheck + build + lint**

- [ ] **Step 6: Smoke test**

Find where BooleanField is used (protocol settings typically). Verify click selection, both options visible, focus, error.

- [ ] **Step 7: Commit**

```bash
git add apps/architect-vite/src/components/Form/Fields/BooleanField.tsx \
        apps/architect-vite/src/lib/legacy-ui/components/Boolean \
        apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields.css || true
git rm apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/boolean.css
git commit -m "refactor(architect-vite): migrate BooleanField + legacy Boolean primitives to fresco styles"
```

---

## Task 5.10: Migrate DatePicker

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/DatePicker/Field.tsx` (+ other files in DatePicker/)
- Delete: `apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/date-picker.css`

- [ ] **Step 1: Read fresco's DatePicker.tsx**

- [ ] **Step 2: Inventory the architect DatePicker directory**

List `apps/architect-vite/src/components/Form/Fields/DatePicker/`. If there are multiple files (trigger, popover content, calendar grid), each may need migration.

- [ ] **Step 3: Rewrite**

Apply `inputWrapperVariants` to the trigger. Apply `dropdownItemVariants` to day cells where appropriate. Use `BaseField` for the wrapper. Where fresco uses base-ui components, use architect's equivalent (check `package.json` for `@base-ui-components/react`). If architect doesn't have base-ui, preserve the existing library choice and only migrate the styling.

- [ ] **Step 4–7: Delete css, typecheck/build/lint, smoke test, commit**

Commit message: `refactor(architect-vite): migrate DatePicker field to fresco styles`

---

## Task 5.11: Migrate Slider + LikertScale

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/Slider.tsx`
- Modify: `apps/architect-vite/src/components/Form/Fields/Slider/*` (contents)
- Modify: `apps/architect-vite/src/components/Form/Fields/LikertScale.tsx`
- Delete: `apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/slider.css`
- Delete: `apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/range.css`

- [ ] **Step 1: Read fresco's VisualAnalogScale.tsx and LikertScale.tsx**

- [ ] **Step 2: Read architect's Slider files**

- [ ] **Step 3: Rewrite**

Consume the slider-family variants: `sliderRootVariants`, `sliderControlVariants`, `sliderTrackVariants`, `sliderThumbVariants`, `sliderTickContainerStyles`, `sliderTickStyles`. The `sliderThumbVariants` reads `left-(--slider-thumb-position)` from base-ui; if architect's slider uses a different library, compute the equivalent CSS custom property or convert to the library's positioning API.

For LikertScale, reproduce fresco's labeled tick pattern. `inset-surface` is used by `sliderTrackVariants` — now available via the ported plugin.

- [ ] **Step 4: Delete range.css and slider.css**

- [ ] **Step 5: Typecheck + build + lint**

- [ ] **Step 6: Smoke test**

Sliders are used in some protocol stage configurations. Verify drag, value changes, visual thumb position, tick marks, disabled state.

- [ ] **Step 7: Commit**

Commit message: `refactor(architect-vite): migrate Slider and LikertScale to fresco styles`

---

## Task 5.12: Migrate Select (styled dropdown)

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/Select.tsx`
- Delete: `apps/architect-vite/src/styles/components/form/fields/select.css`

- [ ] **Step 1: Read fresco's Select/ directory**

- [ ] **Step 2: Rewrite Select.tsx**

Apply `dropdownItemVariants` to option cells, `inputWrapperVariants` to the trigger button. If architect uses a different select library (check the existing import), preserve it and only migrate styles.

- [ ] **Step 3: Delete select.css**

- [ ] **Step 4: Typecheck + build + lint**

- [ ] **Step 5: Smoke test**

Select is used across the app; verify in at least two distinct consumer pages (stage editor, protocol settings).

- [ ] **Step 6: Commit**

Commit message: `refactor(architect-vite): migrate Select field to fresco styles`

---

## Task 5.13: Migrate RichText

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/RichText.tsx` + files in `RichText/`
- Delete: `apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields/rich-text.css`

- [ ] **Step 1: Read fresco's RichTextEditor.tsx**

- [ ] **Step 2: Rewrite**

Apply `multilineContentVariants` + `inputControlVariants` + `stateVariants` + `interactiveStateVariants`. If architect uses an editor library (check imports — likely `slate` or `tiptap`), preserve the library and only migrate styles.

- [ ] **Step 3–6: Delete css, typecheck/build/lint, smoke test, commit**

Commit message: `refactor(architect-vite): migrate RichText field to fresco styles`

---

## Task 5.14: Migrate MultiSelect

**Files:**
- Modify: `apps/architect-vite/src/components/Form/MultiSelect.tsx`
- Delete: `apps/architect-vite/src/styles/components/form/fields/multi-select.css`

- [ ] **Step 1: Read fresco's Select/ (multi-select pattern)**

- [ ] **Step 2: Rewrite**

Apply `inputWrapperVariants` to the trigger, `dropdownItemVariants` to option cells. Selected pills/chips get a compound variant or a bespoke small CVA inside the file.

- [ ] **Step 3–6: Delete css, typecheck/build/lint, smoke test, commit**

Commit message: `refactor(architect-vite): migrate MultiSelect to fresco styles`

---

# Phase 6 — Structural-only orphan field migrations

These fields have no fresco analogue. Each gets wrapped in `BaseField` and has its CSS replaced with Tailwind classes using the shared variants where appropriate (`stateVariants`, `textSizeVariants`), but the bespoke visual identity is preserved. The CSS file is deleted; any unique visuals are inlined as Tailwind utilities on the rendered JSX using theme tokens only (no arbitrary values unless unavoidable).

## Task 6.1: Migrate ColorPicker

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/ColorPicker.tsx`
- Delete: `apps/architect-vite/src/styles/components/form/fields/color-picker.css`

- [ ] **Step 1: Read current ColorPicker.tsx and color-picker.css**

- [ ] **Step 2: Rewrite**

Wrap in `BaseField`. Every class string in the component that came from the `.css` file becomes a Tailwind class using theme tokens. The `--picker-size` and `--picker-border-size` CSS custom props (already in tailwind.css) may still be used via `w-[var(--picker-size)]` — this counts as a theme reference, not arbitrary, since the variable is defined in theme.

- [ ] **Step 3: Delete color-picker.css**

- [ ] **Step 4: Typecheck + build + lint**

- [ ] **Step 5: Smoke test the color picker in a node/edge type editor**

- [ ] **Step 6: Commit**

Commit message: `refactor(architect-vite): migrate ColorPicker from CSS to Tailwind`

---

## Task 6.2: Migrate DataSource

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/DataSource.tsx`
- Delete: `apps/architect-vite/src/styles/components/form/fields/data-source.css`

- [ ] **Step 1: Read current files**

Read `apps/architect-vite/src/components/Form/Fields/DataSource.tsx` and `data-source.css`.

- [ ] **Step 2: Rewrite DataSource.tsx**

Wrap in `BaseField`. Replace every class from the `.css` file with Tailwind utilities using theme tokens. Where the `.css` used ad-hoc values, prefer the closest theme token; only fall back to arbitrary values if no token exists and a semantic one isn't warranted. Apply `stateVariants` / `textSizeVariants` / `inputControlVariants` where the control shape matches an input-like pattern.

- [ ] **Step 3: Delete data-source.css**

```bash
git rm apps/architect-vite/src/styles/components/form/fields/data-source.css
```

Remove the matching `@import` from `apps/architect-vite/src/styles/components/form/fields.css`.

- [ ] **Step 4: Typecheck + build + lint**

- [ ] **Step 5: Smoke test**

DataSource is used in stage configurations that reference external data (e.g. CSV-backed name lists). Verify selection, preview, and error state.

- [ ] **Step 6: Commit**

```bash
git add apps/architect-vite/src/components/Form/Fields/DataSource.tsx \
        apps/architect-vite/src/styles/components/form/fields.css
git commit -m "refactor(architect-vite): migrate DataSource from CSS to Tailwind"
```

---

## Task 6.3: Migrate media pickers (Image, Video, Audio, File)

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/{Image,Video,Audio,File}.tsx`
- Delete: the corresponding CSS files in `src/styles/components/form/fields/`

- [ ] **Step 1: Read all four .tsx and all four .css files**

- [ ] **Step 2: Notice shared patterns**

Media pickers often share a preview + replace button + remove button layout. Extract a shared CVA for the media-picker shell if the repetition warrants, placed inline in the first file or in a new shared file if reused across three or more.

- [ ] **Step 3: Rewrite each component**

Each wraps in `BaseField`. Preserve file-type-specific preview (audio player, video preview, image thumbnail, file icon).

- [ ] **Step 4: Delete four CSS files**

- [ ] **Step 5: Typecheck + build + lint**

- [ ] **Step 6: Smoke test each in an asset-management context**

- [ ] **Step 7: Commit**

```bash
git add apps/architect-vite/src/components/Form/Fields/{Image,Video,Audio,File}.tsx
git rm apps/architect-vite/src/styles/components/form/fields/{image,video,audio,file}.css
git add apps/architect-vite/src/styles/components/form/fields.css || true
git commit -m "refactor(architect-vite): migrate media-picker fields from CSS to Tailwind"
```

---

## Task 6.4: Migrate Markdown + MarkdownLabel + InputPreview

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/Markdown.tsx`, `MarkdownLabel.tsx`, `InputPreview.tsx`
- Delete: `apps/architect-vite/src/styles/components/form/fields/markdown.css`
- Delete: `apps/architect-vite/src/styles/components/form/fields/input-preview.css`

- [ ] **Step 1: Read all three .tsx files and both .css files**

- [ ] **Step 2: Rewrite**

`Markdown.tsx` wraps in `BaseField`. `MarkdownLabel.tsx` becomes a thin component that renders its markdown content through existing markdown lib; apply styling via Tailwind classes. `InputPreview.tsx` shows a live preview of a field's value — typically a small labeled card.

- [ ] **Step 3: Delete both CSS files**

- [ ] **Step 4: Typecheck + build + lint**

- [ ] **Step 5: Smoke test**

Markdown label usage appears in most stage configuration fields. Verify bold/italic/link rendering still works.

- [ ] **Step 6: Commit**

Commit message: `refactor(architect-vite): migrate Markdown/MarkdownLabel/InputPreview from CSS to Tailwind`

---

## Task 6.5: Migrate VariablePicker + VariableSelect + VariableSpotlight

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/VariablePicker/*`
- Delete: `apps/architect-vite/src/styles/components/form/fields/variable-picker.css`
- Delete: `apps/architect-vite/src/styles/components/form/fields/variable-select.css`
- Delete: `apps/architect-vite/src/styles/components/variable-spotlight.css` (this one is a top-level components.css import, not a form field — include for completeness since it's closely related; verify the import chain before deleting)

- [ ] **Step 1: Read the VariablePicker directory**

- [ ] **Step 2: Rewrite each file**

Wrap fields in `BaseField`. Use shared variants for states, text sizes. Preserve the variable-selection UI (popover, search, type badges).

- [ ] **Step 3: Delete the CSS files (only delete `variable-spotlight.css` if not imported by another surface; grep first)**

- [ ] **Step 4: Typecheck + build + lint**

- [ ] **Step 5: Smoke test**

Variable pickers appear heavily in the rule/filter editors and skip-logic editors. Verify selection, display of variable names with correct type badge.

- [ ] **Step 6: Commit**

Commit message: `refactor(architect-vite): migrate VariablePicker/VariableSelect/VariableSpotlight from CSS to Tailwind`

---

## Task 6.6: Migrate EntitySelectField

**Files:**
- Modify: `apps/architect-vite/src/components/sections/fields/EntitySelectField/{EntitySelectField,PreviewEdge,PreviewNode}.tsx`
- Delete: `apps/architect-vite/src/styles/components/form/fields/entity-select.css`

- [ ] **Step 1: Read all three .tsx and the .css**

- [ ] **Step 2: Rewrite each**

Wrap in `BaseField`. Preview rendering uses `entity-icon` classes — ensure those stay intact (they're outside this session's scope).

- [ ] **Step 3–6: Delete css, typecheck/build/lint, smoke test, commit**

Commit message: `refactor(architect-vite): migrate EntitySelectField from CSS to Tailwind`

---

## Task 6.7: Migrate Mode + ShapePicker + ShapeVariableMapping

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/` — check exact paths; Mode may not exist as a standalone file (its CSS might be used by an inline `className` in another component — grep)
- Delete: `apps/architect-vite/src/styles/components/form/fields/mode.css`
- Delete: `apps/architect-vite/src/styles/components/form/fields/shape-picker.css`
- Delete: `apps/architect-vite/src/styles/components/form/fields/shape-variable-mapping.css`

- [ ] **Step 1: Grep to locate each consumer**

Run: `rg -l 'form-field-mode|form-field-shape-picker|form-field-shape-variable-mapping' apps/architect-vite/src`

- [ ] **Step 2: Rewrite each consumer**

Wrap in `BaseField` where it's a form field; where the class is part of a non-field component, migrate its styles inline without BaseField.

- [ ] **Step 3: Delete the three CSS files**

- [ ] **Step 4–6: Typecheck/build/lint, smoke test, commit**

Commit message: `refactor(architect-vite): migrate Mode/ShapePicker/ShapeVariableMapping from CSS to Tailwind`

---

## Task 6.8: Migrate Geospatial fields

**Files:**
- Modify: `apps/architect-vite/src/components/Form/Fields/Geospatial/*`

- [ ] **Step 1: Inventory the directory**

List the Geospatial directory. Identify which files have style dependencies and on which CSS files. Some may have no CSS at all.

- [ ] **Step 2: Migrate**

Wrap in `BaseField` where applicable. Apply shared variants.

- [ ] **Step 3: Commit**

Commit message: `refactor(architect-vite): migrate Geospatial fields to BaseField`

---

# Phase 7 — Cleanup

## Task 7.1: Audit remaining field-related CSS files

**Files:** inspection only

- [ ] **Step 1: List any remaining field-related CSS**

```
find apps/architect-vite/src/styles/components/form/fields apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields -type f 2>/dev/null
find apps/architect-vite/src/styles/components/form -maxdepth 1 -type f 2>/dev/null
find apps/architect-vite/src/lib/legacy-ui/styles/components/form -maxdepth 1 -type f 2>/dev/null
```

- [ ] **Step 2: Open any remaining files**

For each file still present, inspect and decide:
- If its rules are still referenced by any component className strings (grep for the selector), finish migrating those components
- If it's unreferenced (dead CSS), delete it

- [ ] **Step 3: Typecheck + build + lint**

Expected: pass

- [ ] **Step 4: Commit any cleanup changes**

Commit message: `refactor(architect-vite): remove dead field-related CSS`

---

## Task 7.2: Delete field-error.css and migrate remaining usages

**Files:**
- Delete: `apps/architect-vite/src/styles/components/form/field-error.css`
- Modify: `apps/architect-vite/src/components/Form/FieldError.tsx` (if it still exists and uses that CSS)

- [ ] **Step 1: Check FieldError.tsx state**

Read `apps/architect-vite/src/components/Form/FieldError.tsx`. If it's still referenced by components that didn't migrate to `BaseField`'s `FieldErrors`, convert those consumers to the new `FieldErrors` pattern. If `FieldError.tsx` is unused, delete it entirely.

- [ ] **Step 2: Delete field-error.css**

Find the import line in `src/styles/components/form.css` or wherever, remove it, then `rm` the file.

- [ ] **Step 3: Typecheck + build + lint**

- [ ] **Step 4: Smoke test**

Trigger a validation error on any field and confirm it still renders.

- [ ] **Step 5: Commit**

Commit message: `refactor(architect-vite): remove field-error.css, consolidate error UI in FieldErrors`

---

## Task 7.3: Clean up aggregator imports

**Files:**
- Modify: `apps/architect-vite/src/styles/components/form.css`
- Modify: `apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields.css`
- Modify: any other `@import`-aggregator that referenced a deleted file

- [ ] **Step 1: Grep for stale @imports**

```
rg '@import "\./fields/' apps/architect-vite/src/styles apps/architect-vite/src/lib/legacy-ui/styles
```

Any import pointing at a file deleted in Phases 5–6 is stale.

- [ ] **Step 2: Remove stale imports**

For each stale `@import` line, delete it.

- [ ] **Step 3: If `form.css` or `fields.css` is now empty (only a few remaining `@import`s), consider removing them entirely and moving any surviving imports to the top-level `components.css` / `all.css`**

- [ ] **Step 4: Typecheck + build + lint**

- [ ] **Step 5: Commit**

Commit message: `refactor(architect-vite): clean up form aggregator CSS imports`

---

## Task 7.4: Run knip and resolve dead exports

**Files:** across architect-vite

- [ ] **Step 1: Run knip**

Run: `pnpm --filter architect-vite knip`
Expected: shows any new dead exports (e.g. old `FieldError.tsx` if not deleted, legacy field helper functions).

- [ ] **Step 2: Resolve each finding**

For each dead export, either delete it (if truly unreferenced) or re-enable the import where intended. Do NOT suppress knip findings with `// knip:ignore` unless the export is needed by an external tool (e.g. a type declaration for a workspace consumer).

- [ ] **Step 3: Typecheck + build + lint + knip**

Expected: all pass, knip clean.

- [ ] **Step 4: Commit**

Commit message: `refactor(architect-vite): remove dead exports surfaced by knip`

---

## Task 7.5: Final verification sweep

**Files:** inspection only

- [ ] **Step 1: Verify no arbitrary values snuck in**

```
rg -n --type-add 'web:*.{ts,tsx}' -t web '\[(?:[0-9.]+(?:px|rem|em|%|vw|vh)|#[0-9a-f]+)\]' apps/architect-vite/src/components/Form apps/architect-vite/src/components/sections/fields apps/architect-vite/src/styles/shared
```

Review each hit. Acceptable: arbitrary values that came in from fresco's ported variants (documented in fresco's source). Not acceptable: new arbitrary values we introduced that should be theme tokens. For any unacceptable hit, either replace with a theme token or add a semantic token to `tailwind.css`.

- [ ] **Step 2: Verify targeted CSS files are all gone**

```
find apps/architect-vite/src/styles/components/form/fields apps/architect-vite/src/lib/legacy-ui/styles/components/form/fields -type f 2>/dev/null
```

Expected: no output (or only `dropzone.css` / `round-button.css` at the parent `form/` level, which are explicitly out of scope).

- [ ] **Step 3: Full build and lint**

Run: `pnpm --filter architect-vite typecheck && pnpm --filter architect-vite lint && pnpm --filter architect-vite build && pnpm --filter architect-vite knip`
Expected: all pass.

- [ ] **Step 4: Full manual smoke test**

Boot dev server. Walk through: Home → open sample protocol → every stage type (Name Generator, Sociogram, Information, Finish Screen, Name Interpreter, per the protocol's available stages) → open the stage editor for each → confirm every form field renders and accepts input → trigger at least one validation error per field type → exit protocol → reopen.

Specifically verify every field type was touched: Text, Number, Search, TextArea, NativeSelect, Checkbox, CheckboxGroup, Radio, RadioGroup, Toggle, Boolean, DatePicker, Slider, LikertScale, Select, RichText, MultiSelect, ColorPicker, DataSource, Image, Video, Audio, File, Markdown, InputPreview, VariablePicker, VariableSelect, EntitySelect, Mode, ShapePicker, ShapeVariableMapping, Geospatial.

Kill dev server.

- [ ] **Step 5: Commit if any fixes**

If Step 4 surfaced issues requiring fixes, commit with: `fix(architect-vite): post-migration visual and behavior fixes`

If nothing to fix, skip the commit step.

---

## Self-Review Checklist (for the author/reviewer of this plan)

The following spec requirements are covered:

- [x] Scope (fields migrated + files deleted): Task 5.x, Task 6.x
- [x] Token rename sweep: Tasks 2.1–2.5
- [x] Breakpoint sweep: Task 2.6
- [x] Plugins: Tasks 1.2, 1.3, 1.6
- [x] `@tailwindcss/forms`: Tasks 1.1, 1.6
- [x] focus utilities + custom variant: Task 1.5
- [x] `controlVariants.ts` shared module: Task 3.1
- [x] `getInputState` utility: Task 3.2
- [x] `BaseField` + `FieldLabel` + `FieldErrors` + `Hint`: Tasks 4.1–4.4
- [x] Per-field migration (fresco-styled): Tasks 5.1–5.14
- [x] Per-field migration (structural-only): Tasks 6.1–6.8
- [x] Cleanup: Tasks 7.1–7.5
- [x] Verification criteria: build + typecheck + lint + knip + visual smoke, each in its own task
