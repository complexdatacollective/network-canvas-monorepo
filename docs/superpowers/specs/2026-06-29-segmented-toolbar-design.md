# SegmentedToolbar — design

**Date:** 2026-06-29
**Package:** `@codaco/fresco-ui`
**Status:** Approved, ready for implementation plan

## Summary

A new, reusable, config-driven `SegmentedToolbar` component for `@codaco/fresco-ui`,
intended for use by `@codaco/interview` interface components (and any other fresco-ui
consumer). It renders a compact, pill-shaped toolbar of segments — buttons, toggles,
exclusive toggle groups, and separators — and can optionally float and be repositioned
by the user via a drag handle. Adding and removing segments animates with enter/exit
transitions, and the container animates its size/shape via `motion`'s `layout` prop.

It is founded on Base UI's `Toolbar`, `Toggle`, `Toggle.Group`, and `Separator`
primitives (`@base-ui/react`, already a fresco-ui dependency at 1.5.0), which supply
`role="toolbar"`, roving arrow-key focus, focus looping, orientation, and the accessible
toggle/separator semantics for free.

## Goals

- One component, driven by a declarative `items` array (config-driven), so consumers —
  especially data-driven interview interfaces — describe _what_ the toolbar contains and
  the component owns rendering, keying, and animation.
- Each segment may be a single-click button, an independent on/off toggle, a member of an
  exclusive (single- or multiple-select) group, or a separator.
- Each button/toggle may show a Lucide icon, text, or both.
- Adding/removing segments animates (enter/exit); the container animates its layout.
- Horizontal or vertical orientation.
- Optionally `draggable`: enabling it adds a drag handle and lets the user reposition the
  whole toolbar (self-positioning), with a keyboard equivalent.
- Full accessibility: keyboard-operable throughout, state changes announced to assistive
  technology, tokens-only styling, reduced-motion respected.

## Non-goals

- Not a replacement for the existing domain-specific `DataTable/DataTableToolbar` (table
  filter bar). This is a general-purpose control strip.
- No overflow/“more” menu collapsing in this iteration (YAGNI; can be added later).
- No persistence of drag position to storage by the component itself — persistence is the
  consumer's job via the controlled `position`/`onPositionChange` props.

## Reuse decisions (Step 1 ladder)

- **Compose** Base UI `Toolbar` (`Root`, `Button`, `Separator`), `Toggle`, and
  `Toggle.Group` — they encode the toolbar a11y (roving focus, `role`, `aria-orientation`,
  separators, `aria-pressed`) we must not re-implement.
- **Reuse** existing styling primitives: size/`focusable`/spacing tokens from
  `styles/controlVariants`, `Surface`/`elevation-*` for the pill, the `Tooltip` component
  for icon-only labels, the `spring-*` motion presets, and `useReducedMotion()`.
- **Mirror** the animated-fill toggle idiom already used in
  `form/fields/ToggleButtonGroup.tsx` for the "on" state.
- **Build new** only the `SegmentedToolbar` itself and its small segment-renderer +
  drag-handle internals — there is no existing general-purpose toolbar to extend.

## Public API

Config-driven. Consumers pass an `items` array of discriminated-union segments.

```ts
type SegmentColor =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'warning'
  | 'info'
  | 'destructive'
  | 'success'
  | 'accent';

type SegmentContent = {
  /** Accessible name. Always used as the aria-label; rendered as visible text when showLabel. */
  label: string;
  /** Optional Lucide icon (or any node). Rendered aria-hidden. */
  icon?: React.ReactNode;
  /**
   * Whether to render the label as visible text.
   * Default: false when an icon is present (icon-only + tooltip), true when there is no icon.
   */
  showLabel?: boolean;
  /** Optional semantic colour applied to the segment's icon/text via a `text-*` token. @default 'default' */
  color?: SegmentColor;
};

type ButtonSegment = {
  type: 'button';
  id: string; // stable animation key
  disabled?: boolean;
  onClick: () => void;
} & SegmentContent;

type ToggleSegment = {
  type: 'toggle';
  id: string;
  disabled?: boolean;
  pressed?: boolean; // controlled
  defaultPressed?: boolean; // uncontrolled
  onPressedChange?: (pressed: boolean) => void;
} & SegmentContent;

type GroupSegment = {
  type: 'group';
  id: string;
  mode: 'single' | 'multiple';
  value?: string[]; // controlled (array for both modes, mirroring Base UI)
  defaultValue?: string[]; // uncontrolled
  onValueChange?: (value: string[]) => void;
  options: Array<SegmentContent & { value: string; disabled?: boolean }>;
};

type SeparatorSegment = {
  type: 'separator';
  id: string;
};

type ToolbarSegment =
  | ButtonSegment
  | ToggleSegment
  | GroupSegment
  | SeparatorSegment;

type Position = { x: number; y: number };

type SegmentedToolbarProps = {
  /** Accessible name for the toolbar (role="toolbar" requires a label). */
  label: string;
  items: ToolbarSegment[];
  /** @default 'horizontal' */
  orientation?: 'horizontal' | 'vertical';
  /** Reuses the control size tokens. @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** @default false */
  draggable?: boolean;
  /** Uncontrolled starting position (only meaningful when draggable). */
  defaultPosition?: Position;
  /** Controlled position (only meaningful when draggable). */
  position?: Position;
  onPositionChange?: (pos: Position) => void;
  /** Optional bounds for dragging. */
  dragConstraints?:
    | React.RefObject<Element>
    | { top: number; left: number; right: number; bottom: number };
  /** Accessible name for the drag handle. @default 'Move toolbar' */
  dragHandleLabel?: string;
  className?: string;
};
```

### API notes

- `id` is the stable React key that drives enter/exit animation; it must be unique and
  stable across renders, including for separators.
- Group `value` is typed `string[]` for both modes. This is an honest mirror of Base UI's
  `Toggle.Group`, where `value` is always an array and `mode: 'single'` simply constrains
  it to at most one entry. No type assertions are used to fake a `string` single value.
- `showLabel` default is content-dependent: icon-only by default when an icon exists
  (with a tooltip carrying the label), text by default when there is no icon.

## Structure & visuals

Tokens only — no hardcoded colours, shadows, or font sizes.

- **Container** is `Toolbar.Root` rendered (via its `render` prop) as a `motion.div`:
  - `role="toolbar"`, `aria-label={label}`, `aria-orientation` and roving arrow-key focus
    come from Base UI; `loopFocus` left at its default (`true`).
  - Pill shape (`rounded-full`), a `Surface`-level background, `elevation-*`, token
    padding and `gap`. Flex direction follows `orientation`.
  - `layout` prop so the container resizes smoothly as segments are added/removed and when
    orientation flips.
- **Button / toggle segments** render through Base UI's `render` prop so they retain the
  toolbar's roving focus, styled by a small local cva that reuses size / `focusable` /
  spring tokens. Icon-only when `showLabel` is false; icon **and** text otherwise. The
  toggle "on" state uses the `--selected` token with an animated fill (same idiom as
  `ToggleButtonGroup`), and drives `aria-pressed`.
- **Group segment** is `Toggle.Group` wrapping its option toggles; `mode` selects
  single (radio-like) vs multiple selection.
- **Separator** is `Toolbar.Separator` (orientation-aware).
- **Drag handle** (only when `draggable`) is a focusable grip segment
  (`GripVertical` / `GripHorizontal` to match orientation) at the leading edge.

## Animation

- Each segment is wrapped in a `motion` element with `layout`, inside an
  `AnimatePresence mode="popLayout"`, keyed by `id`.
- Enter/exit is a scale + opacity spring using the `spring-*` presets.
- The container's `layout` animates size/shape changes from add/remove and from
  orientation flips.
- All animation flourishes gate on `useReducedMotion()`. When motion is reduced,
  `AnimatePresence` still mounts/unmounts segments cleanly with no transition.

## Drag (self-positioning)

- Dragging is delegated to motion's native `drag` prop — the component does not
  hand-roll position tracking. The container is a `motion` element with `drag` +
  `useDragControls` and `dragListener={false}`, so only the handle initiates a drag
  (`onPointerDown` on the handle → `controls.start(event)`). `dragConstraints` (object or
  ref) is passed straight to motion, which clamps the drag natively.
- Position lives in two `motion` values (`x`/`y`) bound via `style={{ x, y }}` — the single
  source of truth. They seed from `defaultPosition` (uncontrolled), sync from `position`
  (controlled) via an effect, and are read back on `onDragEnd`/nudge to report the
  clamped position through `onPositionChange`.
- **Keyboard equivalent:** when the handle is focused, arrow keys nudge the toolbar by a
  fixed step (by `.set()`-ing the same `x`/`y` motion values motion's drag uses). Movement
  is reported via an `aria-live` announcement.
- Dragging itself runs regardless of reduced-motion (it is a direct user manipulation);
  only the decorative enter/exit/layout flourishes are gated.

## Accessibility

- `role="toolbar"`, `aria-label={label}`, `aria-orientation` — supplied by Base UI
  `Toolbar.Root`; `label` is a required prop.
- Icon-only segments expose `aria-label` from `label` **and** show a fresco `Tooltip` on
  hover/focus carrying the same label. Decorative icons are `aria-hidden`.
- Toggles expose `aria-pressed`; groups expose the appropriate selection semantics from
  Base UI `Toggle.Group`.
- The drag handle is keyboard-operable (arrow-key reposition) with throttled `aria-live`
  announcements, satisfying the "drag must have a keyboard equivalent + announcement" rule.
- Everything is reachable and operable by keyboard via Base UI roving focus.

## Testing & stories

- **Interactive story:** a single args-driven story exposing every capability via Storybook
  controls (orientation, size, draggable, and a representative mix of button/toggle/group/
  separator segments) so configurability is explorable from one story.
- **Capture story:** a typical floating toolbar resembling the reference (icon-only
  pencil / freeze-toggle / undo in a draggable pill).
- **Vitest unit tests** (fresco-ui `unit` project): roving keyboard navigation, independent
  toggle on/off, group single- and multiple-select exclusivity, add/remove segment
  mount/unmount, separator rendering, drag-handle keyboard reposition + announcement, and
  the reduced-motion path.

## Files

- `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx` — component and its
  exported types, co-located and exported from the same file (as `Button.tsx` does). Small
  internal renderers (segment renderer, drag handle) may live in sibling files if the main
  file grows too large.
- `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.stories.tsx` — stories.
- `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.test.tsx` — unit tests.
- `packages/fresco-ui/package.json` — add the `./SegmentedToolbar` entry to `exports`. No
  barrel/index file.
