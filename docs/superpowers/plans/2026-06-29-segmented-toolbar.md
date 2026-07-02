# SegmentedToolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable, config-driven `SegmentedToolbar` component to `@codaco/fresco-ui` — a pill-shaped strip of button/toggle/group/separator segments, optionally draggable, with enter/exit + layout animation and full keyboard a11y.

**Architecture:** A single component file driven by an `items` discriminated union. An outer `motion.div` is the presentational pill (carries `layout` and, when `draggable`, motion drag + a keyboard-movable handle). Inside it, Base UI `Toolbar.Root` provides `role="toolbar"` + roving arrow-key focus over the segments. Each segment is rendered through Base UI primitives (`Toolbar.Button`, `Toggle`, `ToggleGroup`, `Toolbar.Separator`) and wrapped in a keyed `motion.div` inside `AnimatePresence` so add/remove animates. Pressed state is styled with the `--selected` token via Base UI's `data-pressed` attribute (no extra React state). All flourishes gate on `useReducedMotion()`.

**Tech Stack:** React 19, TypeScript (strict, no `any`), `@base-ui/react` 1.5.0 (`toolbar`, `toggle`, `toggle-group`), `motion/react`, `cva` (via `utils/cva`), Tailwind tokens, Vitest + Testing Library (`unit` project), Storybook.

## Global Constraints

- **No `any` types; no type assertions** to bypass typing. Group `value` is `string[]` for both modes (honest mirror of Base UI `ToggleGroup`, whose `value` is `readonly Value[]`).
- **No barrel/index files.** Export the component by adding a `./SegmentedToolbar` subpath to `packages/fresco-ui/package.json` `exports`.
- **Tokens only** — no hardcoded colours/shadows/font px. Use `bg-surface-1`, `text-surface-1-contrast`, `elevation-medium`, `var(--selected)`/`var(--selected-contrast)`, `spring-medium`, the `text-sm/base/lg` scale, `focusable`.
- **A11y is non-negotiable:** `role="toolbar"` + required `label` (→ `aria-label`); icon-only segments get `aria-label` **and** a `Tooltip`; toggles expose `aria-pressed` (Base UI); the drag handle is keyboard-operable (arrow-key nudge) with a throttled `aria-live` announcement; decorative icons `aria-hidden`.
- **Respect reduced motion** via `useReducedMotion()`; dragging itself is exempt (direct user manipulation), only enter/exit/layout flourishes are gated.
- **Imports are per-file subpaths** within fresco-ui (e.g. `import { cva, cx, type VariantProps } from '../utils/cva'`), no barrels.
- Run `pnpm --filter @codaco/fresco-ui test:unit` for unit tests; `pnpm --filter @codaco/fresco-ui typecheck`; `pnpm lint:fix`; `pnpm knip` from repo root.

---

## File Structure

- **Create** `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx` — the component, its cva variants, segment renderers, the drag-handle subcomponent, and all exported types (co-located, mirroring `Button.tsx`).
- **Create** `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.test.tsx` — Vitest unit tests (`unit` project, jsdom).
- **Create** `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.stories.tsx` — interactive + capture stories.
- **Modify** `packages/fresco-ui/package.json` — add the `./SegmentedToolbar` `exports` entry.
- **Create** `.changeset/segmented-toolbar.md` — minor changeset for `@codaco/fresco-ui`.

Reference exemplars (read before starting): `packages/fresco-ui/src/Button.tsx` (cva + token composition, `MotionButton`), `packages/fresco-ui/src/form/fields/ToggleButtonGroup.tsx` (Base UI control + render prop + pressed styling), `packages/fresco-ui/src/Tooltip.tsx` (`Tooltip`/`TooltipTrigger`/`TooltipContent`), `packages/fresco-ui/src/form/fields/ArrayField/ArrayField.tsx` (`AnimatePresence mode="popLayout"` + `layout`).

---

## Task 1: Static toolbar — buttons, separators, content, tooltips, orientation, roving focus

Foundational task: a non-animated, non-draggable toolbar that renders `button` and `separator` segments with icon/text/both content, tooltips for icon-only buttons, correct a11y, and Base UI roving focus. Adds the package export.

**Files:**

- Create: `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx`
- Create: `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.test.tsx`
- Modify: `packages/fresco-ui/package.json` (`exports`)

**Interfaces:**

- Produces (types other tasks/consumers rely on):
  - `type ButtonColor = 'default' | 'dynamic' | 'primary' | 'secondary' | 'warning' | 'info' | 'destructive' | 'success'`
  - `type SegmentContent = { label: string; icon?: React.ReactNode; showLabel?: boolean; color?: ButtonColor }`
  - `type ButtonSegment = { type: 'button'; id: string; disabled?: boolean; onClick: () => void } & SegmentContent`
  - `type SeparatorSegment = { type: 'separator'; id: string }`
  - `type ToolbarSegment` (union; grows in later tasks)
  - `type Position = { x: number; y: number }`
  - `type SegmentedToolbarProps` (grows in later tasks)
  - default export `SegmentedToolbar`, named export `SegmentedToolbar`
- Consumes: nothing (first task).

- [ ] **Step 1: Write the failing test**

Create `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pencil, Snowflake, Undo2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { SegmentedToolbar, type ToolbarSegment } from './SegmentedToolbar';

describe('SegmentedToolbar — buttons & separators', () => {
  it('renders a labelled toolbar with its button segments', () => {
    const items: ToolbarSegment[] = [
      {
        type: 'button',
        id: 'edit',
        label: 'Edit',
        icon: <Pencil />,
        onClick: vi.fn(),
      },
      { type: 'separator', id: 'sep-1' },
      {
        type: 'button',
        id: 'undo',
        label: 'Undo',
        icon: <Undo2 />,
        onClick: vi.fn(),
      },
    ];
    render(<SegmentedToolbar label="Drawing tools" items={items} />);

    const toolbar = screen.getByRole('toolbar', { name: 'Drawing tools' });
    expect(toolbar).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('fires onClick for a button segment', async () => {
    const onClick = vi.fn();
    const items: ToolbarSegment[] = [
      {
        type: 'button',
        id: 'freeze',
        label: 'Freeze',
        icon: <Snowflake />,
        onClick,
      },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);

    await userEvent.click(screen.getByRole('button', { name: 'Freeze' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders visible text when there is no icon', () => {
    const items: ToolbarSegment[] = [
      { type: 'button', id: 'done', label: 'Done', onClick: vi.fn() },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);
    // Label is visible text, not only an accessible name.
    expect(screen.getByText('Done')).toBeVisible();
  });

  it('moves focus between segments with the arrow keys (roving focus)', async () => {
    const items: ToolbarSegment[] = [
      { type: 'button', id: 'a', label: 'A', onClick: vi.fn() },
      { type: 'button', id: 'b', label: 'B', onClick: vi.fn() },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'A' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'B' })).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run --project=unit src/SegmentedToolbar/SegmentedToolbar.test.tsx`
Expected: FAIL — `Failed to resolve import './SegmentedToolbar'` (file does not exist yet).

- [ ] **Step 3: Create the component file**

Create `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx`:

```tsx
'use client';

import { Toolbar } from '@base-ui/react/toolbar';
import * as React from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '../Tooltip';
import { cva, cx, type VariantProps } from '../utils/cva';

export type ButtonColor =
  | 'default'
  | 'dynamic'
  | 'primary'
  | 'secondary'
  | 'warning'
  | 'info'
  | 'destructive'
  | 'success';

export type SegmentContent = {
  /** Accessible name. Always the aria-label; rendered as visible text when showLabel. */
  label: string;
  /** Optional Lucide icon (or any node). Rendered aria-hidden. */
  icon?: React.ReactNode;
  /**
   * Render the label as visible text.
   * Default: false when an icon is present (icon-only + tooltip), true when no icon.
   */
  showLabel?: boolean;
  /** Optional colour token passthrough. */
  color?: ButtonColor;
};

export type ButtonSegment = {
  type: 'button';
  id: string;
  disabled?: boolean;
  onClick: () => void;
} & SegmentContent;

export type SeparatorSegment = {
  type: 'separator';
  id: string;
};

export type ToolbarSegment = ButtonSegment | SeparatorSegment;

export type Position = { x: number; y: number };

export type SegmentedToolbarProps = {
  /** Accessible name for the toolbar (role="toolbar" requires a label). */
  label: string;
  items: ToolbarSegment[];
  /** @default 'horizontal' */
  orientation?: 'horizontal' | 'vertical';
  /** @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const rootVariants = cva({
  base: cx(
    'flex w-fit items-center gap-1 rounded-full p-1.5',
    'bg-surface-1 text-surface-1-contrast elevation-medium',
  ),
  variants: {
    orientation: {
      horizontal: 'flex-row',
      vertical: 'flex-col',
    },
  },
  defaultVariants: { orientation: 'horizontal' },
});

const segmentVariants = cva({
  base: cx(
    'relative inline-flex shrink-0 cursor-pointer items-center justify-center select-none',
    'font-heading font-bold tracking-wide whitespace-nowrap text-current',
    'rounded-full border-0 bg-transparent',
    'focusable',
    'transition-colors spring-medium',
    'hover:enabled:bg-current/10',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'data-[pressed]:bg-[var(--selected)] data-[pressed]:text-[var(--selected-contrast)]',
  ),
  variants: {
    size: {
      sm: 'h-9 gap-1.5 text-sm',
      md: 'h-11 gap-2 text-base',
      lg: 'h-14 gap-2.5 text-lg',
    },
    iconOnly: {
      true: 'aspect-square p-0',
      false: 'px-4',
    },
  },
  defaultVariants: { size: 'md', iconOnly: false },
});

type SegmentSize = NonNullable<VariantProps<typeof segmentVariants>['size']>;

/** Whether a segment's text should be visible (vs icon-only). */
function isLabelVisible(content: SegmentContent): boolean {
  return content.showLabel ?? !content.icon;
}

function SegmentContentInner({ icon, label, showLabel }: SegmentContent) {
  const labelVisible = showLabel ?? !icon;
  return (
    <>
      {icon ? (
        <span aria-hidden className="contents">
          {icon}
        </span>
      ) : null}
      {labelVisible ? <span>{label}</span> : null}
    </>
  );
}

function ToolbarButtonSegment({
  segment,
  size,
}: {
  segment: ButtonSegment;
  size: SegmentSize;
}) {
  const labelVisible = isLabelVisible(segment);
  const button = (
    <Toolbar.Button
      disabled={segment.disabled}
      onClick={segment.onClick}
      aria-label={labelVisible ? undefined : segment.label}
      className={segmentVariants({ size, iconOnly: !labelVisible })}
    >
      <SegmentContentInner {...segment} />
    </Toolbar.Button>
  );

  // Icon-only: expose the label via a tooltip on hover/focus.
  if (!labelVisible) {
    return (
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent>{segment.label}</TooltipContent>
      </Tooltip>
    );
  }
  return button;
}

function renderSegment(
  segment: ToolbarSegment,
  size: SegmentSize,
  orientation: 'horizontal' | 'vertical',
) {
  switch (segment.type) {
    case 'separator':
      return (
        <Toolbar.Separator
          key={segment.id}
          orientation={orientation === 'horizontal' ? 'vertical' : 'horizontal'}
          className={cx(
            'bg-current/20 shrink-0 rounded-full',
            orientation === 'horizontal' ? 'mx-1 h-6 w-px' : 'my-1 h-px w-6',
          )}
        />
      );
    case 'button':
      return (
        <ToolbarButtonSegment key={segment.id} segment={segment} size={size} />
      );
  }
}

export function SegmentedToolbar({
  label,
  items,
  orientation = 'horizontal',
  size = 'md',
  className,
}: SegmentedToolbarProps) {
  return (
    <Toolbar.Root
      orientation={orientation}
      aria-label={label}
      className={cx(rootVariants({ orientation }), className)}
    >
      {items.map((segment) => renderSegment(segment, size, orientation))}
    </Toolbar.Root>
  );
}

export default SegmentedToolbar;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run --project=unit src/SegmentedToolbar/SegmentedToolbar.test.tsx`
Expected: PASS (4 tests). If roving focus fails, confirm Base UI `Toolbar.Root` is the parent and segments render real `<button>`s.

- [ ] **Step 5: Add the package export**

Modify `packages/fresco-ui/package.json` — add this entry to `exports` (alphabetical-ish, near `./ScrollArea`/`./Skeleton`):

```jsonc
    "./SegmentedToolbar": {
      "types": "./dist/SegmentedToolbar/SegmentedToolbar.d.ts",
      "default": "./dist/SegmentedToolbar/SegmentedToolbar.js"
    },
```

- [ ] **Step 6: Commit**

```bash
git add packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx \
        packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.test.tsx \
        packages/fresco-ui/package.json
git commit -m "feat(fresco-ui): SegmentedToolbar — buttons, separators, roving focus"
```

---

## Task 2: Toggle segments (independent on/off)

Add `type: 'toggle'` segments built on Base UI `Toggle`, with `aria-pressed` and token-styled pressed state. Controlled (`pressed`) and uncontrolled (`defaultPressed`).

**Files:**

- Modify: `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx`
- Modify: `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.test.tsx`

**Interfaces:**

- Produces: `type ToggleSegment = { type: 'toggle'; id: string; disabled?: boolean; pressed?: boolean; defaultPressed?: boolean; onPressedChange?: (pressed: boolean) => void } & SegmentContent`; `ToolbarSegment` union now includes it.
- Consumes: `SegmentContent`, `segmentVariants`, `isLabelVisible`, `SegmentContentInner`, `SegmentSize`, `Tooltip*` from Task 1.

- [ ] **Step 1: Write the failing test**

Append to `SegmentedToolbar.test.tsx`:

```tsx
describe('SegmentedToolbar — toggles', () => {
  it('reflects controlled pressed state via aria-pressed', () => {
    const items: ToolbarSegment[] = [
      {
        type: 'toggle',
        id: 'freeze',
        label: 'Freeze',
        icon: <Snowflake />,
        pressed: true,
      },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);
    expect(screen.getByRole('button', { name: 'Freeze' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('calls onPressedChange when toggled', async () => {
    const onPressedChange = vi.fn();
    const items: ToolbarSegment[] = [
      {
        type: 'toggle',
        id: 'freeze',
        label: 'Freeze',
        icon: <Snowflake />,
        defaultPressed: false,
        onPressedChange,
      },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);
    await userEvent.click(screen.getByRole('button', { name: 'Freeze' }));
    expect(onPressedChange).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run --project=unit src/SegmentedToolbar/SegmentedToolbar.test.tsx -t toggles`
Expected: FAIL — `'toggle'` is not assignable to `ToolbarSegment` (type error) / no toggle rendered.

- [ ] **Step 3: Add the ToggleSegment type and renderer**

In `SegmentedToolbar.tsx`, add the import for `Toggle`:

```tsx
import { Toggle } from '@base-ui/react/toggle';
```

Add the type after `ButtonSegment`:

```tsx
export type ToggleSegment = {
  type: 'toggle';
  id: string;
  disabled?: boolean;
  pressed?: boolean;
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
} & SegmentContent;
```

Update the union:

```tsx
export type ToolbarSegment = ButtonSegment | ToggleSegment | SeparatorSegment;
```

Add a toggle renderer component (after `ToolbarButtonSegment`):

```tsx
function ToolbarToggleSegment({
  segment,
  size,
}: {
  segment: ToggleSegment;
  size: SegmentSize;
}) {
  const labelVisible = isLabelVisible(segment);
  const toggle = (
    <Toolbar.Button
      render={
        <Toggle
          pressed={segment.pressed}
          defaultPressed={segment.defaultPressed}
          onPressedChange={(pressed) => segment.onPressedChange?.(pressed)}
          disabled={segment.disabled}
          aria-label={labelVisible ? undefined : segment.label}
          className={segmentVariants({ size, iconOnly: !labelVisible })}
        />
      }
    >
      <SegmentContentInner {...segment} />
    </Toolbar.Button>
  );

  if (!labelVisible) {
    return (
      <Tooltip>
        <TooltipTrigger render={toggle} />
        <TooltipContent>{segment.label}</TooltipContent>
      </Tooltip>
    );
  }
  return toggle;
}
```

Add the `toggle` case to `renderSegment`'s switch (before `case 'button'`):

```tsx
    case 'toggle':
      return <ToolbarToggleSegment key={segment.id} segment={segment} size={size} />;
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run --project=unit src/SegmentedToolbar/SegmentedToolbar.test.tsx`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx \
        packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.test.tsx
git commit -m "feat(fresco-ui): SegmentedToolbar toggle segments"
```

---

## Task 3: Exclusive group segments (single / multiple)

Add `type: 'group'` segments built on Base UI `ToggleGroup` — `mode: 'single'` (radio-like, one pressed) or `'multiple'`.

**Files:**

- Modify: `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx`
- Modify: `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.test.tsx`

**Interfaces:**

- Produces: `type GroupSegment = { type: 'group'; id: string; mode: 'single' | 'multiple'; value?: string[]; defaultValue?: string[]; onValueChange?: (value: string[]) => void; options: Array<SegmentContent & { value: string; disabled?: boolean }> }`; `ToolbarSegment` includes it.
- Consumes: `ToolbarToggleSegment` pattern, `segmentVariants`, `Tooltip*`, `SegmentContentInner`.

- [ ] **Step 1: Write the failing test**

Append to `SegmentedToolbar.test.tsx`:

```tsx
import { Grid3x3, List, Map as MapIcon } from 'lucide-react';

describe('SegmentedToolbar — groups', () => {
  const groupItems = (onValueChange = vi.fn()): ToolbarSegment[] => [
    {
      type: 'group',
      id: 'view',
      mode: 'single',
      defaultValue: ['list'],
      onValueChange,
      options: [
        { value: 'list', label: 'List', icon: <List /> },
        { value: 'grid', label: 'Grid', icon: <Grid3x3 /> },
        { value: 'map', label: 'Map', icon: <MapIcon /> },
      ],
    },
  ];

  it('renders one button per option with the default pressed', () => {
    render(<SegmentedToolbar label="View" items={groupItems()} />);
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('single mode replaces selection on change', async () => {
    const onValueChange = vi.fn();
    render(<SegmentedToolbar label="View" items={groupItems(onValueChange)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Grid' }));
    expect(onValueChange).toHaveBeenCalledWith(['grid']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run --project=unit src/SegmentedToolbar/SegmentedToolbar.test.tsx -t groups`
Expected: FAIL — `'group'` not assignable to `ToolbarSegment`.

- [ ] **Step 3: Add the GroupSegment type and renderer**

In `SegmentedToolbar.tsx`, add the import:

```tsx
import { ToggleGroup } from '@base-ui/react/toggle-group';
```

Add the type after `ToggleSegment`:

```tsx
export type GroupSegment = {
  type: 'group';
  id: string;
  mode: 'single' | 'multiple';
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  options: Array<SegmentContent & { value: string; disabled?: boolean }>;
};
```

Update the union:

```tsx
export type ToolbarSegment =
  | ButtonSegment
  | ToggleSegment
  | GroupSegment
  | SeparatorSegment;
```

Add a group renderer (after `ToolbarToggleSegment`):

```tsx
function ToolbarGroupSegment({
  segment,
  size,
}: {
  segment: GroupSegment;
  size: SegmentSize;
}) {
  return (
    <ToggleGroup
      multiple={segment.mode === 'multiple'}
      value={segment.value}
      defaultValue={segment.defaultValue}
      onValueChange={(value) => segment.onValueChange?.(value)}
      className="flex items-center gap-1"
    >
      {segment.options.map((option) => {
        const labelVisible = option.showLabel ?? !option.icon;
        const toggle = (
          <Toolbar.Button
            render={
              <Toggle
                value={option.value}
                disabled={option.disabled}
                aria-label={labelVisible ? undefined : option.label}
                className={segmentVariants({ size, iconOnly: !labelVisible })}
              />
            }
          >
            <SegmentContentInner {...option} />
          </Toolbar.Button>
        );
        if (!labelVisible) {
          return (
            <Tooltip key={option.value}>
              <TooltipTrigger render={toggle} />
              <TooltipContent>{option.label}</TooltipContent>
            </Tooltip>
          );
        }
        return <React.Fragment key={option.value}>{toggle}</React.Fragment>;
      })}
    </ToggleGroup>
  );
}
```

Add the `group` case to `renderSegment` (before `case 'button'`):

```tsx
    case 'group':
      return <ToolbarGroupSegment key={segment.id} segment={segment} size={size} />;
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run --project=unit src/SegmentedToolbar/SegmentedToolbar.test.tsx`
Expected: PASS (all tests so far). Base UI `ToggleGroup` with `multiple={false}` enforces single selection and emits the new value array.

- [ ] **Step 5: Commit**

```bash
git add packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx \
        packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.test.tsx
git commit -m "feat(fresco-ui): SegmentedToolbar exclusive groups"
```

---

## Task 4: Enter/exit + container layout animation

Wrap each segment in a keyed `motion.div` inside `AnimatePresence mode="popLayout"`, make the root a `motion` element with `layout`, and gate flourishes on `useReducedMotion()`.

**Files:**

- Modify: `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx`
- Modify: `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.test.tsx`

**Interfaces:**

- Produces: no new public types. Internally adds a `SegmentMotion` wrapper; `renderSegment` now returns a keyed `motion.div`.
- Consumes: the three segment renderers from Tasks 1–3.

- [ ] **Step 1: Write the failing test**

Append to `SegmentedToolbar.test.tsx`. Because the motion mock renders `AnimatePresence` as a passthrough, add/remove is synchronous — assert presence by re-rendering with a changed `items` array:

```tsx
describe('SegmentedToolbar — add/remove', () => {
  it('adds and removes segments when items change', () => {
    const base: ToolbarSegment[] = [
      { type: 'button', id: 'a', label: 'A', onClick: vi.fn() },
    ];
    const { rerender } = render(
      <SegmentedToolbar label="Tools" items={base} />,
    );
    expect(screen.queryByRole('button', { name: 'B' })).not.toBeInTheDocument();

    rerender(
      <SegmentedToolbar
        label="Tools"
        items={[
          ...base,
          { type: 'button', id: 'b', label: 'B', onClick: vi.fn() },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument();

    rerender(<SegmentedToolbar label="Tools" items={base} />);
    expect(screen.queryByRole('button', { name: 'B' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails (or regresses)**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run --project=unit src/SegmentedToolbar/SegmentedToolbar.test.tsx -t "add/remove"`
Expected: This test may PASS even before changes (items already map). Treat Step 1 as a regression guard. Proceed to add the animation so the behaviour is intentional and verified after refactor.

- [ ] **Step 3: Add motion wrappers and reduced-motion gating**

In `SegmentedToolbar.tsx`, extend the motion import:

```tsx
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
```

Add a spring + wrapper above `SegmentedToolbar`:

```tsx
const segmentSpring = { type: 'spring' as const, duration: 0.4, bounce: 0.2 };

function SegmentMotion({
  reduce,
  children,
}: {
  reduce: boolean;
  children: React.ReactNode;
}) {
  const variants = reduce
    ? undefined
    : {
        initial: { opacity: 0, scale: 0.6 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.6 },
      };
  return (
    <motion.div
      layout
      className="flex items-center justify-center"
      initial={variants?.initial}
      animate={variants?.animate}
      exit={variants?.exit}
      transition={reduce ? { duration: 0 } : segmentSpring}
    >
      {children}
    </motion.div>
  );
}
```

Change `renderSegment` to take `reduce` and return the keyed wrapper around each control. Replace the whole `renderSegment` function with:

```tsx
function renderSegment(
  segment: ToolbarSegment,
  size: SegmentSize,
  orientation: 'horizontal' | 'vertical',
  reduce: boolean,
) {
  const inner = (() => {
    switch (segment.type) {
      case 'separator':
        return (
          <Toolbar.Separator
            orientation={
              orientation === 'horizontal' ? 'vertical' : 'horizontal'
            }
            className={cx(
              'bg-current/20 shrink-0 rounded-full',
              orientation === 'horizontal' ? 'mx-1 h-6 w-px' : 'my-1 h-px w-6',
            )}
          />
        );
      case 'group':
        return <ToolbarGroupSegment segment={segment} size={size} />;
      case 'toggle':
        return <ToolbarToggleSegment segment={segment} size={size} />;
      case 'button':
        return <ToolbarButtonSegment segment={segment} size={size} />;
    }
  })();

  return (
    <SegmentMotion key={segment.id} reduce={reduce}>
      {inner}
    </SegmentMotion>
  );
}
```

Make the root a `motion` element with `layout`, compute `reduce`, and wrap the mapped children in `AnimatePresence`. Replace the `SegmentedToolbar` function body's `return` with:

```tsx
const reduce = useReducedMotion() ?? false;
return (
  <Toolbar.Root
    orientation={orientation}
    aria-label={label}
    render={<motion.div layout />}
    className={cx(rootVariants({ orientation }), className)}
  >
    <AnimatePresence initial={false} mode="popLayout">
      {items.map((segment) =>
        renderSegment(segment, size, orientation, reduce),
      )}
    </AnimatePresence>
  </Toolbar.Root>
);
```

- [ ] **Step 4: Run the full file's tests**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run --project=unit src/SegmentedToolbar/SegmentedToolbar.test.tsx`
Expected: PASS (all prior tests + add/remove). The motion mock makes wrappers/`AnimatePresence` passthrough, so roving focus and add/remove still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx \
        packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.test.tsx
git commit -m "feat(fresco-ui): SegmentedToolbar enter/exit + layout animation"
```

---

## Task 5: Draggable — handle, motion drag, keyboard reposition, announcement

Add `draggable` support: an outer positioning `motion.div` (the pill becomes this outer element, drag-enabled), a focusable drag handle, controlled/uncontrolled position, keyboard nudge, and an `aria-live` announcement. Dragging is exempt from reduced-motion gating.

**Files:**

- Modify: `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx`
- Modify: `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.test.tsx`

**Interfaces:**

- Produces (final `SegmentedToolbarProps`): adds `draggable?: boolean; defaultPosition?: Position; position?: Position; onPositionChange?: (pos: Position) => void; dragConstraints?: React.RefObject<Element> | { top: number; left: number; right: number; bottom: number }; dragHandleLabel?: string`.
- Consumes: everything from Tasks 1–4.

- [ ] **Step 1: Write the failing test**

Append to `SegmentedToolbar.test.tsx`. Pointer drag can't run under the motion mock/jsdom, so test the keyboard contract and the handle's presence/label:

```tsx
describe('SegmentedToolbar — draggable', () => {
  const items: ToolbarSegment[] = [
    { type: 'button', id: 'a', label: 'A', onClick: vi.fn() },
  ];

  it('renders no drag handle by default', () => {
    render(<SegmentedToolbar label="Tools" items={items} />);
    expect(
      screen.queryByRole('button', { name: 'Move toolbar' }),
    ).not.toBeInTheDocument();
  });

  it('renders a labelled drag handle when draggable', () => {
    render(<SegmentedToolbar label="Tools" items={items} draggable />);
    expect(
      screen.getByRole('button', { name: 'Move toolbar' }),
    ).toBeInTheDocument();
  });

  it('uses a custom drag handle label', () => {
    render(
      <SegmentedToolbar
        label="Tools"
        items={items}
        draggable
        dragHandleLabel="Reposition"
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Reposition' }),
    ).toBeInTheDocument();
  });

  it('nudges position with the arrow keys from the focused handle', async () => {
    const onPositionChange = vi.fn();
    render(
      <SegmentedToolbar
        label="Tools"
        items={items}
        draggable
        defaultPosition={{ x: 0, y: 0 }}
        onPositionChange={onPositionChange}
      />,
    );
    const handle = screen.getByRole('button', { name: 'Move toolbar' });
    handle.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onPositionChange).toHaveBeenLastCalledWith({ x: 8, y: 0 });
    await userEvent.keyboard('{ArrowDown}');
    expect(onPositionChange).toHaveBeenLastCalledWith({ x: 8, y: 8 });
  });

  it('announces movement via an aria-live region', async () => {
    render(<SegmentedToolbar label="Tools" items={items} draggable />);
    screen.getByRole('button', { name: 'Move toolbar' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('status')).toHaveTextContent(/moved/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run --project=unit src/SegmentedToolbar/SegmentedToolbar.test.tsx -t draggable`
Expected: FAIL — `draggable`/`dragHandleLabel` not in props; no handle rendered.

- [ ] **Step 3: Implement draggable wrapper, handle, keyboard nudge, announcement**

In `SegmentedToolbar.tsx`, extend imports:

```tsx
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
} from 'motion/react';
import { GripHorizontal, GripVertical } from 'lucide-react';
```

Add the position props to `SegmentedToolbarProps`:

```tsx
  /** @default false */
  draggable?: boolean;
  /** Uncontrolled starting position (only when draggable). */
  defaultPosition?: Position;
  /** Controlled position (only when draggable). */
  position?: Position;
  onPositionChange?: (pos: Position) => void;
  /** Optional drag bounds. */
  dragConstraints?:
    | React.RefObject<Element>
    | { top: number; left: number; right: number; bottom: number };
  /** Accessible name for the drag handle. @default 'Move toolbar' */
  dragHandleLabel?: string;
```

Add a nudge step constant near `segmentSpring`:

```tsx
const NUDGE_STEP = 8;
```

Add a `DragHandle` component (after `SegmentMotion`):

```tsx
function DragHandle({
  label,
  orientation,
  size,
  onPointerDown,
  onNudge,
}: {
  label: string;
  orientation: 'horizontal' | 'vertical';
  size: SegmentSize;
  onPointerDown: (event: React.PointerEvent) => void;
  onNudge: (delta: Position) => void;
}) {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    const deltas: Record<string, Position> = {
      ArrowLeft: { x: -NUDGE_STEP, y: 0 },
      ArrowRight: { x: NUDGE_STEP, y: 0 },
      ArrowUp: { x: 0, y: -NUDGE_STEP },
      ArrowDown: { x: 0, y: NUDGE_STEP },
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    onNudge(delta);
  };

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={onPointerDown}
      onKeyDown={handleKeyDown}
      className={cx(
        segmentVariants({ size, iconOnly: true }),
        'cursor-grab touch-none active:cursor-grabbing',
      )}
    >
      <span aria-hidden className="contents">
        {orientation === 'horizontal' ? <GripVertical /> : <GripHorizontal />}
      </span>
    </button>
  );
}
```

Rework `SegmentedToolbar` to support the draggable wrapper. Replace the whole `SegmentedToolbar` function with:

```tsx
export function SegmentedToolbar({
  label,
  items,
  orientation = 'horizontal',
  size = 'md',
  draggable = false,
  defaultPosition,
  position,
  onPositionChange,
  dragConstraints,
  dragHandleLabel = 'Move toolbar',
  className,
}: SegmentedToolbarProps) {
  const reduce = useReducedMotion() ?? false;
  const dragControls = useDragControls();
  const isControlled = position !== undefined;
  const [internalPos, setInternalPos] = React.useState<Position>(
    defaultPosition ?? { x: 0, y: 0 },
  );
  const [announcement, setAnnouncement] = React.useState('');
  const pos = isControlled ? position : internalPos;

  const commitPosition = (next: Position) => {
    if (!isControlled) setInternalPos(next);
    onPositionChange?.(next);
  };

  const handleNudge = (delta: Position) => {
    const next = { x: pos.x + delta.x, y: pos.y + delta.y };
    commitPosition(next);
    setAnnouncement(
      `Toolbar moved to ${Math.round(next.x)}, ${Math.round(next.y)}`,
    );
  };

  const toolbar = (
    <Toolbar.Root
      orientation={orientation}
      aria-label={label}
      render={draggable ? <div /> : <motion.div layout />}
      className={cx(
        draggable ? 'flex items-center gap-1' : rootVariants({ orientation }),
        draggable && orientation === 'vertical' && 'flex-col',
        className,
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((segment) =>
          renderSegment(segment, size, orientation, reduce),
        )}
      </AnimatePresence>
    </Toolbar.Root>
  );

  if (!draggable) {
    return toolbar;
  }

  return (
    <motion.div
      layout
      drag
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      dragConstraints={dragConstraints}
      onDragEnd={(_event, info) =>
        commitPosition({ x: pos.x + info.offset.x, y: pos.y + info.offset.y })
      }
      animate={{ x: pos.x, y: pos.y }}
      transition={reduce ? { duration: 0 } : segmentSpring}
      className={cx(rootVariants({ orientation }), className)}
    >
      <DragHandle
        label={dragHandleLabel}
        orientation={orientation}
        size={size}
        onPointerDown={(event) => dragControls.start(event)}
        onNudge={handleNudge}
      />
      {toolbar}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </motion.div>
  );
}
```

Note: when `draggable`, the outer `motion.div` carries the pill styling (`rootVariants`) and `Toolbar.Root` becomes a transparent inner flex; `className` is applied to the outer element. The handle is intentionally outside `role="toolbar"` so its arrow keys move the toolbar rather than competing with the toolbar's roving focus.

- [ ] **Step 4: Run the full test file**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run --project=unit src/SegmentedToolbar/SegmentedToolbar.test.tsx`
Expected: PASS (all tests incl. draggable). The keyboard nudge calls `onPositionChange` with `{x:8,y:0}` then `{x:8,y:8}`; the `status` region shows "moved".

- [ ] **Step 5: Commit**

```bash
git add packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx \
        packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.test.tsx
git commit -m "feat(fresco-ui): SegmentedToolbar draggable handle + keyboard reposition"
```

---

## Task 6: Stories, changeset, and full verification

Add the interactive + capture stories, a changeset, and run the repo quality gates.

**Files:**

- Create: `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.stories.tsx`
- Create: `.changeset/segmented-toolbar.md`

**Interfaces:**

- Consumes: the public `SegmentedToolbar` + types from Tasks 1–5. No new types.

- [ ] **Step 1: Write the stories**

Create `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Grid3x3,
  List,
  Map as MapIcon,
  Pencil,
  Redo2,
  Snowflake,
  Undo2,
} from 'lucide-react';

import { SegmentedToolbar, type ToolbarSegment } from './SegmentedToolbar';

const meta = {
  title: 'Components/SegmentedToolbar',
  component: SegmentedToolbar,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: 'inline-radio',
      options: ['horizontal', 'vertical'],
    },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    draggable: { control: 'boolean' },
  },
} satisfies Meta<typeof SegmentedToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleItems: ToolbarSegment[] = [
  { type: 'button', id: 'edit', label: 'Edit', icon: <Pencil /> },
  {
    type: 'toggle',
    id: 'freeze',
    label: 'Freeze layout',
    icon: <Snowflake />,
    defaultPressed: false,
  },
  { type: 'separator', id: 'sep-1' },
  {
    type: 'group',
    id: 'view',
    mode: 'single',
    defaultValue: ['list'],
    options: [
      { value: 'list', label: 'List', icon: <List /> },
      { value: 'grid', label: 'Grid', icon: <Grid3x3 /> },
      { value: 'map', label: 'Map', icon: <MapIcon /> },
    ],
  },
  { type: 'separator', id: 'sep-2' },
  { type: 'button', id: 'undo', label: 'Undo', icon: <Undo2 /> },
  { type: 'button', id: 'redo', label: 'Redo', icon: <Redo2 /> },
] as ButtonSegmentLike;

// Stories assign onClick/onPressedChange at render so controls stay declarative.
type ButtonSegmentLike = ToolbarSegment[];

export const Interactive: Story = {
  args: {
    label: 'Drawing tools',
    orientation: 'horizontal',
    size: 'md',
    draggable: false,
    items: sampleItems,
  },
};

export const Capture: Story = {
  args: {
    label: 'Drawing tools',
    draggable: true,
    items: [
      { type: 'button', id: 'edit', label: 'Edit', icon: <Pencil /> },
      {
        type: 'toggle',
        id: 'freeze',
        label: 'Freeze',
        icon: <Snowflake />,
        defaultPressed: true,
      },
      { type: 'button', id: 'undo', label: 'Undo', icon: <Undo2 /> },
    ],
  },
};
```

Note: drop the `as ButtonSegmentLike` cast — it is shown only to flag that `onClick`/`onPressedChange` are optional for display stories. Replace the `sampleItems` declaration's trailing `] as ButtonSegmentLike;` with `];` and delete the `type ButtonSegmentLike` line. (Per project rules: no type assertions. `onClick` on a `ButtonSegment` is required, so for the story give each button a no-op `onClick: () => {}` instead of casting.)

Concretely, define `sampleItems` with explicit no-op handlers:

```tsx
const noop = () => {};
const sampleItems: ToolbarSegment[] = [
  {
    type: 'button',
    id: 'edit',
    label: 'Edit',
    icon: <Pencil />,
    onClick: noop,
  },
  {
    type: 'toggle',
    id: 'freeze',
    label: 'Freeze layout',
    icon: <Snowflake />,
    defaultPressed: false,
  },
  { type: 'separator', id: 'sep-1' },
  {
    type: 'group',
    id: 'view',
    mode: 'single',
    defaultValue: ['list'],
    options: [
      { value: 'list', label: 'List', icon: <List /> },
      { value: 'grid', label: 'Grid', icon: <Grid3x3 /> },
      { value: 'map', label: 'Map', icon: <MapIcon /> },
    ],
  },
  { type: 'separator', id: 'sep-2' },
  { type: 'button', id: 'undo', label: 'Undo', icon: <Undo2 />, onClick: noop },
  { type: 'button', id: 'redo', label: 'Redo', icon: <Redo2 />, onClick: noop },
];
```

and the `Capture` items likewise give buttons `onClick: noop`.

- [ ] **Step 2: Verify the stories typecheck/build**

Run: `pnpm --filter @codaco/fresco-ui typecheck`
Expected: PASS, no errors. (If `ButtonSegmentLike`/casts remain, remove them per the note above.)

- [ ] **Step 3: Add a changeset**

Create `.changeset/segmented-toolbar.md`:

```markdown
---
'@codaco/fresco-ui': minor
---

Add `SegmentedToolbar`: a config-driven, accessible toolbar of button / toggle / exclusive-group / separator segments with enter-exit animation, horizontal or vertical orientation, and an optional draggable handle.
```

- [ ] **Step 4: Run the full quality gates**

Run each from the repo root and confirm clean:

```bash
pnpm --filter @codaco/fresco-ui test:unit
pnpm --filter @codaco/fresco-ui typecheck
pnpm lint:fix
pnpm knip
```

Expected: unit tests PASS; typecheck PASS; lint clean (auto-fixed); knip reports no new unused exports/deps for the `SegmentedToolbar` subpath (it is a published `exports` entry, so its public types are entry points). Fix any reported issue at the cause.

- [ ] **Step 5: Commit**

```bash
git add packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.stories.tsx .changeset/segmented-toolbar.md
git commit -m "feat(fresco-ui): SegmentedToolbar stories + changeset"
```

- [ ] **Step 6 (optional, manual): Visual check in Storybook**

Run `pnpm --filter @codaco/fresco-ui storybook` and open `Components/SegmentedToolbar`. Verify: the pill look on a dark interview surface, icon-only tooltips on hover/focus, toggle pressed colour, single-select group, separators, orientation flip animating, and dragging the handle (pointer + arrow keys). Per project memory, do **not** run e2e/Playwright locally.

---

## Self-Review

**1. Spec coverage:**

- Base UI foundation → Task 1 (`Toolbar.Root`/`Button`/`Separator`), Task 2 (`Toggle`), Task 3 (`ToggleGroup`). ✓
- Full a11y (role/label, roving focus, aria-pressed, icon-only aria-label + tooltip, drag keyboard + aria-live, aria-hidden icons) → Tasks 1, 2, 5. ✓
- Icon / text / both → `SegmentContentInner` + `isLabelVisible`, Task 1. ✓
- Single-click vs toggle → Tasks 1 & 2; exclusive groups → Task 3. ✓
- Separator → Task 1 (+ orientation-aware in Task 4 refactor). ✓
- Add/remove enter-exit + container `layout` → Task 4. ✓
- Horizontal/vertical → `orientation` threaded through Tasks 1, 4, 5. ✓
- Draggable + handle (self-positioning, controlled/uncontrolled, keyboard) → Task 5. ✓
- Stories (interactive + capture) + tests → Tasks 1–6. ✓
- Tokens-only styling, reduced motion → Tasks 1, 4, 5. ✓
- Export entry, changeset, no barrels, no `any`/asserts → Tasks 1, 6 + Global Constraints. ✓

**2. Placeholder scan:** No `TBD`/`TODO`/"add error handling"/"similar to Task N"; every code step shows real code; the story-cast caveat is resolved inline with concrete `noop` handlers (no assertions). ✓

**3. Type consistency:** `renderSegment(segment, size, orientation, reduce)` signature defined in Task 4 matches its Task 4 usage; `SegmentSize`, `Position`, `isLabelVisible`, `SegmentContentInner`, `segmentVariants`, `rootVariants`, `segmentSpring`, `SegmentMotion`, `DragHandle`, `ToolbarButtonSegment`/`ToolbarToggleSegment`/`ToolbarGroupSegment` names are used consistently across tasks. `GroupSegment.value`/`defaultValue` are `string[]`, matching Base UI `ToggleGroup`'s `readonly Value[]` (assignable). ✓
