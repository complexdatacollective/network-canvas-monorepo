# fresco-ui SegmentedSwitcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable exclusive single-select `SegmentedSwitcher` to `@codaco/fresco-ui` (built on Base UI `ToggleGroup`, animated sliding indicator, `size` prop, per-segment `render` escape hatch) and migrate interviewer-v8's `ViewSwitcher` (size `lg`) and `DataViewToolbar` status filter (size `md`) onto it.

**Architecture:** One new component in `packages/fresco-ui/src/SegmentedSwitcher/`, exported per-package (no barrel). It wraps Base UI `ToggleGroup` (`multiple={false}`) + `Toggle` per option, renders each active segment's background as a `motion.span` with a per-instance `layoutId` (the slide), and guards against deselection so exactly one segment is always active. Both interviewer-v8 consumers become thin adapters; interviewer-v8 consumes fresco-ui as built `dist`, so fresco-ui must be rebuilt before the interviewer-v8 migration tasks typecheck.

**Tech Stack:** React 18, Base UI (`@base-ui/react/toggle`, `@base-ui/react/toggle-group`), `motion` (`motion/react`, `useReducedMotion`), Tailwind v4 + `@codaco/tailwind-config` tokens, fresco-ui `cva`/`cx` (`../utils/cva`), Vitest, Storybook (fresco-ui multi-theme), Changesets.

## Global Constraints

- **No `any`, no `as` type-bypass assertions, no `!` non-null assertions, no lint/tsc-ignore rules** — fix the underlying type. `noUncheckedIndexedAccess` is on.
- **No barrel files; no re-exports for convenience** — export via `packages/fresco-ui/package.json` `exports`, import as `@codaco/fresco-ui/SegmentedSwitcher`.
- **Indicator uses the theme token `bg-primary`; active label `text-primary-contrast`.** In the interview theme `--primary` = `oklch(var(--sea-green))` and `--primary-contrast` = white (`tooling/tailwind/fresco/themes/interview.css:45,47`), so the interviewer-v8 look is unchanged; in the default/dashboard theme it resolves to that theme's primary. Do NOT hard-code `sea-green`.
- **Preserve the slide animation feel:** `motion.span` with `layoutId`, `transition={{ type: 'spring', stiffness: 380, damping: 32 }}`; snap (no transition) under `useReducedMotion()`.
- **A switcher always has exactly one active segment** — the no-deselect guard is required.
- **Behaviour-preserving migrations:** the DataView status-filter table wiring (`chipFilter`/`setChipFilter`, the `progress` column filter) and per-option **counts** stay in `DataViewToolbar`; the `ViewSwitcher` keeps route-derived active state + anchor navigation.
- **fresco-ui is a released package:** a changeset is required (`minor`). interviewer-v8 is unreleased: **no** changeset for it.
- **Formatting/linting** is handled by the pre-commit hook (oxfmt + oxlint). Do not run `lint:fix` in tasks. Defer the full repo typecheck to the final task; per-task, run the targeted commands given.
- All paths are repo-root-relative.

## Commands

- fresco-ui unit test (single file): `pnpm --filter @codaco/fresco-ui exec vitest run <path>`
- fresco-ui typecheck: `pnpm --filter @codaco/fresco-ui typecheck`
- **Rebuild fresco-ui dist** (required before interviewer-v8 consumes the new export): `pnpm exec turbo run build --filter=@codaco/fresco-ui`
- interviewer-v8 typecheck: `pnpm --filter @codaco/interviewer-v8 typecheck`
- interviewer-v8 story render test: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=storybook <path>`
- fresco-ui storybook build: `pnpm --filter @codaco/fresco-ui build-storybook`
- knip: `pnpm knip`

## File Structure

- **Create** `packages/fresco-ui/src/SegmentedSwitcher/SegmentedSwitcher.tsx` — the component.
- **Create** `packages/fresco-ui/src/SegmentedSwitcher/SegmentedSwitcher.test.tsx` — unit/interaction tests.
- **Create** `packages/fresco-ui/src/SegmentedSwitcher/SegmentedSwitcher.stories.tsx` — multi-theme story.
- **Create** `.changeset/segmented-switcher.md` — fresco-ui minor changeset.
- **Modify** `packages/fresco-ui/package.json` — add `./SegmentedSwitcher` export.
- **Modify** `apps/interviewer-v8/src/components/ViewSwitcher.tsx` — thin adapter over `SegmentedSwitcher`.
- **Modify** `apps/interviewer-v8/src/components/ViewSwitcher.stories.tsx` — story the adapter.
- **Modify** `apps/interviewer-v8/src/components/DataView/DataViewToolbar.tsx` — status filter → `SegmentedSwitcher`.

---

## Task 1: SegmentedSwitcher component + test + export + changeset

**Files:**

- Create: `packages/fresco-ui/src/SegmentedSwitcher/SegmentedSwitcher.tsx`
- Create: `packages/fresco-ui/src/SegmentedSwitcher/SegmentedSwitcher.test.tsx`
- Modify: `packages/fresco-ui/package.json` (exports)
- Create: `.changeset/segmented-switcher.md`

**Interfaces:**

- Produces: `SegmentedSwitcher<T extends string>` (default export) with props `{ value: T; onValueChange: (v: T) => void; options: SegmentedOption<T>[]; size?: 'sm'|'md'|'lg'; 'aria-label': string; className?: string }` and `SegmentedOption<T> = { value: T; label: ReactNode; icon?: LucideIcon; disabled?: boolean; render?: ReactElement }` (both exported). Base UI `ToggleGroup` value/onValueChange are array-shaped; the component adapts scalar `T` ↔ array and guards deselect.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/fresco-ui/src/SegmentedSwitcher/SegmentedSwitcher.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import SegmentedSwitcher from './SegmentedSwitcher';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie' },
] as const;

function setup(value: 'a' | 'b' | 'c', onValueChange = vi.fn()) {
  render(
    <SegmentedSwitcher
      aria-label="Test switcher"
      value={value}
      onValueChange={onValueChange}
      options={[...OPTIONS]}
    />,
  );
  return { onValueChange };
}

describe('SegmentedSwitcher', () => {
  it('renders one pressed segment matching value', () => {
    setup('b');
    expect(screen.getByRole('button', { name: 'Bravo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('fires onValueChange with the picked value when another segment is clicked', async () => {
    const { onValueChange } = setup('a');
    await userEvent.click(screen.getByRole('button', { name: 'Charlie' }));
    expect(onValueChange).toHaveBeenCalledWith('c');
  });

  it('does not deselect: clicking the active segment keeps it active (no empty emit)', async () => {
    const { onValueChange } = setup('a');
    await userEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    // Either not called, or called again with 'a' — never with an empty/undefined value.
    for (const call of onValueChange.mock.calls) {
      expect(call[0]).toBe('a');
    }
  });

  it('does not fire for a disabled segment', async () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedSwitcher
        aria-label="Test switcher"
        value="a"
        onValueChange={onValueChange}
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Bravo', disabled: true },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Bravo' }));
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run src/SegmentedSwitcher/SegmentedSwitcher.test.tsx`
Expected: FAIL — cannot resolve `./SegmentedSwitcher`.

- [ ] **Step 3: Implement the component**

```tsx
// packages/fresco-ui/src/SegmentedSwitcher/SegmentedSwitcher.tsx
import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import type { LucideIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { type ReactElement, type ReactNode, useId } from 'react';

import { cva, cx } from '../utils/cva';

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
  // Base UI render escape hatch: render the segment as e.g. a wouter <Link>.
  render?: ReactElement;
};

export type SegmentedSwitcherProps<T extends string> = {
  'value': T;
  'onValueChange': (value: T) => void;
  'options': SegmentedOption<T>[];
  'size'?: 'sm' | 'md' | 'lg';
  'aria-label': string;
  'className'?: string;
};

const containerClasses =
  'border-outline bg-surface/50 inline-flex items-center rounded-full border p-1 backdrop-blur-md';

const segmentVariants = cva({
  base: cx(
    'font-heading relative inline-flex items-center justify-center rounded-full font-extrabold uppercase transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-40',
  ),
  variants: {
    size: {
      sm: 'gap-1.5 px-3.5 py-1.5 text-xs tracking-[0.06em]',
      md: 'gap-2 px-[18px] py-2.5 text-xs tracking-[0.06em]',
      lg: 'gap-2 px-5 py-2 text-sm tracking-wide',
    },
  },
  defaultVariants: { size: 'md' },
});

const iconSizeClass: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-[18px]',
};

export default function SegmentedSwitcher<T extends string>({
  value,
  onValueChange,
  options,
  size = 'md',
  'aria-label': ariaLabel,
  className,
}: SegmentedSwitcherProps<T>) {
  const layoutId = useId();
  const reduced = useReducedMotion();

  return (
    <ToggleGroup
      aria-label={ariaLabel}
      value={[value]}
      onValueChange={(next) => {
        const first = next[0];
        // No-deselect: ignore a change that would leave nothing selected.
        if (first === undefined) return;
        const picked = options.find((option) => option.value === first);
        if (picked) onValueChange(picked.value);
      }}
      className={cx(containerClasses, className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <Toggle
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            render={option.render}
            className={cx(
              segmentVariants({ size }),
              active ? 'text-primary-contrast' : 'text-text/80',
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                aria-hidden
                className="bg-primary absolute inset-0 rounded-full"
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 380, damping: 32 }
                }
              />
            ) : null}
            {Icon ? (
              <Icon
                aria-hidden
                className={cx('relative stroke-[3px]', iconSizeClass[size])}
              />
            ) : null}
            <span className="relative">{option.label}</span>
          </Toggle>
        );
      })}
    </ToggleGroup>
  );
}
```

> If Base UI's `ToggleGroup` `value`/`onValueChange` are typed `unknown[]` rather than `string[]`, the `.find(option => option.value === first)` comparison and `picked.value` still yield `T` with no cast — keep it as written. If `render?: ReactElement` proves too loose against Base UI's `Toggle` `render` prop type at the call site, use Base UI's exported render type for `Toggle` instead of `ReactElement` (do not use `any`).

- [ ] **Step 4: Run the test — expect PASS**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run src/SegmentedSwitcher/SegmentedSwitcher.test.tsx`
Expected: PASS (4/4).

- [ ] **Step 5: Add the package export**

In `packages/fresco-ui/package.json`, add to `exports` (alphabetically near `./SegmentedToolbar`), matching its shape:

```jsonc
"./SegmentedSwitcher": {
  "types": "./dist/SegmentedSwitcher/SegmentedSwitcher.d.ts",
  "default": "./dist/SegmentedSwitcher/SegmentedSwitcher.js"
},
```

- [ ] **Step 6: Add the changeset**

Create `.changeset/segmented-switcher.md`:

```md
---
'@codaco/fresco-ui': minor
---

Add `SegmentedSwitcher`: an exclusive single-select segmented control built on Base UI `ToggleGroup`, with an animated sliding active-indicator, a `size` prop (`sm`/`md`/`lg`), and a per-segment `render` escape hatch (e.g. to render a segment as a link).
```

- [ ] **Step 7: Typecheck fresco-ui**

Run: `pnpm --filter @codaco/fresco-ui typecheck`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add packages/fresco-ui/src/SegmentedSwitcher/SegmentedSwitcher.tsx packages/fresco-ui/src/SegmentedSwitcher/SegmentedSwitcher.test.tsx packages/fresco-ui/package.json .changeset/segmented-switcher.md
git commit -m "feat(fresco-ui): add SegmentedSwitcher on Base UI ToggleGroup"
```

---

## Task 2: SegmentedSwitcher story (fresco-ui, multi-theme)

**Files:**

- Create: `packages/fresco-ui/src/SegmentedSwitcher/SegmentedSwitcher.stories.tsx`

**Interfaces:**

- Consumes: `SegmentedSwitcher`, `SegmentedOption` from `./SegmentedSwitcher`.

- [ ] **Step 1: Read one fresco-ui story for the exact convention** — open `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.stories.tsx` and mirror its `Meta`/`StoryObj` shape, `title` prefix, `tags: ['autodocs']`, and how it relies on the package's theme-switcher decorator (do NOT add a theme provider in the story — the fresco-ui `.storybook` supplies it).

- [ ] **Step 2: Write the story** (single args-driven `Default` + presets for what args can't reach)

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Database, Layers } from 'lucide-react';
import { useState } from 'react';

import SegmentedSwitcher, { type SegmentedOption } from './SegmentedSwitcher';

type Value = 'protocols' | 'data';
const ICON_OPTIONS: SegmentedOption<Value>[] = [
  { value: 'protocols', label: 'Protocols', icon: Layers },
  { value: 'data', label: 'Data', icon: Database },
];

type StoryArgs = { size: 'sm' | 'md' | 'lg'; disabledSecond: boolean };

const meta: Meta<StoryArgs> = {
  title: 'Components/SegmentedSwitcher',
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: { size: 'lg', disabledSecond: false },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    disabledSecond: { control: 'boolean' },
  },
  render: ({ size, disabledSecond }) => {
    const [value, setValue] = useState<Value>('protocols');
    const options = ICON_OPTIONS.map((o, i) =>
      i === 1 && disabledSecond ? { ...o, disabled: true } : o,
    );
    return (
      <SegmentedSwitcher
        aria-label="Demo switcher"
        size={size}
        value={value}
        onValueChange={setValue}
        options={options}
      />
    );
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

// The status-filter shape: no icons, count embedded in the label, size md.
export const WithCounts: Story = {
  render: () => {
    type Filter = 'all' | 'in-progress' | 'complete';
    const [value, setValue] = useState<Filter>('all');
    const counts: Record<Filter, number> = {
      'all': 42,
      'in-progress': 7,
      'complete': 35,
    };
    const options: SegmentedOption<Filter>[] = (
      ['all', 'in-progress', 'complete'] as const
    ).map((v) => ({
      value: v,
      label: (
        <>
          {v === 'in-progress'
            ? 'In progress'
            : v === 'all'
              ? 'All'
              : 'Complete'}{' '}
          · {counts[v]}
        </>
      ),
    }));
    return (
      <SegmentedSwitcher
        aria-label="Status filter"
        size="md"
        value={value}
        onValueChange={setValue}
        options={options}
      />
    );
  },
};
```

- [ ] **Step 3: Verify the story renders**

Run: `pnpm --filter @codaco/fresco-ui build-storybook`
Expected: build succeeds; log lists `Components/SegmentedSwitcher`. (Visual multi-theme check happens in the final task.)

- [ ] **Step 4: Commit**

```bash
git add packages/fresco-ui/src/SegmentedSwitcher/SegmentedSwitcher.stories.tsx
git commit -m "test(fresco-ui): SegmentedSwitcher story"
```

---

## Task 3: Migrate interviewer-v8 ViewSwitcher onto SegmentedSwitcher

**Files:**

- Modify: `apps/interviewer-v8/src/components/ViewSwitcher.tsx`
- Modify: `apps/interviewer-v8/src/components/ViewSwitcher.stories.tsx`

**Interfaces:**

- Consumes: `SegmentedSwitcher`, `SegmentedOption` from `@codaco/fresco-ui/SegmentedSwitcher`; wouter `Link`/`useLocation`.
- Produces: `ViewSwitcher` (unchanged export/usage) + `type View = 'protocols' | 'data'` (keep the exported `View` type — `TopActionBar` imports it).

- [ ] **Step 1: Rebuild fresco-ui dist so the new export resolves**

Run: `pnpm exec turbo run build --filter=@codaco/fresco-ui`
Expected: build succeeds (interviewer-v8 imports the built `dist`).

- [ ] **Step 2: Rewrite `ViewSwitcher.tsx` as an adapter**

```tsx
import { Database, Layers } from 'lucide-react';
import { Link, useLocation } from 'wouter';

import SegmentedSwitcher, {
  type SegmentedOption,
} from '@codaco/fresco-ui/SegmentedSwitcher';

export type View = 'protocols' | 'data';

const HREF: Record<View, string> = { protocols: '/', data: '/data' };

const OPTIONS: SegmentedOption<View>[] = [
  {
    value: 'protocols',
    label: 'Protocols',
    icon: Layers,
    render: <Link href={HREF.protocols} />,
  },
  {
    value: 'data',
    label: 'Data',
    icon: Database,
    render: <Link href={HREF.data} />,
  },
];

function activeView(location: string): View {
  return location === '/data' ? 'data' : 'protocols';
}

export function ViewSwitcher() {
  const [location, navigate] = useLocation();
  const value = activeView(location);

  return (
    <SegmentedSwitcher
      aria-label="Home view"
      size="lg"
      value={value}
      onValueChange={(next) => navigate(HREF[next])}
      options={OPTIONS}
    />
  );
}
```

> The segments render as real `<Link>`s (anchor affordances preserved); `value` is derived from the route; `onValueChange` navigates for keyboard/programmatic activation. Both converge on the same route, so a normal click does not create a duplicate history entry (verify in the final task). The old `ViewSwitcherView` export and its bespoke pill markup/`layoutId` are removed — `SegmentedSwitcher` owns them now.

- [ ] **Step 3: Confirm the only other consumer still compiles.** `TopActionBar.tsx` imports `type { View }` and renders `<ViewSwitcher />` with no props — both unchanged. (It previously may have imported `ViewSwitcherView`; if so, update it to `ViewSwitcher`. Grep `ViewSwitcherView` across `apps/interviewer-v8/src` and replace any remaining reference with the container.)

Run: `grep -rn "ViewSwitcherView" apps/interviewer-v8/src`
Expected: no matches after the edit (only `ViewSwitcher` remains).

- [ ] **Step 4: Update `ViewSwitcher.stories.tsx`** to story the adapter. It renders `<ViewSwitcher />` (which reads the route). Keep it minimal:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';

import { ViewSwitcher } from './ViewSwitcher';

// The Home protocols/data switcher — a route-driven SegmentedSwitcher (size lg)
// whose segments are wouter Links. Active state follows the URL.
const meta: Meta<typeof ViewSwitcher> = {
  title: 'Components/ViewSwitcher',
  component: ViewSwitcher,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ViewSwitcher>;

export const Default: Story = {};
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @codaco/interviewer-v8 typecheck` → 0 errors.
Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=storybook src/components/ViewSwitcher.stories.tsx` → passes (re-run once on flake).

- [ ] **Step 6: Commit**

```bash
git add apps/interviewer-v8/src/components/ViewSwitcher.tsx apps/interviewer-v8/src/components/ViewSwitcher.stories.tsx apps/interviewer-v8/src/components/TopActionBar.tsx
git commit -m "refactor(interviewer-v8): ViewSwitcher uses fresco-ui SegmentedSwitcher"
```

---

## Task 4: Migrate DataViewToolbar status filter onto SegmentedSwitcher

**Files:**

- Modify: `apps/interviewer-v8/src/components/DataView/DataViewToolbar.tsx`

**Interfaces:**

- Consumes: `SegmentedSwitcher`, `SegmentedOption` from `@codaco/fresco-ui/SegmentedSwitcher`.
- The `chipFilter`/`setChipFilter` logic, `chipOptions` (with `count`), and the `progress` column-filter wiring stay in `DataViewToolbar`.

- [ ] **Step 1: Replace the inline status-filter pill group.** Currently (`DataViewToolbar.tsx:164-197`) an inline `motion.div[role=tablist]` maps `chipOptions` to `<button>`s with a local `layoutId="data-view-status-indicator"`. Replace that inner block (keep the outer `motion.div variants={toolbarItemVariants}` wrapper) with `SegmentedSwitcher`. `chipFilter` can be `null` (an unrecognised table-filter combo); when null, fall back to `'all'` for the switcher's `value` (the switcher must always have a value; `'all'` mirrors the empty-filter state). Counts move into each option's `label`.

Add the import (top of file, with the other `@codaco/fresco-ui/*` imports):

```tsx
import SegmentedSwitcher, {
  type SegmentedOption,
} from '@codaco/fresco-ui/SegmentedSwitcher';
```

Build the options from the existing `chipOptions` and render the switcher:

```tsx
const statusOptions: SegmentedOption<ChipFilter>[] = chipOptions.map(
  (option) => ({
    value: option.id,
    label: (
      <>
        {option.label} · {option.count}
      </>
    ),
  }),
);
```

```tsx
<motion.div variants={toolbarItemVariants}>
  <SegmentedSwitcher
    aria-label="Status filter"
    size="md"
    value={chipFilter ?? 'all'}
    onValueChange={setChipFilter}
    options={statusOptions}
  />
</motion.div>
```

Remove now-dead code: the `FILTER_PILL_BASE` constant and the old inline `role="tablist"` markup. Keep `chipFilter`, `setChipFilter`, `chipOptions`, `statusFilterValue`, and all other toolbar sections unchanged. `motion` stays imported (the outer toolbar still uses `motion.div`).

- [ ] **Step 2: Verify**

Run: `pnpm --filter @codaco/interviewer-v8 typecheck` → 0 errors.
Run existing DataView unit tests if any: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/DataView` → PASS or "no test files". (State which ran.)

> No new story here — `DataViewToolbar`'s own story is created in the resumed non-auth story batch (it needs a mock TanStack table). The `size="md"` + counts presentation is already covered by the fresco-ui `WithCounts` story (Task 2).

- [ ] **Step 3: Commit**

```bash
git add apps/interviewer-v8/src/components/DataView/DataViewToolbar.tsx
git commit -m "refactor(interviewer-v8): DataViewToolbar status filter uses SegmentedSwitcher"
```

---

## Task 5: Final verification

- [ ] **Step 1: fresco-ui** — `pnpm --filter @codaco/fresco-ui typecheck` (0 errors); `pnpm --filter @codaco/fresco-ui exec vitest run src/SegmentedSwitcher/SegmentedSwitcher.test.tsx` (4/4); `pnpm --filter @codaco/fresco-ui build-storybook` (succeeds).
- [ ] **Step 2: Rebuild fresco-ui dist** — `pnpm exec turbo run build --filter=@codaco/fresco-ui` (so interviewer-v8 checks against the final component).
- [ ] **Step 3: interviewer-v8** — `pnpm --filter @codaco/interviewer-v8 typecheck` (0 errors); `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit` (all pass — confirms the DataView migration didn't regress); `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=storybook src/components/ViewSwitcher.stories.tsx`.
- [ ] **Step 4: knip** — `pnpm knip` (the new export is consumed by both migrations + the story; `SegmentedOption`/`SegmentedSwitcher` not flagged unused).
- [ ] **Step 5: Visual verification (both themes + preserved look).** In the fresco-ui Storybook, view `Components/SegmentedSwitcher` in BOTH the `dashboard` and `interview` themes (theme-switcher toolbar): confirm the indicator is the theme primary, and in the `interview` theme it is the sea-green matching today. In the interviewer-v8 Storybook (dev server), confirm `Components/ViewSwitcher` slides between Protocols/Data (sea-green indicator, unchanged look) and, once `DataViewToolbar` is storied, the status filter shows counts + slides. Confirm a Protocols/Data click does not double-push history (the URL changes once).
- [ ] **Step 6: Final commit** (only if steps required fixes)

```bash
git add -A
git commit -m "chore(fresco-ui): verification fixes for SegmentedSwitcher"
```

---

## Self-Review (author checklist — completed)

**Spec coverage:** new component (Task 1) with the exact API, ToggleGroup foundation, no-deselect guard, per-instance `layoutId`, reduced-motion, `bg-primary` theme-token indicator, size mapping, `render` escape hatch; package export + changeset (Task 1); fresco-ui story (Task 2); ViewSwitcher migration size lg with Link render (Task 3); DataViewToolbar migration size md with counts + table wiring preserved (Task 4); verification incl. both-theme visual + no-double-history (Task 5). All spec sections mapped.

**Placeholder scan:** no TBD/vague steps. The one read-first step (Task 2 Step 1, mirror the sibling story) and the grep in Task 3 Step 3 are explicit actions. Types/signatures are concrete.

**Type consistency:** `SegmentedOption<T>`/`SegmentedSwitcher<T>` props identical across Tasks 1–4; `ChipFilter` (`'all'|'in-progress'|'complete'`) and `View` (`'protocols'|'data'`) reused from the real sources; `bg-primary`/`text-primary-contrast` indicator consistent; the `chipFilter ?? 'all'` fallback matches the switcher's always-one-value contract.
</content>
