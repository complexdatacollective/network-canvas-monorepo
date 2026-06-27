---
name: developing-in-network-canvas
description: Use when developing any feature, fix, or change anywhere in the Network Canvas monorepo — before writing code — and especially when building or changing any user-facing UI (component, page, interview stage, dialog, form, styling). Applies whether the work is UI, a package, a schema, a worker, or a utility. Keywords: feature development, monorepo, reuse existing code, DRY, existing pattern, package, utility, fresco-ui, Base UI, accessibility, a11y, keyboard, screen reader, aria-live, internationalisation, i18n, participant, tone, voice, design tokens, theme, motion, reduced-motion.
---

# Developing in Network Canvas

## Overview

Two failure modes this guards against: **rebuilding things that already exist**, and **shipping features that ignore the project's priorities**. Both are cheapest to prevent before code is written.

**Core principle:** reuse what's already there before building new, and treat accessibility, internationalisation, and participant experience as design factors from the start — never retrofits.

## When to use

Any feature, fix, or change in the monorepo, before writing code. **Steps 1 and 2 apply to everything** — packages, schemas, workers, utilities, UI. The **Building UI** section adds depth for anything that renders an interface.

## Step 1 — Reuse before you build (every feature)

Walk the ladder before writing new code of any kind — a component, a utility, a validator, an exporter:

1. **Reuse** an existing package/module/component as-is.
2. **Compose** existing pieces into the new thing.
3. **Extend** something close (add a param/prop/variant).
4. **Build new** only as a last resort — and put reusable code where the next feature will find it (the right shared package), not inline.

If you build new, state in one line _what you checked and why nothing fit_. "Faster to write inline," "close but not exact," and "didn't want to touch shared code" are how duplication gets created — they are not reasons.

**Find what exists first:**

- Code lives under `packages/*` and `apps/*` (see CLAUDE.md's architecture map). Shared types/consts → `@codaco/shared-consts`; protocol schemas & migrations → `@codaco/protocol-validation`; network generation → `@codaco/protocol-utilities`; UI → `@codaco/fresco-ui`.
- Search for an existing helper or pattern before adding one, and mirror the conventions of the closest existing code.

## Step 2 — Project priorities are design factors (every feature)

Weigh these in any feature, even non-UI — an exporter emitting user-facing text, an error a participant will see, a date format:

- **Accessibility** — anything a person operates must be usable by keyboard and expose its state to assistive technology. (UI specifics below.)
- **Internationalisation** — there is no i18n layer yet, but design so copy _can_ be localised: keep whole, externalisable strings (no fragment concatenation, no grammar interpolation), and leave room for text expansion and right-to-left. Treat "how would this localise?" as a real design question.
- **Participant experience** — if a participant will read or use it, apply the tone rules below and never leak internal vocabulary (`node`, `edge`, `ego`, `alter`, `stage`, `prompt`, `sociogram`) to them.

## Building UI

Everything below applies when the work renders an interface. Participant-facing = the `@codaco/interview` runtime (`packages/interview`) in `apps/interviewer`, `apps/interviewer-v8`, Fresco. Researcher-facing = Architect (`apps/architect`, `apps/architect-web`). Tone is participant-facing only; the rest applies to all UI.

### Reuse fresco-ui first

Apply the Step 1 ladder to components: new UI is **assembled from `@codaco/fresco-ui`**, not hand-rolled — its components already encode the accessibility, theming, and motion conventions below.

**Discover the surface (don't trust this doc's list — it drifts):**

- Authoritative component list: `packages/fresco-ui/package.json` → `exports` (one subpath per component).
- Behaviour/props: the component's co-located `*.stories.tsx`.
- Imports are per-file subpaths, no barrels: `import Button from '@codaco/fresco-ui/Button'`, `import useDialog from '@codaco/fresco-ui/dialogs/useDialog'`.

**Common starting points** (verify the import path in `exports`; the full set is larger):

| Need                   | Reach for                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| Action / submit        | `Button`, `form/SubmitButton`, `CloseButton`, `IconButton`                                                     |
| Confirm / alert dialog | `useDialog().confirm()` (imperative, promise-based) — don't render a bespoke modal                             |
| Generic overlay        | `Modal` / `Modal/ModalPopup`, `Popover`, `Tooltip`, `DropdownMenu`                                             |
| Any form               | `Form` + `form/fields/*` (Input, TextArea, Checkbox, RadioGroup, Select, Combobox, DatePicker, LikertScale, …) |
| Status / feedback      | `Alert`, `Toast`, `Spinner`, `Skeleton`, `ProgressBar`, `Badge`                                                |
| Text / layout          | `typography/Heading`, `typography/Paragraph`, `layout/Surface`, `ScrollArea`                                   |
| Lists / tables         | `collection/*` (virtualized, searchable, DnD), `Table`, `DataTable`                                            |
| Markdown / rich text   | `RenderMarkdown`, `RichTextRenderer`                                                                           |
| Network entities       | `Node`                                                                                                         |

If you must build a new component, it is **founded on a Base-UI primitive** and mirrors the closest fresco-ui component's patterns (prop shape, variants, token usage) — never raw `div`s + click handlers.

### Accessibility

Two hard requirements for every interactive component, no exceptions: it is **fully keyboard operable**, and it **announces state changes to screen readers**. The library makes both the path of least resistance — use it rather than reinventing.

- **Build on Base-UI primitives.** `Modal`, `Popover`, `Tooltip`, `DropdownMenu`, `DatePicker` wrap Base-UI, which provides focus traps, Escape handling, roving focus, and ARIA roles for free. A net-new interactive component must be founded on the matching Base-UI primitive — never raw `div`s with click handlers, which are invisible to keyboard and screen-reader users.
- **Fully keyboard operable.** Every action reachable and triggerable without a mouse: logical tab order, Enter/Space to activate, Escape to dismiss overlays, arrow keys for composite widgets (lists, menus, canvas). A pointer-only interaction is a bug. Example: canvas drag has arrow-key nudge + Enter/Space (`interview/src/canvas/useCanvasDrag.ts`).
- **Screen-reader announcements for anything that changes without a reload** — drag state, prompt rotation, counts, async results, validation. Use an `aria-live` region (`fresco-ui/src/dnd/useAccessibilityAnnouncements.ts`, `interview/src/components/Prompts/Prompts.tsx`). A silent state change does not exist for a screen-reader user. But throttle frequently-updating values (timers, counters, progress) to meaningful thresholds — a live region that fires every tick floods the screen reader.
- **Visible focus:** interactive elements get the `focusable` utility class for a consistent `:focus-visible` ring (`fresco-ui/src/Button.tsx`).
- **Forms:** let `Form`/`Field` wire `aria-invalid` and `aria-describedby` (`form/utils/getInputState.ts`); use `focusFirstError` on submit failure.
- **Decorative SVGs/icons:** `aria-hidden`. Icon-only buttons: `aria-label`.

### Participant-facing tone & copy

- **Voice:** plain, calm, respectful; assume an adult participant. Second-person imperative for actions ("Finish interview", "Add a person"); third-person for status ("Your responses cannot be changed").
- **Consequences, not threats:** "Your responses cannot be changed after you finish the interview" — not "This is final and permanent."
- **Never leak internal vocabulary** to participants (see Step 2). Use the protocol-supplied label or a plain word ("person", "connection"). Stage labels are deliberately hidden from participants (#663).
- **Most participant text comes from the protocol**, authored by the researcher. Hardcode UI chrome (nav, errors, empty states) only; keep it short and actionable ("Nothing matched your search term.", "External data could not be loaded." — never "404"/"ENOENT").
- **Rich text:** render participant markdown through `RenderMarkdown` (prompts allow `em/strong/ul/ol/li` only; Information stages allow headings). Never `dangerouslySetInnerHTML`.

### Visual style

- **Style with tokens, never hardcoded values.** Colours are CSS variables: semantic (`--color-primary` + `--color-primary-contrast`, `--color-destructive`, …), surfaces (`--surface`, `--surface-1..3`), inputs/selection (`--input`, `--selected`), data viz (`--node-1..8`, `--edge-1..10`, `--cat-*`, `--ord-*`). Use the Tailwind utilities that map to them (`bg-primary`, `text-text`) — no hex, no `rgb()`.
- **Elevation:** `elevation-low | medium | high` (shadows auto-tint to the parent surface via `--published-bg`). Don't write custom `box-shadow`.
- **Type & spacing:** the responsive `text-*` scale (fluid via `clamp`) and the spacing base unit (`p-*`, `gap-*`); radius via `rounded-*`. No raw `px` font sizes.
- **The interview theme is dark-only**, scoped by `ThemedRegion` (`data-theme-interview`, `scheme-dark`). Don't assume a light background; read colours from the themed region.

### Interaction & motion

- **Animate with `motion/react` + the spring presets.** Use `MotionSpring` tokens (`spring-short | medium | long`) / Tailwind spring utilities rather than ad-hoc `duration`/`ease`.
- **Always respect reduced motion.** The global media query zeroes durations; for JS-driven animation use `useSafeAnimate`, and gate optional flourishes on `useReducedMotion()` (`interview/src/components/Navigation.tsx`).
- **Touch/drag:** ~5px drag threshold to distinguish tap from drag, `touchAction: 'none'` on draggable canvases, generous hit targets (sizes scale with the type-scale). Orientation-dependent layout keys off aspect ratio, not a hard 1:1 (`interview/src/Shell.tsx`).

## Common mistakes

| Mistake                                                        | Do instead                                                                             |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Writing a new util/component without checking what exists      | Walk the reuse ladder; search the relevant `packages/*` first.                         |
| Wrapping `Field`/`Paragraph` in `flex-col gap-*` / `space-y-*` | They carry their own bottom margin — you'll double the spacing. Let them flow.         |
| Hand-rolling a confirm/alert modal                             | `useDialog().confirm({ title, description, confirmLabel, onConfirm })`.                |
| Building a widget from raw `div`s + `onClick`                  | Found it on the matching Base-UI primitive — keyboard handling and ARIA come for free. |
| Hardcoded colours / shadows / font px                          | Token utilities (`bg-*`, `text-*`, `elevation-*`, `text-lg`).                          |
| Showing "node"/"alter"/"stage" to participants                 | Protocol label or plain word.                                                          |
| Drag with no keyboard equivalent                               | Add arrow-key/Enter-Space handling + an `aria-live` announcement.                      |
| Concatenating sentence fragments for a message                 | Keep whole, externalisable strings so it can localise later.                           |

## Quick reference

- **Packages map:** CLAUDE.md "Architecture Overview" — what each `packages/*` and `apps/*` is for.
- **Component list:** `packages/fresco-ui/package.json` `exports` + co-located `*.stories.tsx`.
- **Tokens:** `Colors.stories.tsx`, `Elevation.stories.tsx`, `MotionSpring.stories.tsx`; theme files under `tooling/tailwind/fresco/`.
- **Participant copy & a11y exemplars:** `packages/interview/src/interfaces/FinishSession.tsx`, `components/Navigation.tsx`, `components/Prompts/Prompts.tsx`, `canvas/useCanvasDrag.ts`.
