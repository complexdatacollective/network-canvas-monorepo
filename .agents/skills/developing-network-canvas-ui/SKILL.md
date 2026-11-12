---
name: developing-network-canvas-ui
description: 'Use before implementing a user-facing Network Canvas interface or interaction: React components, pages, dialogs, forms, interview stages, Fresco UI, styling, responsive behavior, accessibility, motion, or user-facing copy. Also use for non-UI code that directly changes user-visible output. Do not use for schemas, migrations, workers, backend logic, CI or release tooling, dependencies, tests, documentation, or read-only work unless it changes a user-facing surface.'
---

# Developing Network Canvas UI

## Overview

This skill guards against two UI failure modes: **rebuilding an interface pattern that already exists** and **shipping a user-facing change that ignores the project's accessibility, internationalisation, or participant-experience priorities**.

**Core principle:** reuse existing interface patterns before building new ones, and treat accessibility, internationalisation, and participant experience as design factors from the start.

## When to use

Use this skill once per UI implementation task, immediately before the first code edit, when changing:

- a React component, page, dialog, form, navigation element, or interview stage;
- a public component or interaction pattern in `@codaco/fresco-ui`;
- styling, responsive behaviour, theming, animation, drag, or other interaction behaviour;
- keyboard or screen-reader behaviour; or
- participant-facing or researcher-facing copy, including user-visible output produced outside a React component.

Participant-facing UI is the `@codaco/interview` runtime as hosted by Interviewer, Interviewer Classic, Architect previews, and Fresco. Researcher-facing UI includes Architect, Architect Classic, Interviewer administration, Fresco administration, the Background Creator, and the project websites.

Do not use this skill for schema or migration work, workers, backend logic, exporters, network queries, CI or release tooling, dependency changes, test-only changes, or documentation unless that work directly changes what a user sees, hears, or operates. Do not use it for read-only questions, status checks, reviews, planning, research, or Git inspection. Do not re-invoke it merely because the user sent a follow-up within the same implementation task.

Read the repository root `AGENTS.md` at the start of Network Canvas repository tasks for the current architecture, commands, code standards, and general reuse rule.

## Reuse existing UI before building

Walk this ladder before writing a new component or interaction:

1. **Reuse** an existing component or interface pattern as-is.
2. **Compose** existing pieces into the required UI.
3. **Extend** something close with a prop or variant.
4. **Build new** only when the existing surface cannot express the requirement.

If you build new, state in one line what you checked and why nothing fit.

Start with `@codaco/fresco-ui`; its components already encode the project's accessibility, theming, and motion conventions.

- The authoritative component list is `packages/fresco-ui/package.json` → `exports`.
- Co-located `*.stories.tsx` files document behaviour, composition, and props.
- Import per-file subpaths rather than barrels: `import Button from '@codaco/fresco-ui/Button'`.

Common starting points:

| Need                   | Reach for                                                                    |
| ---------------------- | ---------------------------------------------------------------------------- |
| Action / submit        | `Button`, `form/SubmitButton`, `CloseButton`, `IconButton`                   |
| Confirm / alert dialog | `useDialog().confirm()`                                                      |
| Generic overlay        | `Modal`, `Popover`, `Tooltip`, `DropdownMenu`                                |
| Any form               | `Form` + `form/fields/*`                                                     |
| Status / feedback      | `Alert`, `Toast`, `Spinner`, `Skeleton`, `ProgressBar`, `Badge`              |
| Text / layout          | `typography/Heading`, `typography/Paragraph`, `layout/Surface`, `ScrollArea` |
| Lists / tables         | `collection/*`, `Table`, `DataTable`                                         |
| Markdown / rich text   | `RenderMarkdown`, `RichTextRenderer`                                         |
| Network entities       | `Node`                                                                       |

Base a new interactive component on the matching Base UI primitive rather than raw elements with hand-written interaction semantics.

### Adding a shared Fresco UI component

When adding a new public `@codaco/fresco-ui` component or subpath, read [the shared-component guidance](references/shared-components.md) before editing. Ordinary application UI changes do not need that reference.

## Accessibility

The standard is WCAG 2.2 AA. `docs/accessibility.md` states which apps it covers, the rules every researcher-facing screen follows (keyboard parity, reorderable lists, data tables, validation problems, lock state, chart equivalents), and what the automated checks do and do not prove.

Every interactive component must be fully keyboard operable and expose state changes to assistive technology.

- **Use Base UI primitives.** Existing wrappers such as `Modal`, `Popover`, `Tooltip`, `DropdownMenu`, and `DatePicker` provide focus management, Escape handling, roving focus, and ARIA semantics.
- **Provide complete keyboard operation.** Every action must be reachable and triggerable without a pointer. Composite widgets need the expected arrow-key behaviour; overlays need Escape dismissal; canvas drag needs a keyboard equivalent.
- **Announce dynamic state.** Use an `aria-live` region for drag state, prompt rotation, result counts, asynchronous outcomes, and validation. Throttle frequently changing values to meaningful thresholds.
- **Show visible focus.** Use the `focusable` utility class for the shared `:focus-visible` treatment.
- **Use form semantics already provided.** Let `Form` and `Field` wire `aria-invalid` and `aria-describedby`; use `focusFirstError` after failed submission.
- **Hide decorative icons.** Decorative SVGs use `aria-hidden`; icon-only buttons need an accessible name.

Useful exemplars include `packages/fresco-ui/src/dnd/useAccessibilityAnnouncements.ts`, `packages/interview/src/components/Prompts/Prompts.tsx`, and `packages/interview/src/canvas/useCanvasDrag.ts`.

## Internationalisation and participant-facing copy

- Keep whole, externalisable strings. Do not concatenate sentence fragments or rely on English grammar interpolation.
- Leave room for text expansion and right-to-left layouts.
- Write participant copy in a plain, calm, respectful voice. Use second-person imperatives for actions and explain consequences without threats.
- Never expose internal vocabulary such as `node`, `edge`, `ego`, `alter`, `stage`, `prompt`, or `sociogram` to participants. Use a protocol-supplied label or a plain term such as “person” or “connection.”
- Prefer researcher-authored protocol content for study-specific prompts and instructions. Hardcode only generic UI chrome, errors, and empty states, keeping them short and actionable.
- Render participant markdown through `RenderMarkdown`; never use `dangerouslySetInnerHTML`.

Tone rules apply to participant-facing surfaces. Accessibility and internationalisation apply to all UI.

### Right-to-left layouts

Arabic is a supported language, so every layout is read in both directions. Write it against the reading direction, not against a side of the screen.

- **Use logical utilities.** `ms-*`/`me-*`, `ps-*`/`pe-*`, `start-*`/`end-*`, `border-s`/`border-e`, `rounded-s`/`rounded-e`, `text-start`/`text-end`, `float-start`. In every app and package shown right to left the `tailwindcss/enforce-logical` lint rule rewrites the physical spellings on save.
- **Keep a physical side only when a physical side is meant**: an element placed from measured or pointer coordinates, one of a mirrored pair, or a value Base UI reports from the left. Say which in an `oxlint-disable-next-line tailwindcss/enforce-logical -- reason` comment (or the `direction/*` rule's name). The `direction/*` rules live in `tooling/oxlint/plugins/direction.mjs`; a workspace shown right to left extends `tooling/oxlint/direction.json`. `left-1/2` with `-translate-x-1/2` centres in either direction and is allowed as it stands.
- **Transforms and `background-position` have no logical form.** Flip them with the `rtl:` variant, or with a custom property the `rtl:` variant changes when Motion animates the value (see `NavDrawer`).
- **Icons that point along the reading order turn round** (`rtl:-scale-x-100` on a "next" chevron, or fresco-ui's `inlineIconClass` for an icon a component was handed). Icons that depict a thing do not. `direction/inline-arrow-turns` reports a lucide arrow or chevron drawn without the turn, or passed on as a component.
- **Text someone typed takes its own direction and stays on the interface's side**: names of people, protocols, studies, stages and teams, emails, identifiers get `dir="auto"` and `text-match-parent`. `direction/typed-text-matches-parent` reports `dir="auto"` without the class; nothing can report a typed value with no `dir` at all.
- **Popups open at the start or end of the line**: `side="inline-start"`/`"inline-end"` on Tooltip, Popover and DropdownMenu content (`direction/logical-popup-side`).
- **Base UI number formatting takes the app's language**: `Progress`, `Meter`, `NumberField` and a `Slider` with `format` get `locale={intl.locale}`, or a server render and the browser disagree (`direction/base-ui-number-locale`).
- **Arrow keys follow the layout.** Base UI components do this from the direction context. A hand-written key handler reads the element's own direction (`isRightToLeft` in `utils/horizontalOverflow`) or, inside an interview, Base UI's `useDirection()`: the key pointing towards the end of a row moves forward. Where the items are placed on physical sides (the family tree's add buttons), wrap the Base UI component in `<DirectionProvider direction="ltr">` so its keys match where they are drawn.
- **Pointer geometry is measured from the start edge**, which is the right in a right-to-left language.
- **Content that is left-to-right in every language stays so**: codes, numbers in boxes, coordinates on a canvas. Set `dir="ltr"` on it.
- **A panel leaves by the edge it sits against.** A drawer on the end edge takes `swipeDirection` from the direction and flips its entry and exit transforms with `rtl:` (see `ComposerDrawer`).
- **Check it.** Storybook's Direction toolbar mirrors any story, and the "Pseudo right-to-left" language does the same in the development build of Architect, Interviewer and Studio. A story that pins `globals: { appDirection: 'rtl' }` can assert the behaviour in its `play` function. Every story in every Storybook is also drawn afresh in both directions after its play function and fails unless each box sits as far from the right edge as it sat from the left, and each arrow that points along the line turns (`mirrorCheck` in `tooling/storybook/src/i18n.tsx`). Content whose `dir` is fixed (a code) is left alone; a drawing placed by coordinates carries `data-direction-exempt`; a story that is not a layout in the reading direction takes the `!mirror` tag with a comment saying why.

## Visual style

- **Use design tokens.** Use semantic Tailwind utilities backed by CSS variables (`bg-primary`, `text-text`, surfaces, input and selection colours, and data-visualisation palettes). Do not add hex or `rgb()` values.
- **Use shared elevation.** Choose `elevation-low`, `elevation-medium`, or `elevation-high`; do not write custom shadows.
- **Use the responsive type and spacing scales.** Do not add raw pixel font sizes.
- **Respect themed regions.** The interview theme is dark-only and scoped by `ThemedRegion`; never assume a light background.
- **Do not clip content.** Avoid fixed heights or widths that cut off labels, translated text, or controls.

## Interaction and motion

- Animate with `motion/react` and the shared `MotionSpring` presets instead of ad hoc durations and easing.
- Respect reduced motion. Use `useSafeAnimate` for JavaScript-driven animation and gate optional flourishes with `usePrefersReducedMotion()` from `@codaco/fresco-ui/reducedMotion` (never Motion's `useReducedMotion`, which ignores `AnimationProvider`'s `reducedMotion` setting). The `motion-reduce:` / `motion-safe:` variants follow the same setting.
- Give drag interactions an approximately 5px threshold, set `touchAction: 'none'` where appropriate, and provide generous hit targets.
- Base orientation-dependent layout on aspect ratio rather than assuming a square viewport.

## Common mistakes

| Mistake                                                | Do instead                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Writing a component without checking Fresco UI         | Search `package.json` exports and the closest stories first.                       |
| Hand-rolling a confirm or alert modal                  | Use `useDialog().confirm()`.                                                       |
| Building a widget from raw elements and pointer events | Start from the matching Base UI primitive and provide complete keyboard semantics. |
| Hardcoding colours, shadows, or pixel font sizes       | Use token-backed utilities, shared elevation, and the responsive type scale.       |
| Showing internal vocabulary to participants            | Use the protocol label or a plain participant-facing term.                         |
| Changing state silently                                | Add a suitably throttled screen-reader announcement.                               |
| Concatenating message fragments                        | Keep whole, externalisable strings.                                                |
| Sizing a shared component with viewport breakpoints    | Use container queries; a shared component knows its container, not the viewport.   |

## Quick reference

- **Components:** `packages/fresco-ui/package.json` exports and co-located stories.
- **Tokens:** `Colors.stories.tsx`, `Elevation.stories.tsx`, `MotionSpring.stories.tsx`, and `tooling/tailwind/fresco/`.
- **Participant copy and accessibility:** `packages/interview/src/interfaces/FinishSession/FinishSession.tsx`, `components/Navigation.tsx`, `components/Prompts/Prompts.tsx`, and `canvas/useCanvasDrag.ts`.
