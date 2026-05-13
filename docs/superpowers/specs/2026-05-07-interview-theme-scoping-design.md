# Interview theme scoping — design

**Date:** 2026-05-07
**Status:** Approved
**Packages affected:** `@codaco/tailwind-config`, `@codaco/fresco-ui`, `@codaco/interview`

## Problem

The Fresco interview theme currently activates only when `<html>` carries the `data-theme-interview` attribute. Hosts (notably the Next.js dashboard app) cannot apply the attribute declaratively — they have to mutate `document.documentElement` from a client-side `useLayoutEffect`. The reasons the attribute is locked to `<html>`:

1. The interview type scale (`--text-*` in `theme.css`) is expressed in `rem`. `rem` always resolves against `<html>`'s computed font-size, regardless of where `font-size` is set in the document. So the responsive `font-size: 16/18/20px` override only takes effect when applied to `<html>`.
2. The `interview:` and `dashboard:` Tailwind `@custom-variant` selectors are written as `:root[data-theme-interview] &` / `:root:not([data-theme-interview]) &`. The `:root` anchor means any move off `<html>` breaks the negation form silently — `dashboard:` would apply globally even inside an interview region.
3. Base UI portals (used by every dialog, popover, tooltip, dropdown, toast, select, and combobox in `@codaco/fresco-ui`) default to `document.body`. Today they inherit interview CSS variables because `<html>` has the attribute; once the attribute moves to a mid-tree wrapper, portaled content renders outside the themed subtree.

The combination means the current setup does not actually support coexistence — a dashboard region rendered while an interview Shell is mounted gets its `dashboard:` utilities silently disabled. Users perceive this as "interview-only or dashboard-only per page".

## Goals

1. Allow `data-theme-interview` to be applied to any element, not just `<html>`. Eliminate the host-side `useLayoutEffect`.
2. Support genuine coexistence: a default-themed dashboard region and an interview-themed region rendered on the same page, each with its own dialogs/popovers correctly themed.
3. Preserve responsive font scaling (16/18/20px tiers at the viewport breakpoints) without compounding artifacts from nested `text-*` utilities.
4. Preserve user OS text-zoom by keeping the type scale rem-anchored at the document root.

## Non-goals

- Adding new themes beyond `interview` and the implicit default.
- Changing the underlying color tokens, fonts, or visual identity.
- Supporting hosts that wrap themed regions in elements with `transform`, `filter`, `perspective`, or `contain` set — these create new containing blocks for fixed-positioned descendants, which would break modal positioning. Documented as a constraint, not solved.

## Approach

### Sentinel custom property for the type scale

Introduce `--theme-root-size`, an inheritable custom property that the type scale binds to in place of literal `rem`. Each theme declares it with a value appropriate to that theme:

- Default theme: `--theme-root-size: 1rem` on `:root`. The type scale resolves against `<html>` font-size, preserving user OS text-zoom.
- Interview theme: `--theme-root-size: 1rem | 1.125rem | 1.25rem` on `[data-theme-interview]`, switched by media queries at 1279px and 1920px. The type scale resolves to 16/18/20px at default OS scaling, scaled proportionally under user zoom.

The custom property carries a fixed (rem) value. When a child of `[data-theme-interview]` reads `var(--theme-root-size)`, it resolves to the value declared on the closest themed ancestor — not the parent's font-size. This avoids the em-compounding problem (where `text-lg` inside `text-base` would otherwise multiply font-sizes through nesting).

The wrapper also sets `font-size: var(--theme-root-size)` so that `em`-based spacing utilities (`--spacing-base: 0.25em`, already in place) track the same base. Spacing is *intentionally* em-based to compound with local text size; that behavior is preserved.

#### Type scale rewrite (`tooling/tailwind/fresco/theme.css`)

Every `Nrem` becomes `calc(N * var(--theme-root-size))`. Mechanical substitution; the numerical result at the default theme is identical.

```css
@theme static {
  --text-*: initial;

  --text-xs:   clamp(calc(0.64  * var(--theme-root-size)),
                     calc(0.733 * var(--theme-root-size) + 0.283vw),
                     calc(0.79  * var(--theme-root-size)));
  --text-sm:   clamp(calc(0.8   * var(--theme-root-size)),
                     calc(0.844 * var(--theme-root-size) + 0.223vw),
                     calc(0.889 * var(--theme-root-size)));
  --text-base: var(--theme-root-size);
  --text-lg:   clamp(calc(1.125 * var(--theme-root-size)),
                     calc(1.063 * var(--theme-root-size) + 0.313vw),
                     calc(1.25  * var(--theme-root-size)));
  --text-xl:   clamp(calc(1.266 * var(--theme-root-size)),
                     calc(1.141 * var(--theme-root-size) + 0.625vw),
                     calc(1.563 * var(--theme-root-size)));
  --text-2xl:  clamp(calc(1.424 * var(--theme-root-size)),
                     calc(1.174 * var(--theme-root-size) + 1.25vw),
                     calc(1.953 * var(--theme-root-size)));
  --text-3xl:  clamp(calc(1.602 * var(--theme-root-size)),
                     calc(1.143 * var(--theme-root-size) + 2.295vw),
                     calc(2.441 * var(--theme-root-size)));
  --text-4xl:  clamp(calc(1.802 * var(--theme-root-size)),
                     calc(1.052 * var(--theme-root-size) + 3.75vw),
                     calc(3.052 * var(--theme-root-size)));
  /* line-height and letter-spacing values are unchanged (unitless or em) */
}
```

#### Default theme declares the sentinel (`themes/default.css`)

```css
@layer theme {
  :root {
    --theme-root-size: 1rem;
    /* …existing variables unchanged… */
  }
}
```

#### Interview theme drops `:root` and declares responsive sentinels (`themes/interview.css`)

```css
@layer base {
  [data-theme-interview] {
    --theme-root-size: 1rem;
    font-size: var(--theme-root-size);

    @media (width >= 1279px) { --theme-root-size: 1.125rem; }
    @media (width >= 1920px) { --theme-root-size: 1.25rem; }
  }
}

@layer theme {
  [data-theme-interview] {
    --heading-font: 'Nunito Variable', sans-serif;
    --body-font: 'Nunito Variable', sans-serif;
    /* …all other interview-theme variables unchanged except for the selector… */
  }
}
```

Both `:root[data-theme-interview]` blocks become `[data-theme-interview]`. The responsive font-size override block in `@layer base` is preserved; only the selector and the unit change.

### Tailwind variant rework (`utilities.css`)

```css
@custom-variant interview ([data-theme-interview] &);
@custom-variant dashboard (&:not([data-theme-interview] *):not([data-theme-interview]));
```

`interview:` matches descendants of an element with the attribute (not the wrapper itself; in practice the wrapper is set up by `<ThemedRegion>` and utilities are written on inner elements). `dashboard:` matches an element only when it is neither inside an interview region nor itself the wrapper. The complex `:not()` form is Baseline 2023 (Chrome 88+, Firefox 84+, Safari 16+).

The duplicate `@custom-variant` declarations in `fresco.css:49-50` are removed; `fresco.css` already imports `utilities.css`, so the single declaration there suffices.

### Portal-container threading

The user-facing API is a single component, `<ThemedRegion>`, that bundles the theme attribute and a `PortalContainerProvider`. Portal-using components in fresco-ui read the provided container via React context and pass it to Base UI's `Portal` `container` prop, falling back to `null` (Base UI default = `document.body`) when no provider is in the tree.

#### `PortalContainerContext` (`packages/fresco-ui/src/PortalContainer.tsx` — new file)

```tsx
"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

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

The provider renders an empty sibling `<div>` after children — that node is the portal target. Multiple Base UI portals append into the same node. Because the node lives inside the themed wrapper, portaled content inherits CSS variables. Because no transform/filter/perspective/contain is applied between this node and the viewport (subject to the host constraint documented below), `position: fixed` resolves against the viewport.

#### `<ThemedRegion>` (`packages/fresco-ui/src/ThemedRegion.tsx` — new file)

```tsx
"use client";
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { PortalContainerProvider } from "./PortalContainer";
import { cx } from "./utils/cva";

type ThemedRegionProps = {
  theme: "interview";
  children: ReactNode;
  className?: string;
  render?: ReactElement;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children" | "className">;

export function ThemedRegion({ theme, render, children, className, ...rest }: ThemedRegionProps) {
  const themeAttr = theme === "interview" ? { "data-theme-interview": "" } : {};
  const body = <PortalContainerProvider>{children}</PortalContainerProvider>;

  if (render && isValidElement(render)) {
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

The `theme` prop is a discriminated union, ready to extend if more named themes are added. The `render` prop follows fresco-ui's existing Base-UI-style polymorphism convention (`<Toast.Description render={<Paragraph .../>} />`) so the Shell can render the wrapper as `<main>` instead of the default `<div>`.

#### Eight Portal sites updated to read the container

| File | Component | Portal type |
|---|---|---|
| `packages/fresco-ui/src/Modal/Modal.tsx:35` | `Modal` | `BaseDialog.Portal` |
| `packages/fresco-ui/src/Popover.tsx:157` | `PopoverContent` | `BasePopover.Portal` |
| `packages/fresco-ui/src/Tooltip.tsx:25` | `Tooltip` | `BaseTooltip.Portal` |
| `packages/fresco-ui/src/DropdownMenu.tsx:77, 103` | `DropdownMenuContent`, `DropdownSubMenuContent` | `Menu.Portal` (×2) |
| `packages/fresco-ui/src/Toast.tsx:155` | `Toaster` | `Toast.Portal` |
| `packages/fresco-ui/src/form/fields/Select/Styled.tsx:59` | `Styled` | `Select.Portal` |
| `packages/fresco-ui/src/form/fields/Combobox/Combobox.tsx:143` | `Combobox` | `Combobox.Portal` |
| `packages/interview/src/toast/InterviewToast.tsx:104` | `InterviewToastViewport` | `Toast.Portal` |

Pattern at every site:

```tsx
const portalContainer = usePortalContainer();
return (
  <BaseDialog.Portal container={portalContainer ?? undefined} keepMounted>
    {/* …existing children… */}
  </BaseDialog.Portal>
);
```

Hosts that don't render a `PortalContainerProvider` see no behavior change: `usePortalContainer()` returns `null`, `container ?? undefined` resolves to `undefined`, and Base UI portals fall back to `document.body`.

### Consumer updates

#### `packages/interview/src/Shell.tsx`

Replace the inline `<main data-theme-interview>` with `<ThemedRegion render={<main … />}>`. The DOM output is identical; `data-theme-interview` is now declarative and the `PortalContainerProvider` wraps interview content automatically.

```tsx
import { ThemedRegion } from "@codaco/fresco-ui/ThemedRegion";

function Interview() {
  // …existing hooks unchanged…
  return (
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
        <InterviewToastProvider …>
          <AnimatePresence …>{/* unchanged */}</AnimatePresence>
        </InterviewToastProvider>
      </StageMetadataProvider>
      <Navigation … />
    </ThemedRegion>
  );
}
```

#### `packages/fresco-ui/.storybook/theme-switcher.tsx`

Drop the `useLayoutEffect`, the `INTERVIEW_ATTR` constant, and the html-attribute mutation. Render the theme attribute on the wrapper div via `<ThemedRegion>`:

```tsx
function ThemeWrapper({ selectedTheme, children }: { selectedTheme: ThemeKey; children: React.ReactNode }) {
  setStoredTheme(selectedTheme);
  if (selectedTheme === "interview") {
    return (
      <ThemedRegion theme="interview" className="bg-background text-text publish-colors scheme-dark">
        {children}
      </ThemedRegion>
    );
  }
  return <div className="bg-background text-text publish-colors">{children}</div>;
}
```

#### `packages/interview/.storybook/preview.tsx`

Delete the `InterviewThemeRoot` component. Replace the decorator body with:

```tsx
decorators: [
  (Story) => (
    <StrictMode>
      <ThemedRegion theme="interview" className="root h-full">
        <Providers disableAnimations={…}>
          <Story />
        </Providers>
      </ThemedRegion>
    </StrictMode>
  ),
],
```

The `useLayoutEffect` import is removed.

#### `packages/interview/e2e/fixtures/interview-fixture.ts`

No change. The locator `main[data-theme-interview]` continues to match (Shell still renders the attribute on `<main>`).

#### Documentation updates

- `packages/interview/README.md` — delete the "Theming & DOM scope" section that documents the host-side `useLayoutEffect` requirement (lines ~383–417). Replace with a brief paragraph: *"`Shell` renders `<main data-theme-interview>` and provides a portal container to descendants automatically. Hosts that render their own theme-scoped UI outside Shell can use `<ThemedRegion theme=\"interview\">` from `@codaco/fresco-ui`."*
- `packages/fresco-ui/README.md` — update the line referencing `data-theme-interview` to mention scoped placement; document the `<ThemedRegion>` and `<PortalContainerProvider>` exports.
- `tooling/tailwind/README.md:33` — replace the description of `<html>`-level activation with the scoped-attribute description.

### Removed code

- `packages/interview/.storybook/preview.tsx` — `InterviewThemeRoot` component and its `useLayoutEffect` import.
- `packages/fresco-ui/.storybook/theme-switcher.tsx` — the `useLayoutEffect` block and `INTERVIEW_ATTR` constant.
- `packages/interview/README.md` — the host-side `useLayoutEffect` snippet (lines ~395–414).
- `tooling/tailwind/fresco/fresco.css:49-50` — duplicate `@custom-variant` declarations (kept in `utilities.css` only).

## Changesets

- **`@codaco/tailwind-config`** — minor. *"Type scale rewritten to use a `--theme-root-size` sentinel custom property; interview theme drops the `:root` requirement and binds to `[data-theme-interview]` on any element. Responsive font-sizes now also honor user OS text-zoom (rem-based instead of px-pegged). `interview:` and `dashboard:` `@custom-variant` selectors updated to support nested coexistence."*
- **`@codaco/fresco-ui`** — minor. *"New `<ThemedRegion>` component and `<PortalContainerProvider>` for declarative theme scoping. All Portal-using components (Modal, Popover, Tooltip, DropdownMenu, Toast, Select, Combobox) now thread a portal container through context, allowing themed dialogs/popovers to inherit the theme of the closest themed ancestor instead of `document.body`."*
- **`@codaco/interview`** — alpha-15. *"Shell now scopes the interview theme purely declaratively via `<ThemedRegion>`. Removed the host-side `useLayoutEffect` requirement that previously toggled `data-theme-interview` on `<html>`. Hosts mount Shell anywhere in the tree and the theme + portal containment travel with it."*

## Testing strategy

1. **Unit / component (Vitest + jsdom)** — add tests for `<ThemedRegion>` (renders the attribute, wraps children with `PortalContainerProvider`, supports `render` prop polymorphism) and `<PortalContainerProvider>` (provides a DOM node via context, returns `null` outside a provider).
2. **Visual regression (Chromatic)** — re-run on the change PR. Expected diff: zero pixels at default OS scaling, since `--theme-root-size: 1rem` resolves to 16px in CI just as the previous `font-size: 16px` did. The clamp formulas are arithmetically identical.
3. **E2E (Playwright)** — existing `main[data-theme-interview]` locator continues to match; per-stage visual snapshots in `packages/interview/e2e/visual-snapshots/{chromium,firefox,webkit}/` should be byte-identical. Any pixel diff is a regression to investigate, not a snapshot to regenerate.
4. **Manual coexistence smoke** — render a default-themed region beside an interview region in a host app; open dialogs in each; confirm dialogs inherit the correct theme.

## Risks & constraints

- **Containing-block constraint**: hosts wrapping themed regions must not apply `transform`, `filter`, `perspective`, or `contain` on the wrapping element or any ancestor between it and `<body>`. Doing so creates a new containing block for fixed-positioned descendants, breaking modal/popover positioning. Documented in `fresco-ui/README.md`.
- **Selector support floor**: the `dashboard:` variant uses `:not()` with descendant combinators, requiring Chrome 88+ / Firefox 84+ / Safari 16+ (Baseline 2023). Acceptable for the project's browser support targets.
- **Breaking change for direct attribute consumers**: any host that currently sets `data-theme-interview` on `<html>` and expects `:root[data-theme-interview]` selectors will need to update. Acceptable because `@codaco/interview` is in alpha (`1.0.0-alpha.14`) and the documented Shell pattern is the only supported integration path.
