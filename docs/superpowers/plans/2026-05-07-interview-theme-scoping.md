# Interview Theme Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the interview theme off `:root[data-theme-interview]` so the attribute can be applied to any element in the DOM, and thread portal containers through fresco-ui so dialogs/popovers stay inside the themed subtree.

**Architecture:** A single sentinel CSS custom property `--theme-root-size` decouples the type scale from `rem`'s html-anchor; the interview theme rewrites this sentinel at breakpoints. Tailwind variants `interview:` / `dashboard:` change to scoped attribute selectors with a `:not()` chain for the negation. A new `<ThemedRegion>` component (in `@codaco/fresco-ui`) bundles the theme attribute and a `<PortalContainerProvider>`; every Portal-using component reads the provided container via context and falls back to `document.body` outside a provider.

**Tech Stack:** Tailwind v4, React 19, Base UI, Vitest + jsdom + @testing-library, pnpm workspaces, Changesets.

**Spec reference:** `docs/superpowers/specs/2026-05-07-interview-theme-scoping-design.md`

---

## File Map

**Created**
- `packages/fresco-ui/src/PortalContainer.tsx` — context, provider, `usePortalContainer` hook
- `packages/fresco-ui/src/PortalContainer.test.tsx` — provider/hook tests
- `packages/fresco-ui/src/ThemedRegion.tsx` — themed-region wrapper
- `packages/fresco-ui/src/ThemedRegion.test.tsx` — wrapper tests

**Modified**
- `tooling/tailwind/fresco/theme.css` — rewrite `--text-*` scale using sentinel
- `tooling/tailwind/fresco/themes/default.css` — declare `--theme-root-size: 1rem` on `:root`
- `tooling/tailwind/fresco/themes/interview.css` — drop `:root` selector, switch to rem-based sentinel
- `tooling/tailwind/fresco/utilities.css` — update `interview:` and `dashboard:` variants
- `tooling/tailwind/fresco/fresco.css` — remove duplicate variant declarations
- `tooling/tailwind/README.md` — update theming description
- `packages/fresco-ui/package.json` — add `./PortalContainer` and `./ThemedRegion` exports
- `packages/fresco-ui/src/Modal/Modal.tsx` — thread portal container
- `packages/fresco-ui/src/Popover.tsx` — thread portal container
- `packages/fresco-ui/src/Tooltip.tsx` — thread portal container
- `packages/fresco-ui/src/DropdownMenu.tsx` — thread portal container (×2 sites)
- `packages/fresco-ui/src/Toast.tsx` — thread portal container
- `packages/fresco-ui/src/form/fields/Select/Styled.tsx` — thread portal container
- `packages/fresco-ui/src/form/fields/Combobox/Combobox.tsx` — thread portal container
- `packages/fresco-ui/.storybook/theme-switcher.tsx` — replace `useLayoutEffect` with `<ThemedRegion>`
- `packages/fresco-ui/README.md` — document `<ThemedRegion>` and `<PortalContainerProvider>`
- `packages/interview/src/toast/InterviewToast.tsx` — thread portal container
- `packages/interview/src/Shell.tsx` — wrap with `<ThemedRegion>`
- `packages/interview/.storybook/preview.tsx` — replace `InterviewThemeRoot` with `<ThemedRegion>`
- `packages/interview/README.md` — delete "Theming & DOM scope" section, replace with brief paragraph

**Deleted**
- `.changeset/interview-1-0-0-alpha-14.md` — superseded; replaced by alpha-15 changeset

**New changesets**
- `.changeset/tailwind-config-theme-root-size-sentinel.md`
- `.changeset/fresco-ui-themed-region-portal-container.md`
- `.changeset/interview-1-0-0-alpha-15.md`

---

## Task 1: Add `--theme-root-size` sentinel to default theme + rewrite type scale

**Files:**
- Modify: `tooling/tailwind/fresco/themes/default.css`
- Modify: `tooling/tailwind/fresco/theme.css`

This task rewrites the type scale to bind to `var(--theme-root-size)` instead of `rem`. The default theme declares the sentinel as `1rem` so existing behavior is preserved exactly (and OS text-zoom continues to scale the type).

- [ ] **Step 1: Add the sentinel to the default theme**

In `tooling/tailwind/fresco/themes/default.css`, find the `:root` block at line 13 and add `--theme-root-size: 1rem;` as the first variable in the block:

```css
@layer theme {
  :root {
    --theme-root-size: 1rem;

    --heading-font: 'Nunito Variable', sans-serif;
    --body-font: 'Inclusive Sans Variable', sans-serif;
    /* …rest unchanged… */
  }
}
```

- [ ] **Step 2: Rewrite the type scale in `theme.css`**

In `tooling/tailwind/fresco/theme.css`, replace the entire `--text-*` block (lines 22–52). The line-heights and letter-spacing values are unchanged (they're unitless or em-based):

```css
  --text-*: initial; /* Reset TW theme defaults */

  --text-xs:   clamp(calc(0.64  * var(--theme-root-size)),
                     calc(0.733 * var(--theme-root-size) + 0.283vw),
                     calc(0.79  * var(--theme-root-size)));
  --text-xs--line-height: 1.85;
  --text-xs--letter-spacing: 0.03em;

  --text-sm:   clamp(calc(0.8   * var(--theme-root-size)),
                     calc(0.844 * var(--theme-root-size) + 0.223vw),
                     calc(0.889 * var(--theme-root-size)));
  --text-sm--line-height: 1.8;
  --text-sm--letter-spacing: 0.02em;

  --text-base: var(--theme-root-size);
  --text-base--line-height: 1.7;
  --text-base--letter-spacing: 0;

  --text-lg:   clamp(calc(1.125 * var(--theme-root-size)),
                     calc(1.063 * var(--theme-root-size) + 0.313vw),
                     calc(1.25  * var(--theme-root-size)));
  --text-lg--line-height: 1.5;
  --text-lg--letter-spacing: -0.01em;

  --text-xl:   clamp(calc(1.266 * var(--theme-root-size)),
                     calc(1.141 * var(--theme-root-size) + 0.625vw),
                     calc(1.563 * var(--theme-root-size)));
  --text-xl--line-height: 1.4;
  --text-xl--letter-spacing: -0.015em;

  --text-2xl:  clamp(calc(1.424 * var(--theme-root-size)),
                     calc(1.174 * var(--theme-root-size) + 1.25vw),
                     calc(1.953 * var(--theme-root-size)));
  --text-2xl--line-height: 1.3;
  --text-2xl--letter-spacing: -0.02em;

  --text-3xl:  clamp(calc(1.602 * var(--theme-root-size)),
                     calc(1.143 * var(--theme-root-size) + 2.295vw),
                     calc(2.441 * var(--theme-root-size)));
  --text-3xl--line-height: 1.25;
  --text-3xl--letter-spacing: -0.025em;

  --text-4xl:  clamp(calc(1.802 * var(--theme-root-size)),
                     calc(1.052 * var(--theme-root-size) + 3.75vw),
                     calc(3.052 * var(--theme-root-size)));
  --text-4xl--line-height: 1.2;
  --text-4xl--letter-spacing: -0.03em;
```

- [ ] **Step 3: Verify the diff**

Run `git diff tooling/tailwind/fresco/themes/default.css tooling/tailwind/fresco/theme.css` and confirm:
- One added line in `themes/default.css` (the `--theme-root-size: 1rem;` declaration).
- 8 `--text-*` clamp/value definitions in `theme.css` rewritten with `var(--theme-root-size)`. Line-heights and letter-spacing unchanged.

- [ ] **Step 4: Commit**

```bash
git add tooling/tailwind/fresco/themes/default.css tooling/tailwind/fresco/theme.css
git commit -m "feat(tailwind-config): bind type scale to --theme-root-size sentinel"
```

---

## Task 2: Move interview theme off `:root` and use rem-based sentinel

**Files:**
- Modify: `tooling/tailwind/fresco/themes/interview.css`

The interview theme's two `:root[data-theme-interview]` blocks become `[data-theme-interview]`. The responsive font-size override switches from literal `font-size: 16/18/20px` (which only works on `<html>`) to a sentinel-based pattern that honors user OS text-zoom.

- [ ] **Step 1: Update the `@layer base` block**

In `tooling/tailwind/fresco/themes/interview.css`, replace the `@layer base { :root[data-theme-interview] { … } }` block (lines 15–46) with:

```css
@layer base {
  /*
   * The wrapper sets `font-size: var(--theme-root-size)` so that em-based
   * spacing utilities (--spacing-base: 0.25em) track the same base. The
   * sentinel itself is consumed by the type scale (--text-* in theme.css)
   * via calc(N * var(--theme-root-size)). Because the sentinel resolves
   * at the closest themed ancestor and inherits as a fixed value, nested
   * text-* utilities don't compound — it mimics rem's root-anchoring
   * behavior, scoped to this themed region.
   *
   * Using rem (not px) preserves user OS text-zoom. At default OS scaling
   * the values resolve to 16/18/20px, identical to the previous behavior.
   */
  [data-theme-interview] {
    --theme-root-size: 1rem;
    font-size: var(--theme-root-size);

    @media (width >= 1279px) {
      --theme-root-size: 1.125rem;
    }

    @media (width >= 1920px) {
      --theme-root-size: 1.25rem;
    }
  }
}
```

- [ ] **Step 2: Update the `@layer theme` selector**

In the same file, change the selector on the `@layer theme { :root[data-theme-interview] { … } }` block (currently at line 49) to `[data-theme-interview]`. Do not change the variable declarations inside the block — only the selector.

```css
@layer theme {
  [data-theme-interview] {
    --heading-font: 'Nunito Variable', sans-serif;
    /* …all variables unchanged… */
  }
}
```

- [ ] **Step 3: Update the file's docblock**

The file's top-level comment (lines 1–13) describes the `<html>`-only behavior. Replace it with:

```css
/*
 * @codaco/tailwind-config — Fresco interview theme
 *
 * Layered on top of `themes/default.css`. Activates on any element
 * carrying the `data-theme-interview` attribute. The wrapper sets a
 * responsive `--theme-root-size` (1rem / 1.125rem / 1.25rem at default
 * OS scaling, scaled proportionally under user text-zoom), which the
 * type scale in `theme.css` consumes via calc(N * var(--theme-root-size)).
 *
 * Provides a darker palette and Nunito-only typography tuned for the
 * interview UI.
 */
```

- [ ] **Step 4: Verify the diff**

Run `git diff tooling/tailwind/fresco/themes/interview.css` and confirm:
- The `@layer base` block uses `[data-theme-interview]` (no `:root`) and `--theme-root-size: 1rem | 1.125rem | 1.25rem` at the breakpoints.
- The `@layer theme` block selector is `[data-theme-interview]` (no `:root`); variable declarations inside are unchanged.
- The docblock is rewritten.

- [ ] **Step 5: Commit**

```bash
git add tooling/tailwind/fresco/themes/interview.css
git commit -m "feat(tailwind-config): scope interview theme to [data-theme-interview]"
```

---

## Task 3: Update Tailwind variants and remove duplicate declarations

**Files:**
- Modify: `tooling/tailwind/fresco/utilities.css`
- Modify: `tooling/tailwind/fresco/fresco.css`

`interview:` becomes a descendant selector matching anything inside a themed wrapper. `dashboard:` becomes a `:not()` chain that excludes themed wrappers and their descendants — required because the previous negation form `:root:not([data-theme-interview])` would silently match everything once the attribute leaves `<html>`. The duplicate declarations in `fresco.css` are removed since `fresco.css` already imports `utilities.css`.

- [ ] **Step 1: Update variants in `utilities.css`**

In `tooling/tailwind/fresco/utilities.css`, replace lines 125–126:

```css
@custom-variant interview ([data-theme-interview] &);
@custom-variant dashboard (&:not([data-theme-interview] *):not([data-theme-interview]));
```

Keep the existing comment block above (lines 120–124) intact — it accurately describes the variants' purpose and remains correct.

- [ ] **Step 2: Remove the duplicate declarations in `fresco.css`**

In `tooling/tailwind/fresco/fresco.css`, delete lines 44–50 (the comment block + both `@custom-variant` declarations):

```css
/* App-scoped variants. fresco-ui components hard-code `interview:` /
   `dashboard:` prefixes (e.g. Button.tsx swaps default-color tokens via
   `interview:[...]`). They live in the foundation barrel so any consumer
   of `@codaco/tailwind-config/fresco.css` gets them in the same Tailwind
   compilation pass that scans the components. */
@custom-variant interview (:root[data-theme-interview] &);
@custom-variant dashboard (:root:not([data-theme-interview]) &);
```

These are duplicates — `utilities.css` is `@import`ed at line 29 of `fresco.css` and now contains the canonical declarations.

- [ ] **Step 3: Update `fresco.css` docblock to reflect new behavior**

Find the docblock (lines 1–17 of `fresco.css`) and update the line that currently reads:

```
 * theme scopes its overrides to `:root[data-theme-interview]`, which
 * only matches while the interview Shell is mounted (Shell sets the
 * attribute on `<html>` via a useLayoutEffect).
```

Replace with:

```
 * theme scopes its overrides to `[data-theme-interview]`, which
 * matches any element carrying the attribute (typically the wrapper
 * rendered by `<ThemedRegion theme="interview">` from @codaco/fresco-ui).
```

Also update the comment at line 32 (`overrides under :root[data-theme-interview]`) to read `overrides under [data-theme-interview]`.

- [ ] **Step 4: Verify the diff**

Run `git diff tooling/tailwind/fresco/utilities.css tooling/tailwind/fresco/fresco.css`:
- `utilities.css`: 2-line change to the variant declarations.
- `fresco.css`: 7 lines removed (comment + 2 declarations), 2 docblock lines updated.

- [ ] **Step 5: Commit**

```bash
git add tooling/tailwind/fresco/utilities.css tooling/tailwind/fresco/fresco.css
git commit -m "feat(tailwind-config): scope interview/dashboard variants for nesting"
```

---

## Task 4: Update tailwind-config README and add changeset

**Files:**
- Modify: `tooling/tailwind/README.md`
- Create: `.changeset/tailwind-config-theme-root-size-sentinel.md`

- [ ] **Step 1: Update README line 33**

In `tooling/tailwind/README.md`, find the paragraph describing the interview theme on line 33 and replace it with:

```
The default theme writes its values under `:root`; the interview theme layers overrides under `[data-theme-interview]`, which can be placed on any element. The type scale binds to a `--theme-root-size` sentinel that each theme declares (`1rem` for the default, `1rem`/`1.125rem`/`1.25rem` at viewport breakpoints for the interview theme). Both themes ship together in the foundation barrel; consumers typically wrap interview UI with `<ThemedRegion theme="interview">` from `@codaco/fresco-ui`.
```

- [ ] **Step 2: Create the changeset**

Create `.changeset/tailwind-config-theme-root-size-sentinel.md`:

```markdown
---
"@codaco/tailwind-config": prerelease
---

Type scale rewritten to use a `--theme-root-size` sentinel custom property; the interview theme drops the `:root` requirement and binds to `[data-theme-interview]` on any element. Responsive font-sizes now also honor user OS text-zoom (rem-based instead of px-pegged). `interview:` and `dashboard:` `@custom-variant` selectors updated to support nested coexistence — `dashboard:` uses a `:not()` chain so it correctly excludes themed regions and their descendants instead of relying on the broken `:root` negation.

**Breaking** for any consumer that pinned to `:root[data-theme-interview]` selectors directly. The supported integration is via `<ThemedRegion theme="interview">` from `@codaco/fresco-ui` (or directly setting the attribute on a wrapper element).
```

- [ ] **Step 3: Commit**

```bash
git add tooling/tailwind/README.md .changeset/tailwind-config-theme-root-size-sentinel.md
git commit -m "docs(tailwind-config): document scoped interview theme + sentinel"
```

---

## Task 5: Create `PortalContainer` (provider + hook + tests)

**Files:**
- Create: `packages/fresco-ui/src/PortalContainer.tsx`
- Create: `packages/fresco-ui/src/PortalContainer.test.tsx`

A small React context that exposes a DOM node for portal-using components to target. Hosts wrap themed regions with `<PortalContainerProvider>`; portals (Modal, Popover, etc.) read the container via `usePortalContainer()` and pass it to Base UI's `Portal` `container` prop. Outside a provider, the hook returns `null` and Base UI falls back to `document.body`.

- [ ] **Step 1: Write the failing test**

Create `packages/fresco-ui/src/PortalContainer.test.tsx`:

```tsx
import { render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PortalContainerProvider, usePortalContainer } from "./PortalContainer";

describe("PortalContainerProvider", () => {
	it("exposes a DOM node via usePortalContainer when wrapping children", () => {
		const { result } = renderHook(() => usePortalContainer(), {
			wrapper: ({ children }) => <PortalContainerProvider>{children}</PortalContainerProvider>,
		});

		expect(result.current).toBeInstanceOf(HTMLElement);
	});

	it("returns null when usePortalContainer is called outside a provider", () => {
		const { result } = renderHook(() => usePortalContainer());
		expect(result.current).toBeNull();
	});

	it("renders children", () => {
		render(
			<PortalContainerProvider>
				<span data-testid="child">hello</span>
			</PortalContainerProvider>,
		);
		expect(screen.getByTestId("child")).toHaveTextContent("hello");
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @codaco/fresco-ui exec vitest run src/PortalContainer.test.tsx --project unit
```

Expected: failure — module `./PortalContainer` not found.

- [ ] **Step 3: Implement the provider**

Create `packages/fresco-ui/src/PortalContainer.tsx`:

```tsx
"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

const PortalContainerContext = createContext<HTMLElement | null>(null);

export function PortalContainerProvider({ children }: { children: ReactNode }) {
	const [container, setContainer] = useState<HTMLElement | null>(null);
	return (
		<PortalContainerContext.Provider value={container}>
			{children}
			<div ref={setContainer} />
		</PortalContainerContext.Provider>
	);
}

export function usePortalContainer() {
	return useContext(PortalContainerContext);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @codaco/fresco-ui exec vitest run src/PortalContainer.test.tsx --project unit
```

Expected: 3 tests pass.

- [ ] **Step 5: Run lint:fix and typecheck**

```bash
pnpm --filter @codaco/fresco-ui lint:fix
pnpm --filter @codaco/fresco-ui typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/fresco-ui/src/PortalContainer.tsx packages/fresco-ui/src/PortalContainer.test.tsx
git commit -m "feat(fresco-ui): add PortalContainerProvider context"
```

---

## Task 6: Create `<ThemedRegion>` (component + tests)

**Files:**
- Create: `packages/fresco-ui/src/ThemedRegion.tsx`
- Create: `packages/fresco-ui/src/ThemedRegion.test.tsx`

A user-facing component bundling the theme attribute and the portal-container provider. Supports a `render` prop (Base-UI-style polymorphism, already used elsewhere in fresco-ui) so the Shell can render the wrapper as `<main>` instead of the default `<div>`.

- [ ] **Step 1: Write the failing tests**

Create `packages/fresco-ui/src/ThemedRegion.test.tsx`:

```tsx
import { render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePortalContainer } from "./PortalContainer";
import { ThemedRegion } from "./ThemedRegion";

describe("ThemedRegion", () => {
	it("renders a div with data-theme-interview when theme=interview", () => {
		const { container } = render(
			<ThemedRegion theme="interview">
				<span data-testid="child">hello</span>
			</ThemedRegion>,
		);

		const wrapper = container.firstElementChild;
		expect(wrapper).not.toBeNull();
		expect(wrapper?.tagName).toBe("DIV");
		expect(wrapper?.hasAttribute("data-theme-interview")).toBe(true);
		expect(screen.getByTestId("child")).toHaveTextContent("hello");
	});

	it("forwards className and other HTML props to the wrapper", () => {
		const { container } = render(
			<ThemedRegion theme="interview" className="custom-class" id="region">
				<span />
			</ThemedRegion>,
		);

		const wrapper = container.firstElementChild;
		expect(wrapper).toHaveClass("custom-class");
		expect(wrapper).toHaveAttribute("id", "region");
	});

	it("supports the render prop for tag polymorphism", () => {
		const { container } = render(
			<ThemedRegion theme="interview" render={<main className="shell" />}>
				<span data-testid="child" />
			</ThemedRegion>,
		);

		const wrapper = container.firstElementChild;
		expect(wrapper?.tagName).toBe("MAIN");
		expect(wrapper?.hasAttribute("data-theme-interview")).toBe(true);
		expect(wrapper).toHaveClass("shell");
		expect(screen.getByTestId("child")).toBeInTheDocument();
	});

	it("provides a portal container to descendants via context", () => {
		const { result } = renderHook(() => usePortalContainer(), {
			wrapper: ({ children }) => <ThemedRegion theme="interview">{children}</ThemedRegion>,
		});

		expect(result.current).toBeInstanceOf(HTMLElement);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @codaco/fresco-ui exec vitest run src/ThemedRegion.test.tsx --project unit
```

Expected: failure — module `./ThemedRegion` not found.

- [ ] **Step 3: Implement `<ThemedRegion>`**

Create `packages/fresco-ui/src/ThemedRegion.tsx`:

```tsx
"use client";

import { cloneElement, isValidElement, type HTMLAttributes, type ReactElement, type ReactNode } from "react";
import { PortalContainerProvider } from "./PortalContainer";
import { cx } from "./utils/cva";

type ThemedRegionProps = {
	theme: "interview";
	children: ReactNode;
	className?: string;
	render?: ReactElement;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">;

export function ThemedRegion({ theme, render, children, className, ...rest }: ThemedRegionProps) {
	const themeAttr = theme === "interview" ? { "data-theme-interview": "" } : {};
	const body = <PortalContainerProvider>{children}</PortalContainerProvider>;

	if (render && isValidElement<{ className?: string }>(render)) {
		return cloneElement(render, {
			...themeAttr,
			...rest,
			className: cx(render.props.className, className),
			children: body,
		});
	}

	return (
		<div {...themeAttr} {...rest} className={className}>
			{body}
		</div>
	);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @codaco/fresco-ui exec vitest run src/ThemedRegion.test.tsx --project unit
```

Expected: 4 tests pass.

- [ ] **Step 5: Run lint:fix and typecheck**

```bash
pnpm --filter @codaco/fresco-ui lint:fix
pnpm --filter @codaco/fresco-ui typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/fresco-ui/src/ThemedRegion.tsx packages/fresco-ui/src/ThemedRegion.test.tsx
git commit -m "feat(fresco-ui): add ThemedRegion wrapper with portal container"
```

---

## Task 7: Add new exports to fresco-ui `package.json`

**Files:**
- Modify: `packages/fresco-ui/package.json`

The package uses `exports` (sub-path style) and a build that emits each source file under `dist/`. Add two new entries.

- [ ] **Step 1: Add the exports**

In `packages/fresco-ui/package.json`, find the `exports` block and add these two entries (ordering: alphabetical near related entries — place `./PortalContainer` and `./ThemedRegion` near the top-level component exports like `./Toast`, `./Tooltip`):

```json
		"./PortalContainer": {
			"types": "./dist/PortalContainer.d.ts",
			"default": "./dist/PortalContainer.js"
		},
		"./ThemedRegion": {
			"types": "./dist/ThemedRegion.d.ts",
			"default": "./dist/ThemedRegion.js"
		},
```

- [ ] **Step 2: Verify the build picks them up**

```bash
pnpm --filter @codaco/fresco-ui build
ls packages/fresco-ui/dist/PortalContainer.js packages/fresco-ui/dist/PortalContainer.d.ts
ls packages/fresco-ui/dist/ThemedRegion.js packages/fresco-ui/dist/ThemedRegion.d.ts
```

Expected: all four files exist.

- [ ] **Step 3: Commit**

```bash
git add packages/fresco-ui/package.json
git commit -m "feat(fresco-ui): export PortalContainer and ThemedRegion"
```

---

## Task 8: Thread portal container through `Modal`

**Files:**
- Modify: `packages/fresco-ui/src/Modal/Modal.tsx`

The pattern repeats for every Portal site: read the container via `usePortalContainer()` and pass it as the `container` prop. When the hook returns `null`, pass `undefined` so Base UI falls back to its default (`document.body`).

- [ ] **Step 1: Update `Modal.tsx`**

In `packages/fresco-ui/src/Modal/Modal.tsx`, replace the entire file content with:

```tsx
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { AnimatePresence } from "motion/react";
import type { ReactNode } from "react";
import { usePortalContainer } from "../PortalContainer";
import { ModalBackdrop } from "./ModalBackdrop";

/**
 * A modal component designed to render full screen "overlay" UIs using
 * Base-UI's Dialog system. Handles open/close state and animation of
 * backdrop and content via motion's AnimatePresence.
 *
 * Use with ModalPopup or similar based on Dialog.Popup for the content.
 *
 * @see ModalPopup for a popup component to use within the Modal.
 * @see Dialog for an example of using this component to create a modal overlay.
 *
 * @param open Whether the modal is open.
 * @param onOpenChange Callback when the open state changes.
 * @param children The content of the modal.
 *
 *
 */
export default function Modal({
	open,
	onOpenChange,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
}) {
	const portalContainer = usePortalContainer();

	return (
		<BaseDialog.Root open={open} onOpenChange={onOpenChange}>
			<AnimatePresence>
				{open && (
					<BaseDialog.Portal container={portalContainer ?? undefined} keepMounted>
						<ModalBackdrop />
						{children}
					</BaseDialog.Portal>
				)}
			</AnimatePresence>
		</BaseDialog.Root>
	);
}
```

- [ ] **Step 2: Run tests**

```bash
pnpm --filter @codaco/fresco-ui exec vitest run --project unit
```

Expected: existing tests still pass.

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @codaco/fresco-ui typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/fresco-ui/src/Modal/Modal.tsx
git commit -m "feat(fresco-ui): thread portal container through Modal"
```

---

## Task 9: Thread portal container through `Popover`

**Files:**
- Modify: `packages/fresco-ui/src/Popover.tsx`

- [ ] **Step 1: Update `PopoverContent`**

In `packages/fresco-ui/src/Popover.tsx`, find `PopoverContent` (starts at line 144) and modify it:

1. Add the import at the top of the file:

```tsx
import { usePortalContainer } from "./PortalContainer";
```

2. Inside `PopoverContent` (after the `usePopoverContext()` call at line 154), add:

```tsx
	const portalContainer = usePortalContainer();
```

3. On the `<BasePopover.Portal>` line (line 157), add the `container` prop. The line currently is:

```tsx
		<BasePopover.Portal keepMounted={keepMounted} {...(props as ComponentPropsWithoutRef<typeof BasePopover.Portal>)}>
```

Replace with:

```tsx
		<BasePopover.Portal
			container={portalContainer ?? undefined}
			keepMounted={keepMounted}
			{...(props as ComponentPropsWithoutRef<typeof BasePopover.Portal>)}
		>
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @codaco/fresco-ui typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/fresco-ui/src/Popover.tsx
git commit -m "feat(fresco-ui): thread portal container through Popover"
```

---

## Task 10: Thread portal container through `Tooltip`

**Files:**
- Modify: `packages/fresco-ui/src/Tooltip.tsx`

- [ ] **Step 1: Update `TooltipContent`**

In `packages/fresco-ui/src/Tooltip.tsx`:

1. Add the import at the top:

```tsx
import { usePortalContainer } from "./PortalContainer";
```

2. The component is a `React.forwardRef` callback; convert it from arrow-callback shorthand to a function body so we can call the hook. Replace the existing `TooltipContent` definition (lines 23–54) with:

```tsx
const TooltipContent = React.forwardRef<React.ElementRef<typeof BaseTooltip.Popup>, TooltipContentProps>(
	({ className, sideOffset = 10, side = "top", align = "center", showArrow = true, children, ...props }, ref) => {
		const portalContainer = usePortalContainer();
		return (
			<BaseTooltip.Portal container={portalContainer ?? undefined}>
				<BaseTooltip.Positioner side={side} sideOffset={sideOffset} align={align}>
					<AnimatePresence>
						<BaseTooltip.Popup
							ref={ref}
							render={
								<MotionSurface
									level="popover"
									elevation="none"
									className={cx(
										"@container-normal max-w-(--available-width) overflow-visible text-sm shadow-xl",
										className,
									)}
									initial={{ opacity: 0, scale: 0.96 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.96 }}
									noContainer
									transition={{ type: "spring", duration: 0.5 }}
								/>
							}
							{...props}
						>
							{showArrow && <TooltipArrow />}
							{children}
						</BaseTooltip.Popup>
					</AnimatePresence>
				</BaseTooltip.Positioner>
			</BaseTooltip.Portal>
		);
	},
);
TooltipContent.displayName = "TooltipContent";
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @codaco/fresco-ui typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/fresco-ui/src/Tooltip.tsx
git commit -m "feat(fresco-ui): thread portal container through Tooltip"
```

---

## Task 11: Thread portal container through `DropdownMenu` (both Sub and Content variants)

**Files:**
- Modify: `packages/fresco-ui/src/DropdownMenu.tsx`

`DropdownMenu.tsx` has two Portal sites: `DropdownMenuSubContent` (line 77) and `DropdownMenuContent` (line 103). Both need the same treatment.

- [ ] **Step 1: Add the import**

In `packages/fresco-ui/src/DropdownMenu.tsx`, add at the top of the file:

```tsx
import { usePortalContainer } from "./PortalContainer";
```

- [ ] **Step 2: Update `DropdownMenuSubContent`**

Find the body of `DropdownMenuSubContent` (around line 73). Inside the component callback, after `const { mounted } = useDropdownMenuContext();`, add:

```tsx
	const portalContainer = usePortalContainer();
```

Then update the `<Menu.Portal>` line:

```tsx
		<Menu.Portal container={portalContainer ?? undefined} keepMounted={keepMounted}>
```

- [ ] **Step 3: Update `DropdownMenuContent`**

Find the body of `DropdownMenuContent` (around line 100). Inside the component callback, after `const { mounted } = useDropdownMenuContext();`, add:

```tsx
	const portalContainer = usePortalContainer();
```

Then update the `<Menu.Portal>` line:

```tsx
		<Menu.Portal container={portalContainer ?? undefined} keepMounted={keepMounted}>
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm --filter @codaco/fresco-ui typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/fresco-ui/src/DropdownMenu.tsx
git commit -m "feat(fresco-ui): thread portal container through DropdownMenu"
```

---

## Task 12: Thread portal container through `Toast`

**Files:**
- Modify: `packages/fresco-ui/src/Toast.tsx`

- [ ] **Step 1: Update `Toaster`**

In `packages/fresco-ui/src/Toast.tsx`:

1. Add the import at the top:

```tsx
import { usePortalContainer } from "./PortalContainer";
```

2. Update the `Toaster` function (starts at line 151) to call the hook and pass `container`:

```tsx
export function Toaster() {
	const { toasts } = useToast();
	const portalContainer = usePortalContainer();

	return (
		<Toast.Portal container={portalContainer ?? undefined}>
			<Toast.Viewport
				className={cx(
					"phone-landscape:max-w-sm fixed top-auto bottom-2 mx-auto flex w-full",
					"tablet-portrait:right-8 tablet-portrait:bottom-8 z-10",
				)}
			>
				{toasts.map((toast) => (
					<ToastItem key={toast.id} toast={toast} />
				))}
			</Toast.Viewport>
		</Toast.Portal>
	);
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @codaco/fresco-ui typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/fresco-ui/src/Toast.tsx
git commit -m "feat(fresco-ui): thread portal container through Toast"
```

---

## Task 13: Thread portal container through `Select` and `Combobox`

**Files:**
- Modify: `packages/fresco-ui/src/form/fields/Select/Styled.tsx`
- Modify: `packages/fresco-ui/src/form/fields/Combobox/Combobox.tsx`

- [ ] **Step 1: Update `Select/Styled.tsx`**

In `packages/fresco-ui/src/form/fields/Select/Styled.tsx`, add the import at the top (the file imports use four `../` levels — verify path):

```tsx
import { usePortalContainer } from "../../../PortalContainer";
```

Inside `SelectField` (after `const handleValueChange = …` block, before the `return`), add:

```tsx
	const portalContainer = usePortalContainer();
```

Update the `<Select.Portal>` line (line 59):

```tsx
				<Select.Portal container={portalContainer ?? undefined}>
```

- [ ] **Step 2: Update `Combobox.tsx`**

In `packages/fresco-ui/src/form/fields/Combobox/Combobox.tsx`, add the import (verify path — Combobox is one level deeper than Select; should be 3 levels):

```tsx
import { usePortalContainer } from "../../../PortalContainer";
```

Locate the body of the Combobox component, find a sensible location to call the hook (near the top of the component, with other hooks), and add:

```tsx
	const portalContainer = usePortalContainer();
```

Update the `<Combobox.Portal>` line (line 143):

```tsx
				<Combobox.Portal container={portalContainer ?? undefined}>
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @codaco/fresco-ui typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/fresco-ui/src/form/fields/Select/Styled.tsx packages/fresco-ui/src/form/fields/Combobox/Combobox.tsx
git commit -m "feat(fresco-ui): thread portal container through Select and Combobox"
```

---

## Task 14: Update fresco-ui Storybook theme-switcher

**Files:**
- Modify: `packages/fresco-ui/.storybook/theme-switcher.tsx`

Replace the `useLayoutEffect`-on-html pattern with `<ThemedRegion>`. The `INTERVIEW_ATTR` constant becomes unused.

- [ ] **Step 1: Rewrite the file**

Replace `packages/fresco-ui/.storybook/theme-switcher.tsx` with:

```tsx
import type { Decorator } from "@storybook/react-vite";
import { ThemedRegion } from "../src/ThemedRegion";
import { cx } from "../src/utils/cva";

const THEME_KEY = "theme";
const STORAGE_KEY = "storybook-theme-preference";

const themes = {
	dashboard: {
		name: "Dashboard",
	},
	interview: {
		name: "Interview",
	},
} as const;

type ThemeKey = keyof typeof themes;

function getStoredTheme(): ThemeKey | null {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored && stored in themes) {
			return stored as ThemeKey;
		}
	} catch (error) {
		// eslint-disable-next-line no-console
		console.warn("Failed to read theme from localStorage:", error);
	}
	return null;
}

function setStoredTheme(theme: ThemeKey) {
	try {
		localStorage.setItem(STORAGE_KEY, theme);
	} catch (error) {
		// eslint-disable-next-line no-console
		console.warn("Failed to save theme to localStorage:", error);
	}
}

function ThemeWrapper({ selectedTheme, children }: { selectedTheme: ThemeKey; children: React.ReactNode }) {
	setStoredTheme(selectedTheme);

	if (selectedTheme === "interview") {
		return (
			<ThemedRegion theme="interview" className="bg-background text-text publish-colors scheme-dark">
				{children}
			</ThemedRegion>
		);
	}

	return <div className={cx("bg-background text-text publish-colors")}>{children}</div>;
}

export const withTheme: Decorator = (Story, context) => {
	const selectedTheme =
		(context.parameters.forceTheme as ThemeKey) ?? (context.globals[THEME_KEY] as ThemeKey) ?? "dashboard";

	return (
		<ThemeWrapper selectedTheme={selectedTheme}>
			<Story />
		</ThemeWrapper>
	);
};

export const globalTypes = {
	[THEME_KEY]: {
		name: "Theme",
		description: "Global theme for components",
		defaultValue: getStoredTheme() ?? "dashboard",
		toolbar: {
			icon: "paintbrush" as const,
			items: Object.entries(themes).map(([key, { name }]) => ({
				value: key,
				title: name,
			})),
			showName: true,
			dynamicTitle: true,
		},
	},
};

export function getInitialTheme(): ThemeKey {
	return getStoredTheme() ?? "dashboard";
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @codaco/fresco-ui typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/fresco-ui/.storybook/theme-switcher.tsx
git commit -m "feat(fresco-ui): use ThemedRegion in Storybook theme-switcher"
```

---

## Task 15: Update fresco-ui README and add changeset

**Files:**
- Modify: `packages/fresco-ui/README.md`
- Create: `.changeset/fresco-ui-themed-region-portal-container.md`

- [ ] **Step 1: Update README line 65 area**

In `packages/fresco-ui/README.md`, find the existing line referencing `data-theme-interview` (around line 65) and the surrounding paragraph. Update it to describe `<ThemedRegion>` and document the containing-block constraint.

Read the existing context first (read lines 50–90 of the file to see the surrounding paragraph), then replace the relevant paragraph with:

```markdown
The interview theme is activated by the `data-theme-interview` attribute. Hosts typically apply it via the `<ThemedRegion theme="interview">` component (exported from `@codaco/fresco-ui/ThemedRegion`), which also wires up a `<PortalContainerProvider>` so dialogs, popovers, dropdowns, tooltips, toasts, selects, and comboboxes portal into a node inside the themed subtree (and therefore inherit the theme's CSS variables) instead of into `document.body`.

**Containing-block constraint:** the `<ThemedRegion>` element and its ancestors up to `<body>` must not have `transform`, `filter`, `perspective`, or `contain` set. Any of these creates a new containing block for fixed-positioned descendants, which would break modal/popover positioning. If you cannot satisfy this constraint, fall back to applying `data-theme-interview` higher in the tree (e.g. `<body>`).
```

- [ ] **Step 2: Create the changeset**

Create `.changeset/fresco-ui-themed-region-portal-container.md`:

```markdown
---
"@codaco/fresco-ui": minor
---

New `<ThemedRegion>` component and `<PortalContainerProvider>` for declarative theme scoping. All Portal-using components (Modal, Popover, Tooltip, DropdownMenu, Toast, Select, Combobox) now thread a portal container through React context, allowing themed dialogs and popovers to inherit the theme of the closest themed ancestor instead of always portaling into `document.body`.

Outside a `<PortalContainerProvider>` the new container prop falls back to Base UI's default (`document.body`), so existing consumers see no behavior change.

The new exports are `@codaco/fresco-ui/ThemedRegion` (`ThemedRegion`) and `@codaco/fresco-ui/PortalContainer` (`PortalContainerProvider`, `usePortalContainer`).
```

- [ ] **Step 3: Commit**

```bash
git add packages/fresco-ui/README.md .changeset/fresco-ui-themed-region-portal-container.md
git commit -m "docs(fresco-ui): document ThemedRegion + portal container"
```

---

## Task 16: Thread portal container through `InterviewToastViewport`

**Files:**
- Modify: `packages/interview/src/toast/InterviewToast.tsx`

- [ ] **Step 1: Update `InterviewToastViewport`**

In `packages/interview/src/toast/InterviewToast.tsx`:

1. Add the import at the top of the file:

```tsx
import { usePortalContainer } from "@codaco/fresco-ui/PortalContainer";
```

2. Update `InterviewToastViewport` (starts at line 100):

```tsx
export function InterviewToastViewport() {
	const { toasts } = Toast.useToastManager();
	const portalContainer = usePortalContainer();

	return (
		<Toast.Portal container={portalContainer ?? undefined}>
			<Toast.Viewport aria-label="Interview notifications" className="pointer-events-none fixed inset-0 z-50">
				{toasts.map((toast) => (
					<InterviewToastItem key={toast.id} toast={toast} />
				))}
			</Toast.Viewport>
		</Toast.Portal>
	);
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @codaco/interview typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/interview/src/toast/InterviewToast.tsx
git commit -m "feat(interview): thread portal container through InterviewToast"
```

---

## Task 17: Update `Shell.tsx` to use `<ThemedRegion>`

**Files:**
- Modify: `packages/interview/src/Shell.tsx`

The DOM output must remain identical (`<main data-theme-interview>` with the same `className`), but the attribute now comes from `<ThemedRegion render={…}>` and the children are wrapped in `PortalContainerProvider` automatically.

- [ ] **Step 1: Update imports**

In `packages/interview/src/Shell.tsx`, add the import:

```tsx
import { ThemedRegion } from "@codaco/fresco-ui/ThemedRegion";
```

- [ ] **Step 2: Update the `Interview` component's `return`**

Find the `<main data-theme-interview …>` JSX in the `Interview` function (lines 66–115). Replace the `<main>` opening + closing tags with `<ThemedRegion theme="interview" render={<main … />}>`:

```tsx
		<ThemedRegion
			theme="interview"
			render={
				<main
					className={cx(
						"relative flex size-full flex-1 overflow-hidden bg-background text-text scheme-dark",
						isPortraitAspectRatio ? "flex-col" : "flex-row-reverse",
					)}
				/>
			}
		>
			<StageMetadataProvider value={registerBeforeNext}>
				<InterviewToastProvider
					forwardButtonRef={forwardButtonRef}
					backButtonRef={backButtonRef}
					orientation={navigationOrientation}
				>
					<AnimatePresence mode="wait" onExitComplete={handleExitComplete}>
						{showStage && stage && (
							<motion.div
								key={displayedStep}
								data-stage-step={displayedStep}
								className="flex min-h-0 flex-1"
								initial="initial"
								animate="animate"
								exit="exit"
								variants={variants}
								transition={{ duration: 0.5 }}
							>
								<div className="flex size-full flex-col items-center justify-center" id="stage" key={stage.id}>
									<StageErrorBoundary>
										{CurrentInterface && (
											<CurrentInterface key={stage.id} stage={stage} getNavigationHelpers={getNavigationHelpers} />
										)}
									</StageErrorBoundary>
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</InterviewToastProvider>
			</StageMetadataProvider>
			<Navigation
				moveBackward={moveBackward}
				moveForward={moveForward}
				disableMoveForward={disableMoveForward}
				disableMoveBackward={disableMoveBackward}
				pulseNext={pulseNext}
				progress={progress}
				orientation={navigationOrientation}
				forwardButtonRef={forwardButtonRef}
				backButtonRef={backButtonRef}
			/>
		</ThemedRegion>
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @codaco/interview typecheck
```

Expected: no errors.

- [ ] **Step 4: Run the existing test suite**

```bash
pnpm --filter @codaco/interview test
```

Expected: all tests pass (or, if no tests exist for this file, the suite still completes).

- [ ] **Step 5: Verify DOM output is unchanged**

Read the current `Shell.tsx` and confirm the outer rendered element (after JSX evaluation) is `<main data-theme-interview class="…">` with identical class names to before.

- [ ] **Step 6: Commit**

```bash
git add packages/interview/src/Shell.tsx
git commit -m "feat(interview): wrap Shell in ThemedRegion"
```

---

## Task 18: Update interview Storybook `preview.tsx`

**Files:**
- Modify: `packages/interview/.storybook/preview.tsx`

Delete the `InterviewThemeRoot` component and replace the decorator with a `<ThemedRegion>` wrapper.

- [ ] **Step 1: Rewrite the file**

Replace the entire content of `packages/interview/.storybook/preview.tsx` with:

```tsx
import "@codaco/tailwind-config/fonts/inclusive-sans.css";
import "@codaco/tailwind-config/fonts/nunito.css";
import { ThemedRegion } from "@codaco/fresco-ui/ThemedRegion";
import addonA11y from "@storybook/addon-a11y";
import addonDocs from "@storybook/addon-docs";
import addonVitest from "@storybook/addon-vitest";
import { definePreview } from "@storybook/react-vite";
import { StrictMode } from "react";
import "./preview.css";
import Providers from "./Providers";

export default definePreview({
	addons: [addonDocs(), addonA11y(), addonVitest()],
	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
	},
	decorators: [
		(Story) => {
			// Disable Base UI animations whenever Storybook is being driven
			// by automation (vitest browser mode / play-function runner).
			// Manual browsing keeps animations.
			const disableAnimations = typeof navigator !== "undefined" && navigator.webdriver === true;

			return (
				<StrictMode>
					{/*
					 * Required by Base UI's portal-based dialogs/popovers:
					 * https://base-ui.com/react/overview/quick-start#portals
					 */}
					<ThemedRegion theme="interview" className="root h-full">
						<Providers disableAnimations={disableAnimations}>
							<Story />
						</Providers>
					</ThemedRegion>
				</StrictMode>
			);
		},
	],
});
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @codaco/interview typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/interview/.storybook/preview.tsx
git commit -m "feat(interview): use ThemedRegion in Storybook preview"
```

---

## Task 19: Update interview README and replace alpha-14 changeset

**Files:**
- Modify: `packages/interview/README.md`
- Delete: `.changeset/interview-1-0-0-alpha-14.md`
- Create: `.changeset/interview-1-0-0-alpha-15.md`

- [ ] **Step 1: Update interview README**

In `packages/interview/README.md`:

1. Find the line at ~65 mentioning `data-theme-interview` on `<html>` and update it to describe the Shell-internal scoping. Read lines 55–75 first to see context, then replace whatever wording references the host setting `<html>` with: *"Shell renders `<main data-theme-interview>` with a portal container so dialogs/popovers stay inside the themed subtree — no host-side setup required. See *Theming & DOM scope* below."*

2. Replace the entire "Theming & DOM scope" section (lines ~383–417, between the surrounding `---` separators) with the markdown shown below. The outer fence in this plan uses four backticks so the inner triple-backtick `tsx` block is preserved verbatim — write the inner ` ```tsx … ``` ` block as a normal triple-backtick fenced code block in the README.

````markdown
## Theming & DOM scope

`Shell` renders a single `<main data-theme-interview>` element. This is both the stable selector for tests / e2e fixtures and the wrapper that activates the interview theme: descendants pick up the dark palette, Nunito typography, and responsive root font-size automatically.

`Shell` also provides a portal container (via `<PortalContainerProvider>` from `@codaco/fresco-ui/PortalContainer`) so dialogs, popovers, dropdowns, tooltips, toasts, selects, and comboboxes opened from inside the interview render into a node *inside* the themed subtree — they inherit the interview palette automatically rather than portaling to `document.body`.

If you render interview-themed UI **outside** of `Shell` (e.g. a "thank you" page after the interview ends), wrap that UI with `<ThemedRegion theme="interview">` from `@codaco/fresco-ui/ThemedRegion`:

```tsx
import { ThemedRegion } from "@codaco/fresco-ui/ThemedRegion";

<ThemedRegion theme="interview">
  <ThankYouPage />
</ThemedRegion>
```

`<ThemedRegion>` and its ancestors up to `<body>` must not have `transform`, `filter`, `perspective`, or `contain` set — these create new containing blocks for fixed-positioned descendants and would break modal/popover positioning.
````

- [ ] **Step 2: Delete the old alpha-14 changeset**

```bash
rm .changeset/interview-1-0-0-alpha-14.md
```

The previous changeset described "Shell no longer toggles `data-theme-interview` on `<html>`. The attribute is now the host's responsibility" — that statement is no longer accurate (Shell now toggles it declaratively via `<ThemedRegion>`).

- [ ] **Step 3: Create the alpha-15 changeset**

Create `.changeset/interview-1-0-0-alpha-15.md`:

```markdown
---
"@codaco/interview": prerelease
---

`Shell` now scopes the interview theme purely declaratively via `<ThemedRegion theme="interview">` (from `@codaco/fresco-ui/ThemedRegion`). Removed the host-side `useLayoutEffect` requirement that previously toggled `data-theme-interview` on `<html>`.

Hosts mount `Shell` anywhere in the tree and the theme — plus a portal container that re-roots Base-UI portals (dialogs, popovers, dropdowns, tooltips, toasts, selects, comboboxes) inside the themed subtree — travels with it. The `<main data-theme-interview>` marker on the rendered DOM is unchanged, so existing test/e2e selectors continue to match.

For interview-themed UI rendered **outside** `Shell` (e.g. a post-interview "thank you" page), use `<ThemedRegion theme="interview">` directly. See README → *Theming & DOM scope*.
```

- [ ] **Step 4: Commit**

```bash
git add packages/interview/README.md .changeset/interview-1-0-0-alpha-15.md
git rm .changeset/interview-1-0-0-alpha-14.md
git commit -m "docs(interview): document declarative theme scoping (alpha.15)"
```

---

## Task 20: Run full validation across packages

**Files:** none (validation only)

- [ ] **Step 1: Run lint:fix at the repo root**

```bash
pnpm lint:fix
```

Expected: no errors. If any auto-fixable issues remain (formatting), they'll be applied; commit them in a follow-up step if needed.

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: zero TypeScript errors across all packages.

- [ ] **Step 3: Run all unit tests**

```bash
pnpm test
```

Expected: all suites pass. Pay particular attention to:
- `packages/fresco-ui` — `PortalContainer.test.tsx` and `ThemedRegion.test.tsx` (3 + 4 tests).
- `packages/fresco-ui/src/dialogs/__tests__/wizardDialog.test.tsx` and friends — should still pass with the Modal change.
- `packages/interview` — existing tests unaffected.

- [ ] **Step 4: Run knip**

```bash
pnpm knip
```

Expected: no new dependency-graph issues. The new `PortalContainer` and `ThemedRegion` files are surfaced via `package.json` exports, so knip will see them as entry points.

- [ ] **Step 5: Build all packages**

```bash
pnpm build
```

Expected: clean build for `@codaco/tailwind-config`, `@codaco/fresco-ui`, and `@codaco/interview`. Verify `dist/` contains `PortalContainer.js`, `PortalContainer.d.ts`, `ThemedRegion.js`, `ThemedRegion.d.ts`.

- [ ] **Step 6: Commit any auto-fixes from lint:fix**

If `pnpm lint:fix` made changes that are not yet committed:

```bash
git status
git add -u
git commit -m "chore: apply auto-fixes from lint:fix"
```

If no changes, skip this step.

- [ ] **Step 7: Final summary**

Confirm all tasks completed:
- `git log --oneline feat/interview-package..HEAD` should show ~16+ commits matching the task pattern.
- Three changesets: `tailwind-config-theme-root-size-sentinel.md`, `fresco-ui-themed-region-portal-container.md`, `interview-1-0-0-alpha-15.md`.
- The old `.changeset/interview-1-0-0-alpha-14.md` is gone.
