# App update experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the static version indicator in Architect and Interviewer into a live update indicator (idle / update-available / just-updated) that shows the GitHub release changelog, and delete the old update toasts.

**Architecture:** One shared system in `@codaco/fresco-ui` — a presentational `Pill`, a `releaseNotes` fetch/cache module, a `useAppUpdate` orchestration hook, and a presentational `AppUpdateIndicator` (pill + tooltip + changelog `Dialog`). Each app adds a thin context provider that owns the PWA plumbing (`useRegisterSW`, the unsaved-work signal) and feeds the shared pieces; the version-location renders a small wrapper that reads the context.

**Tech Stack:** React 19, TypeScript (strict, no `any`), fresco-ui (`cva`/`cx`, Base-UI, motion), `vite-plugin-pwa` (`useRegisterSW`), Storybook CSF3 (`@storybook/react-vite`) + `storybook/test`, Vitest (jsdom `unit` project).

## Global Constraints

- **No `any`.** No type assertions to silence errors. No barrel files.
- **Style with tokens only** — `font-monospace`, `bg-sea-serpent`/`text-sea-serpent`, `bg-sea-green`/`text-sea-green`, `bg-platinum`/`text-charcoal`, `focusable`. No hex/rgb.
- **Accessibility:** interactive pills are real `<button>`s with `aria-label`; the "updated" pill has a `Tooltip`; the changelog is a Base-UI `Dialog` (focus trap, Escape).
- **i18n-ready copy:** whole, externalisable strings — no sentence-fragment concatenation.
- **fresco-ui exports are hand-maintained** in `package.json`; every new public subpath (`./Pill`, `./appUpdate/useAppUpdate`, `./appUpdate/AppUpdateIndicator`) must be added there in the shape `{"types":"./dist/<path>.d.ts","default":"./dist/<path>.js"}`.
- **Import fresco-ui internals by relative path** inside the package (`../Button`), and by subpath from the apps (`@codaco/fresco-ui/appUpdate/AppUpdateIndicator`). No barrels.
- **Run before finishing:** `pnpm typecheck`, `pnpm lint:fix`, `pnpm knip`. Rely on the pre-commit hook for formatting/lint-staged (do not run root `lint:fix` broadly).
- **Changesets:** one **library** changeset (`@codaco/fresco-ui`) and one **app** changeset (`@codaco/architect` + `@codaco/interviewer`). Never mix an app and a library in one changeset.
- **Release tags:** repo `complexdatacollective/network-canvas-monorepo`; per-app tags `@codaco/architect@<ver>` / `@codaco/interviewer@<ver>`.

---

## File Structure

**fresco-ui (shared):**

- Create `packages/fresco-ui/src/Pill.tsx` — presentational monospace pill (`size`, `variant`, `icon`, `as`).
- Create `packages/fresco-ui/src/Pill.test.tsx` — render tests.
- Create `packages/fresco-ui/src/Pill.stories.tsx` — stories.
- Create `packages/fresco-ui/src/appUpdate/releaseNotes.ts` — GitHub fetch + `localStorage` cache.
- Create `packages/fresco-ui/src/appUpdate/__tests__/releaseNotes.test.ts` — selection/parsing tests.
- Create `packages/fresco-ui/src/appUpdate/useAppUpdate.ts` — status derivation, fetch/cache, version detection, one-shot auto-apply.
- Create `packages/fresco-ui/src/appUpdate/__tests__/useAppUpdate.test.ts` — detection + auto-apply tests.
- Create `packages/fresco-ui/src/appUpdate/AppUpdateIndicator.tsx` — pill + tooltip + `Dialog`.
- Create `packages/fresco-ui/src/appUpdate/AppUpdateIndicator.stories.tsx` — three states + play tests.
- Modify `packages/fresco-ui/package.json` — add three subpath exports.

**Architect:**

- Create `apps/architect/src/components/AppUpdate/AppUpdateProvider.tsx` — context + PWA wiring.
- Create `apps/architect/src/components/AppUpdate/AppUpdatePill.tsx` — reads context → shared indicator.
- Modify `apps/architect/src/components/ViewManager/views/App.tsx` — wrap with provider; remove banner.
- Modify `apps/architect/src/components/Home/Home.tsx` — replace `Badge` version pill with `AppUpdatePill`.
- Modify `apps/architect/vite.config.ts` — add `https://api.github.com` to `connect-src`.
- Delete `apps/architect/src/components/PwaUpdateBanner.tsx` and `apps/architect/src/components/__tests__/PwaUpdateBanner.test.tsx`.

**Interviewer:**

- Create `apps/interviewer/src/components/AppUpdate/AppUpdateProvider.tsx` — context + PWA wiring.
- Create `apps/interviewer/src/components/AppUpdate/AppUpdatePill.tsx` — reads context → shared indicator.
- Modify `apps/interviewer/src/App.tsx` — wrap with provider; remove banner.
- Modify `apps/interviewer/src/components/StatusRow.tsx` — `versionSlot` prop, `gap-3.5`→`gap-6`, render pill.
- Modify `apps/interviewer/vite.renderer.config.ts` — add `https://api.github.com` to `connect-src`.
- Delete `apps/interviewer/src/components/PwaUpdateBanner.tsx`, `apps/interviewer/src/components/PwaUpdateBanner.stories.tsx`, and `apps/interviewer/src/components/__tests__/PwaUpdateBanner.test.tsx`.

**Release:**

- Create two changesets (library + apps).

---

### Task 1: `Pill` component (fresco-ui)

**Files:**

- Create: `packages/fresco-ui/src/Pill.tsx`
- Test: `packages/fresco-ui/src/Pill.test.tsx`
- Create: `packages/fresco-ui/src/Pill.stories.tsx`
- Modify: `packages/fresco-ui/package.json` (add `./Pill` export)

**Interfaces:**

- Produces: `Pill` (default export) and `pillVariants` (named). Props:
  `{ as?: 'span' | 'button'; size?: 'sm' | 'md' | 'lg'; variant?: 'ghost' | 'filled' | 'outline'; icon?: React.ReactNode } & React.HTMLAttributes<HTMLElement> & Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'disabled'>`. Forwards ref to `HTMLElement`.

- [ ] **Step 1: Write the failing test**

Create `packages/fresco-ui/src/Pill.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Pill from './Pill';

describe('Pill', () => {
  it('renders children with the monospace base class', () => {
    render(<Pill>v1.2.3</Pill>);
    const el = screen.getByText('v1.2.3');
    expect(el.className).toContain('font-monospace');
    expect(el.tagName).toBe('SPAN');
  });

  it('renders the icon before the label', () => {
    render(<Pill icon={<span data-testid="dot" />}>v1.2.3</Pill>);
    expect(screen.getByTestId('dot')).toBeInTheDocument();
  });

  it('renders as an accessible button when as="button"', async () => {
    const onClick = vi.fn();
    render(
      <Pill as="button" onClick={onClick} aria-label="update">
        v1.2.3
      </Pill>,
    );
    const button = screen.getByRole('button', { name: 'update' });
    expect(button).toHaveAttribute('type', 'button');
    button.click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run --project=unit src/Pill.test.tsx`
Expected: FAIL — `Cannot find module './Pill'`.

- [ ] **Step 3: Implement `Pill`**

Create `packages/fresco-ui/src/Pill.tsx`:

```tsx
import * as React from 'react';

import { cva, cx, type VariantProps } from './utils/cva';

export const pillVariants = cva({
  // border is ALWAYS present (transparent by default) so the border-box is
  // identical across variants — toggling background/border never reflows the
  // pill or its neighbours.
  base: 'inline-flex items-center rounded-full border border-transparent font-monospace whitespace-nowrap',
  variants: {
    size: {
      sm: 'gap-1 px-2 py-0.5 text-xs',
      md: 'gap-1.5 px-2.5 py-1 text-xs',
      lg: 'gap-2 px-3 py-1.5 text-sm',
    },
    variant: {
      ghost: '',
      filled: 'bg-current/10',
      outline: 'border-current/25',
    },
  },
  defaultVariants: { size: 'md', variant: 'ghost' },
});

type PillOwnProps = VariantProps<typeof pillVariants> & {
  as?: 'span' | 'button';
  icon?: React.ReactNode;
};

export type PillProps = PillOwnProps &
  React.HTMLAttributes<HTMLElement> &
  Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'disabled'>;

const Pill = React.forwardRef<HTMLElement, PillProps>(
  (
    {
      as = 'span',
      size,
      variant,
      icon,
      className,
      children,
      type,
      disabled,
      ...props
    },
    ref,
  ) => {
    const Comp = as;
    const buttonProps =
      as === 'button' ? { type: type ?? 'button', disabled } : {};
    return (
      <Comp
        ref={ref}
        className={pillVariants({ size, variant, className })}
        {...buttonProps}
        {...props}
      >
        {icon}
        {children}
      </Comp>
    );
  },
);
Pill.displayName = 'Pill';

export default Pill;
```

- [ ] **Step 4: Add the `./Pill` package export**

In `packages/fresco-ui/package.json`, add to the `exports` object (keep the file's existing alphabetical grouping; place near `./Popover`/`./ScrollArea`):

```json
"./Pill": {
  "types": "./dist/Pill.d.ts",
  "default": "./dist/Pill.js"
},
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run --project=unit src/Pill.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the stories**

Create `packages/fresco-ui/src/Pill.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';

import Icon from './Icon';
import Pill from './Pill';

const meta = {
  title: 'Components/Pill',
  component: Pill,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    as: { control: 'inline-radio', options: ['span', 'button'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    variant: {
      control: 'inline-radio',
      options: ['ghost', 'filled', 'outline'],
    },
  },
} satisfies Meta<typeof Pill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: 'v8.0.0-beta.3', size: 'md', variant: 'ghost' },
};

export const WithIcon: Story = {
  args: {
    children: 'v8.0.0-beta.3',
    variant: 'filled',
    icon: <Icon name="RefreshCw" className="size-3.5" />,
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Pill size="sm">v1.2.3</Pill>
      <Pill size="md">v1.2.3</Pill>
      <Pill size="lg">v1.2.3</Pill>
    </div>
  ),
};

// The load-bearing guarantee: a ghost pill and a filled/coloured pill occupy the
// SAME box, so switching update states never nudges neighbouring content.
export const SpacingStable: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-2">
      <Pill variant="ghost">v8.0.0-beta.3</Pill>
      <Pill
        as="button"
        variant="ghost"
        className="bg-sea-serpent/20 text-sea-serpent"
        icon={<Icon name="RefreshCw" className="size-3.5" />}
      >
        v8.0.0-beta.3
      </Pill>
      <Pill
        as="button"
        variant="ghost"
        className="bg-sea-green/20 text-sea-green"
        icon={<Icon name="Check" className="size-3.5" />}
      >
        v8.0.0-beta.3
      </Pill>
      <Pill className="bg-platinum text-charcoal shadow-sm">v8.0.0-beta.3</Pill>
    </div>
  ),
};
```

- [ ] **Step 7: Commit**

```bash
git add packages/fresco-ui/src/Pill.tsx packages/fresco-ui/src/Pill.test.tsx packages/fresco-ui/src/Pill.stories.tsx packages/fresco-ui/package.json
git commit -m "feat(fresco-ui): add Pill component"
```

---

### Task 2: `releaseNotes` module (fresco-ui)

**Files:**

- Create: `packages/fresco-ui/src/appUpdate/releaseNotes.ts`
- Test: `packages/fresco-ui/src/appUpdate/__tests__/releaseNotes.test.ts`

**Interfaces:**

- Produces:
  - `type AppId = 'architect' | 'interviewer'`
  - `type ReleaseNotes = { version: string; body: string }`
  - `selectLatestForApp(app: AppId, releases: GitHubRelease[]): ReleaseNotes | null`
  - `fetchLatestReleaseNotes(app: AppId): Promise<ReleaseNotes | null>`
  - `fetchReleaseNotesForVersion(app: AppId, version: string): Promise<ReleaseNotes | null>`
  - `readCachedNotes(app: AppId): ReleaseNotes | null`
  - `writeCachedNotes(app: AppId, notes: ReleaseNotes): void`

- [ ] **Step 1: Write the failing test**

Create `packages/fresco-ui/src/appUpdate/__tests__/releaseNotes.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import {
  readCachedNotes,
  selectLatestForApp,
  writeCachedNotes,
} from '../releaseNotes';

describe('selectLatestForApp', () => {
  it('returns the newest release whose tag matches the app prefix', () => {
    const releases = [
      { tag_name: '@codaco/interviewer@8.0.0-beta.2', body: 'iv' },
      { tag_name: '@codaco/architect@8.0.0-beta.4', body: 'newest arch' },
      { tag_name: '@codaco/architect@8.0.0-beta.3', body: 'older arch' },
    ];
    expect(selectLatestForApp('architect', releases)).toEqual({
      version: '8.0.0-beta.4',
      body: 'newest arch',
    });
  });

  it('returns null when no tag matches the app', () => {
    const releases = [
      { tag_name: '@codaco/interviewer@8.0.0-beta.2', body: 'iv' },
    ];
    expect(selectLatestForApp('architect', releases)).toBeNull();
  });

  it('coerces a null body to an empty string', () => {
    const releases = [{ tag_name: '@codaco/architect@1.0.0', body: null }];
    expect(selectLatestForApp('architect', releases)).toEqual({
      version: '1.0.0',
      body: '',
    });
  });
});

describe('notes cache', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips notes through localStorage', () => {
    writeCachedNotes('interviewer', { version: '9.9.9', body: '# hi' });
    expect(readCachedNotes('interviewer')).toEqual({
      version: '9.9.9',
      body: '# hi',
    });
  });

  it('returns null when nothing is cached', () => {
    expect(readCachedNotes('architect')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run --project=unit src/appUpdate/__tests__/releaseNotes.test.ts`
Expected: FAIL — `Cannot find module '../releaseNotes'`.

- [ ] **Step 3: Implement `releaseNotes.ts`**

Create `packages/fresco-ui/src/appUpdate/releaseNotes.ts`:

```ts
export type AppId = 'architect' | 'interviewer';

export type ReleaseNotes = { version: string; body: string };

type GitHubRelease = { tag_name: string; body: string | null };

const REPO = 'complexdatacollective/network-canvas-monorepo';

const TAG_PREFIX: Record<AppId, string> = {
  architect: '@codaco/architect@',
  interviewer: '@codaco/interviewer@',
};

const cacheKey = (app: AppId) => `nc:updateNotes:${app}`;

const versionFromTag = (app: AppId, tag: string): string | null =>
  tag.startsWith(TAG_PREFIX[app]) ? tag.slice(TAG_PREFIX[app].length) : null;

// GitHub's /releases list is newest-first, so the first tag matching this app is
// the latest release for it.
export function selectLatestForApp(
  app: AppId,
  releases: GitHubRelease[],
): ReleaseNotes | null {
  for (const release of releases) {
    const version = versionFromTag(app, release.tag_name);
    if (version) return { version, body: release.body ?? '' };
  }
  return null;
}

export async function fetchLatestReleaseNotes(
  app: AppId,
): Promise<ReleaseNotes | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases?per_page=30`,
      { headers: { Accept: 'application/vnd.github+json' } },
    );
    if (!res.ok) return null;
    const releases = (await res.json()) as GitHubRelease[];
    return selectLatestForApp(app, releases);
  } catch {
    return null;
  }
}

export async function fetchReleaseNotesForVersion(
  app: AppId,
  version: string,
): Promise<ReleaseNotes | null> {
  try {
    const tag = `${TAG_PREFIX[app]}${version}`;
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/tags/${encodeURIComponent(tag)}`,
      { headers: { Accept: 'application/vnd.github+json' } },
    );
    if (!res.ok) return null;
    const release = (await res.json()) as GitHubRelease;
    return { version, body: release.body ?? '' };
  } catch {
    return null;
  }
}

export function readCachedNotes(app: AppId): ReleaseNotes | null {
  try {
    const raw = localStorage.getItem(cacheKey(app));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReleaseNotes>;
    if (typeof parsed.version === 'string' && typeof parsed.body === 'string') {
      return { version: parsed.version, body: parsed.body };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeCachedNotes(app: AppId, notes: ReleaseNotes): void {
  try {
    localStorage.setItem(cacheKey(app), JSON.stringify(notes));
  } catch {
    // Notes are a nicety, not critical — ignore quota/serialization failures.
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run --project=unit src/appUpdate/__tests__/releaseNotes.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/fresco-ui/src/appUpdate/releaseNotes.ts packages/fresco-ui/src/appUpdate/__tests__/releaseNotes.test.ts
git commit -m "feat(fresco-ui): add release-notes fetch + cache module"
```

---

### Task 3: `useAppUpdate` hook (fresco-ui)

**Files:**

- Create: `packages/fresco-ui/src/appUpdate/useAppUpdate.ts`
- Test: `packages/fresco-ui/src/appUpdate/__tests__/useAppUpdate.test.ts`
- Modify: `packages/fresco-ui/package.json` (add `./appUpdate/useAppUpdate` export)

**Interfaces:**

- Consumes: `releaseNotes.ts` (Task 2) — `fetchLatestReleaseNotes`, `fetchReleaseNotesForVersion`, `readCachedNotes`, `writeCachedNotes`, `AppId`, `ReleaseNotes`.
- Produces (default export `useAppUpdate`) and re-exports `type { ReleaseNotes, AppId }`:
  - `type UpdateStatus = 'idle' | 'available' | 'updated'`
  - `type UseAppUpdateOptions = { app: AppId; currentVersion: string; needRefresh: boolean; hasUnsavedWork: boolean; installUpdate: () => void }`
  - `type UseAppUpdateResult = { status: UpdateStatus; availableVersion?: string; releaseNotes: ReleaseNotes | 'loading' | null; install: () => void }`

- [ ] **Step 1: Write the failing test**

Create `packages/fresco-ui/src/appUpdate/__tests__/useAppUpdate.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import useAppUpdate from '../useAppUpdate';

const okEmptyList = { ok: true, json: async () => [] };

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okEmptyList));
});
afterEach(() => vi.unstubAllGlobals());

describe('version-change detection', () => {
  it('reports "updated" when the stored version differs from the current one', async () => {
    localStorage.setItem('nc:lastLaunchedVersion:architect', '1.0.0');
    const { result } = renderHook(() =>
      useAppUpdate({
        app: 'architect',
        currentVersion: '2.0.0',
        needRefresh: false,
        hasUnsavedWork: false,
        installUpdate: vi.fn(),
      }),
    );
    await waitFor(() => expect(result.current.status).toBe('updated'));
    expect(localStorage.getItem('nc:lastLaunchedVersion:architect')).toBe(
      '2.0.0',
    );
  });

  it('stays "idle" on first-ever launch (no stored version)', async () => {
    const { result } = renderHook(() =>
      useAppUpdate({
        app: 'architect',
        currentVersion: '2.0.0',
        needRefresh: false,
        hasUnsavedWork: false,
        installUpdate: vi.fn(),
      }),
    );
    await waitFor(() =>
      expect(localStorage.getItem('nc:lastLaunchedVersion:architect')).toBe(
        '2.0.0',
      ),
    );
    expect(result.current.status).toBe('idle');
  });

  it('stays "idle" when the version is unchanged', async () => {
    localStorage.setItem('nc:lastLaunchedVersion:architect', '2.0.0');
    const { result } = renderHook(() =>
      useAppUpdate({
        app: 'architect',
        currentVersion: '2.0.0',
        needRefresh: false,
        hasUnsavedWork: false,
        installUpdate: vi.fn(),
      }),
    );
    await waitFor(() =>
      expect(localStorage.getItem('nc:lastLaunchedVersion:architect')).toBe(
        '2.0.0',
      ),
    );
    expect(result.current.status).toBe('idle');
  });
});

describe('auto-apply', () => {
  it('applies the update once when one is pending and no work is in progress', async () => {
    const installUpdate = vi.fn();
    const { result } = renderHook(() =>
      useAppUpdate({
        app: 'interviewer',
        currentVersion: '2.0.0',
        needRefresh: true,
        hasUnsavedWork: false,
        installUpdate,
      }),
    );
    await waitFor(() => expect(installUpdate).toHaveBeenCalledOnce());
    expect(result.current.status).toBe('available');
  });

  it('defers to the manual button when work is in progress', async () => {
    const installUpdate = vi.fn();
    const { result } = renderHook(() =>
      useAppUpdate({
        app: 'interviewer',
        currentVersion: '2.0.0',
        needRefresh: true,
        hasUnsavedWork: true,
        installUpdate,
      }),
    );
    await waitFor(() => expect(result.current.status).toBe('available'));
    expect(installUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run --project=unit src/appUpdate/__tests__/useAppUpdate.test.ts`
Expected: FAIL — `Cannot find module '../useAppUpdate'`.

- [ ] **Step 3: Implement `useAppUpdate.ts`**

Create `packages/fresco-ui/src/appUpdate/useAppUpdate.ts`:

```ts
import { useEffect, useRef, useState } from 'react';

import {
  type AppId,
  fetchLatestReleaseNotes,
  fetchReleaseNotesForVersion,
  readCachedNotes,
  type ReleaseNotes,
  writeCachedNotes,
} from './releaseNotes';

export type { AppId, ReleaseNotes };

export type UpdateStatus = 'idle' | 'available' | 'updated';

export type UseAppUpdateOptions = {
  app: AppId;
  currentVersion: string;
  needRefresh: boolean;
  hasUnsavedWork: boolean;
  installUpdate: () => void;
};

export type UseAppUpdateResult = {
  status: UpdateStatus;
  availableVersion?: string;
  releaseNotes: ReleaseNotes | 'loading' | null;
  install: () => void;
};

const lastVersionKey = (app: AppId) => `nc:lastLaunchedVersion:${app}`;

// Records the current version and reports whether the previous launch ran a
// different one. Called once (guarded by a ref) so the write happens exactly
// once per mount.
function detectJustUpdated(app: AppId, currentVersion: string): boolean {
  try {
    const previous = localStorage.getItem(lastVersionKey(app));
    localStorage.setItem(lastVersionKey(app), currentVersion);
    return previous !== null && previous !== currentVersion;
  } catch {
    return false;
  }
}

export default function useAppUpdate({
  app,
  currentVersion,
  needRefresh,
  hasUnsavedWork,
  installUpdate,
}: UseAppUpdateOptions): UseAppUpdateResult {
  const [justUpdated, setJustUpdated] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState<
    ReleaseNotes | 'loading' | null
  >(() => readCachedNotes(app));
  const [availableVersion, setAvailableVersion] = useState<
    string | undefined
  >();

  const detectedRef = useRef(false);
  const autoAppliedRef = useRef(false);
  const hasUnsavedWorkRef = useRef(hasUnsavedWork);
  hasUnsavedWorkRef.current = hasUnsavedWork;

  // Version-change detection runs exactly once.
  useEffect(() => {
    if (detectedRef.current) return;
    detectedRef.current = true;
    setJustUpdated(detectJustUpdated(app, currentVersion));
  }, [app, currentVersion]);

  // One-shot auto-apply: the first time an update is pending while no work is in
  // progress, apply it (which reloads). Later detections, or one arriving while
  // work is in progress, fall through to the manual button.
  useEffect(() => {
    if (!needRefresh || autoAppliedRef.current) return;
    autoAppliedRef.current = true;
    if (!hasUnsavedWorkRef.current) installUpdate();
  }, [needRefresh, installUpdate]);

  // An available update means we just completed an online SW check — fetch the
  // latest notes and cache them so the dialog (and the post-reload "updated"
  // state) can read them offline.
  useEffect(() => {
    if (!needRefresh) return undefined;
    let active = true;
    setReleaseNotes((prev) => (prev && prev !== 'loading' ? prev : 'loading'));
    void fetchLatestReleaseNotes(app).then((notes) => {
      if (!active || !notes) return;
      writeCachedNotes(app, notes);
      setReleaseNotes(notes);
      setAvailableVersion(notes.version);
    });
    return () => {
      active = false;
    };
  }, [needRefresh, app]);

  // On a "just updated" load, prefer the cached notes for the running version
  // (written when it was "available"); otherwise fetch them by tag.
  useEffect(() => {
    if (!justUpdated) return undefined;
    const cached = readCachedNotes(app);
    if (cached && cached.version === currentVersion) {
      setReleaseNotes(cached);
      return undefined;
    }
    let active = true;
    void fetchReleaseNotesForVersion(app, currentVersion).then((notes) => {
      if (!active || !notes) return;
      writeCachedNotes(app, notes);
      setReleaseNotes(notes);
    });
    return () => {
      active = false;
    };
  }, [justUpdated, app, currentVersion]);

  const status: UpdateStatus = needRefresh
    ? 'available'
    : justUpdated
      ? 'updated'
      : 'idle';

  return { status, availableVersion, releaseNotes, install: installUpdate };
}
```

- [ ] **Step 4: Add the `./appUpdate/useAppUpdate` package export**

In `packages/fresco-ui/package.json` `exports`, add:

```json
"./appUpdate/useAppUpdate": {
  "types": "./dist/appUpdate/useAppUpdate.d.ts",
  "default": "./dist/appUpdate/useAppUpdate.js"
},
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run --project=unit src/appUpdate/__tests__/useAppUpdate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/fresco-ui/src/appUpdate/useAppUpdate.ts packages/fresco-ui/src/appUpdate/__tests__/useAppUpdate.test.ts packages/fresco-ui/package.json
git commit -m "feat(fresco-ui): add useAppUpdate orchestration hook"
```

---

### Task 4: `AppUpdateIndicator` component (fresco-ui)

**Files:**

- Create: `packages/fresco-ui/src/appUpdate/AppUpdateIndicator.tsx`
- Create: `packages/fresco-ui/src/appUpdate/AppUpdateIndicator.stories.tsx`
- Modify: `packages/fresco-ui/package.json` (add `./appUpdate/AppUpdateIndicator` export)

**Interfaces:**

- Consumes: `Pill` (Task 1); `UpdateStatus`/`ReleaseNotes` from `useAppUpdate` (Task 3); fresco-ui `Dialog`, `Button`, `Icon`, `RenderMarkdown` + `ALLOWED_MARKDOWN_SECTION_TAGS`, `Tooltip`/`TooltipTrigger`/`TooltipContent`/`TooltipProvider`, `Paragraph`, `cx`.
- Produces (default export `AppUpdateIndicator`). Props:
  `{ status: UpdateStatus; appName: string; label: React.ReactNode; currentVersion: string; availableVersion?: string; releaseNotes: ReleaseNotes | 'loading' | null; onInstall: () => void; unsavedWorkCaveat?: React.ReactNode; size?: 'sm' | 'md' | 'lg'; className?: string; idleIcon?: React.ReactNode }`

- [ ] **Step 1: Implement `AppUpdateIndicator.tsx`**

Create `packages/fresco-ui/src/appUpdate/AppUpdateIndicator.tsx`:

```tsx
import { useState } from 'react';

import Button from '../Button';
import Dialog from '../dialogs/Dialog';
import Icon from '../Icon';
import Pill from '../Pill';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '../RenderMarkdown';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../Tooltip';
import Paragraph from '../typography/Paragraph';
import { cx } from '../utils/cva';
import type { ReleaseNotes, UpdateStatus } from './useAppUpdate';

type AppUpdateIndicatorProps = {
  status: UpdateStatus;
  appName: string;
  label: React.ReactNode;
  currentVersion: string;
  availableVersion?: string;
  releaseNotes: ReleaseNotes | 'loading' | null;
  onInstall: () => void;
  unsavedWorkCaveat?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  idleIcon?: React.ReactNode;
};

export default function AppUpdateIndicator({
  status,
  appName,
  label,
  currentVersion,
  availableVersion,
  releaseNotes,
  onInstall,
  unsavedWorkCaveat,
  size = 'md',
  className,
  idleIcon,
}: AppUpdateIndicatorProps) {
  const [open, setOpen] = useState(false);

  if (status === 'idle') {
    return (
      <Pill size={size} variant="ghost" className={className} icon={idleIcon}>
        {label}
      </Pill>
    );
  }

  const isAvailable = status === 'available';

  const pillButton = (
    <Pill
      as="button"
      size={size}
      variant="ghost"
      icon={
        <Icon name={isAvailable ? 'RefreshCw' : 'Check'} className="size-3.5" />
      }
      onClick={() => setOpen(true)}
      aria-label={
        isAvailable
          ? `An update is available. View what's new in ${appName}.`
          : `${appName} was updated. View what's new.`
      }
      className={cx(
        'focusable cursor-pointer transition-colors',
        isAvailable
          ? 'bg-sea-serpent/20 text-sea-serpent hover:bg-sea-serpent/30'
          : 'bg-sea-green/20 text-sea-green hover:bg-sea-green/30',
      )}
    >
      {label}
    </Pill>
  );

  const body =
    releaseNotes === 'loading' ? (
      <Paragraph margin="none">Loading release notes…</Paragraph>
    ) : releaseNotes ? (
      <RenderMarkdown allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}>
        {releaseNotes.body}
      </RenderMarkdown>
    ) : (
      <Paragraph margin="none">
        Release notes are unavailable right now.
      </Paragraph>
    );

  const shownVersion = isAvailable ? availableVersion : currentVersion;

  const footer = isAvailable ? (
    <>
      {unsavedWorkCaveat && (
        <div className="mr-auto max-w-sm text-sm">{unsavedWorkCaveat}</div>
      )}
      <Button color="primary" onClick={onInstall}>
        Install and reload
      </Button>
    </>
  ) : (
    <Button variant="text" onClick={() => setOpen(false)}>
      Close
    </Button>
  );

  return (
    <>
      {isAvailable ? (
        pillButton
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={pillButton} />
            <TooltipContent>{appName} was updated!</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <Dialog
        open={open}
        closeDialog={() => setOpen(false)}
        title={isAvailable ? 'Update available' : `What's new in ${appName}`}
        description={shownVersion ? `Version ${shownVersion}` : undefined}
        footer={footer}
      >
        {body}
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Add the `./appUpdate/AppUpdateIndicator` package export**

In `packages/fresco-ui/package.json` `exports`, add:

```json
"./appUpdate/AppUpdateIndicator": {
  "types": "./dist/appUpdate/AppUpdateIndicator.d.ts",
  "default": "./dist/appUpdate/AppUpdateIndicator.js"
},
```

- [ ] **Step 3: Write the stories with play tests**

Create `packages/fresco-ui/src/appUpdate/AppUpdateIndicator.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, screen, userEvent, within } from 'storybook/test';

import AppUpdateIndicator from './AppUpdateIndicator';

const NOTES = {
  version: '8.0.0-beta.4',
  body: "## What's new\n\n- A brighter sociogram\n- Faster protocol loading\n",
};

const meta = {
  title: 'Components/AppUpdateIndicator',
  component: AppUpdateIndicator,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: {
    appName: 'Architect',
    label: 'v8.0.0-beta.3',
    currentVersion: '8.0.0-beta.3',
    onInstall: fn(),
    releaseNotes: NOTES,
    size: 'md',
  },
} satisfies Meta<typeof AppUpdateIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: { status: 'idle' },
};

export const Available: Story = {
  args: {
    status: 'available',
    availableVersion: '8.0.0-beta.4',
    unsavedWorkCaveat:
      'Reloading updates this tab and any other open Architect tabs; unsaved changes in progress will be lost.',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: /update is available/i }),
    );
    await screen.findByRole('dialog');
    await expect(
      await screen.findByText(/A brighter sociogram/i),
    ).toBeInTheDocument();
    const install = await screen.findByRole('button', {
      name: 'Install and reload',
    });
    await userEvent.click(install);
    await expect(args.onInstall).toHaveBeenCalledOnce();
  },
};

export const Updated: Story = {
  args: { status: 'updated' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /was updated/i }));
    await screen.findByRole('dialog');
    await expect(
      await screen.findByText(/Faster protocol loading/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Install and reload' }),
    ).toBeNull();
  },
};
```

- [ ] **Step 4: Typecheck the package**

Run: `pnpm --filter @codaco/fresco-ui typecheck`
Expected: PASS (no errors). If `TooltipTrigger render={...}` reports a type error, confirm Base-UI's `Trigger` accepts `render`; the fresco-ui `Tooltip` re-exports `BaseTooltip.Trigger` which does.

- [ ] **Step 5: Run the storybook interaction tests (chromium)**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run --project=storybook AppUpdateIndicator`
Expected: PASS for `Available` and `Updated` play tests. (This is the CI storybook project; it drives a headless browser and can be slower/flakier locally — a green run of just these two stories is sufficient here.)

- [ ] **Step 6: Commit**

```bash
git add packages/fresco-ui/src/appUpdate/AppUpdateIndicator.tsx packages/fresco-ui/src/appUpdate/AppUpdateIndicator.stories.tsx packages/fresco-ui/package.json
git commit -m "feat(fresco-ui): add AppUpdateIndicator (pill + changelog dialog)"
```

---

### Task 5: Architect integration

**Files:**

- Create: `apps/architect/src/components/AppUpdate/AppUpdateProvider.tsx`
- Create: `apps/architect/src/components/AppUpdate/AppUpdatePill.tsx`
- Modify: `apps/architect/src/components/ViewManager/views/App.tsx`
- Modify: `apps/architect/src/components/Home/Home.tsx:25,39,237-239`
- Modify: `apps/architect/vite.config.ts` (connect-src)
- Delete: `apps/architect/src/components/PwaUpdateBanner.tsx`, `apps/architect/src/components/__tests__/PwaUpdateBanner.test.tsx`

**Interfaces:**

- Consumes: `@codaco/fresco-ui/appUpdate/useAppUpdate` (default + `UseAppUpdateResult`), `@codaco/fresco-ui/appUpdate/AppUpdateIndicator`.
- Produces: `AppUpdateProvider`, `useAppUpdateContext` (from `AppUpdateProvider.tsx`); `AppUpdatePill` (default).

- [ ] **Step 1: Create the provider**

Create `apps/architect/src/components/AppUpdate/AppUpdateProvider.tsx`:

```tsx
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import useAppUpdate, {
  type UseAppUpdateResult,
} from '@codaco/fresco-ui/appUpdate/useAppUpdate';
import { useAppSelector } from '~/ducks/hooks';
import { getStageDraftDirty } from '~/selectors/stageEditorDraft';
import {
  isCriticalOperationInProgress,
  subscribeCriticalOperation,
} from '~/utils/criticalOperation';
import { appVersion } from '~/utils/appVersion';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

type AppUpdateContextValue = UseAppUpdateResult & { hasUnsavedWork: boolean };

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null);

export function useAppUpdateContext(): AppUpdateContextValue {
  const value = useContext(AppUpdateContext);
  if (!value) {
    throw new Error(
      'useAppUpdateContext must be used within AppUpdateProvider',
    );
  }
  return value;
}

// Owns service-worker registration (so the app stays installable) and the
// update state, exposing it to the version pill via context. Replaces the old
// PwaUpdateBanner.
export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] = useState<
    ServiceWorkerRegistration | undefined
  >();

  // A reload discards an unsaved stage-editor draft, any open dialog, and any
  // in-flight import/export; gate auto-apply on these being clear.
  const draftDirty = useAppSelector(getStageDraftDirty);
  const hasOpenDialog = useAppSelector(
    (state) => state.dialogs.dialogs.length > 0,
  );
  const criticalOperationInProgress = useSyncExternalStore(
    subscribeCriticalOperation,
    isCriticalOperationInProgress,
    () => false,
  );
  const hasUnsavedWork =
    draftDirty || hasOpenDialog || criticalOperationInProgress;

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_swScriptUrl, swRegistration) => {
      setRegistration(swRegistration);
    },
  });

  useEffect(() => {
    if (!registration) return undefined;
    const intervalId = window.setInterval(() => {
      void registration.update();
    }, UPDATE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [registration]);

  const installUpdate = useCallback(
    () => void updateServiceWorker(true),
    [updateServiceWorker],
  );

  const update = useAppUpdate({
    app: 'architect',
    currentVersion: appVersion,
    needRefresh,
    hasUnsavedWork,
    installUpdate,
  });

  return (
    <AppUpdateContext.Provider value={{ ...update, hasUnsavedWork }}>
      {children}
    </AppUpdateContext.Provider>
  );
}
```

- [ ] **Step 2: Create the pill wrapper**

Create `apps/architect/src/components/AppUpdate/AppUpdatePill.tsx`:

```tsx
import AppUpdateIndicator from '@codaco/fresco-ui/appUpdate/AppUpdateIndicator';

import { appVersion } from '~/utils/appVersion';

import { useAppUpdateContext } from './AppUpdateProvider';

const UNSAVED_WORK_CAVEAT =
  'Reloading updates this tab and any other open Architect tabs; unsaved changes in progress will be lost.';

export default function AppUpdatePill() {
  const { status, availableVersion, releaseNotes, install } =
    useAppUpdateContext();

  return (
    <AppUpdateIndicator
      status={status}
      appName="Architect"
      label={`v${appVersion}`}
      currentVersion={appVersion}
      availableVersion={availableVersion}
      releaseNotes={releaseNotes}
      onInstall={install}
      unsavedWorkCaveat={UNSAVED_WORK_CAVEAT}
      size="md"
      className="bg-platinum text-charcoal shadow-sm"
      idleIcon={<span className="bg-active h-2 w-2 rounded-full" />}
    />
  );
}
```

- [ ] **Step 3: Wrap the app with the provider and remove the banner**

In `apps/architect/src/components/ViewManager/views/App.tsx`:

Remove the import `import PwaUpdateBanner from '~/components/PwaUpdateBanner';` and add:

```tsx
import { AppUpdateProvider } from '~/components/AppUpdate/AppUpdateProvider';
```

Remove these lines from `AppContents`:

```tsx
{
  /* The update banner registers the service worker (so the app is
          installable) and prompts on updates. */
}
<PwaUpdateBanner />;
```

Change `AppView` to wrap `AppContents` with the provider:

```tsx
const AppView = () => (
  <ProtocolGuardedRouter>
    <AppUpdateProvider>
      <AppContents />
    </AppUpdateProvider>
  </ProtocolGuardedRouter>
);
```

- [ ] **Step 4: Replace the version Badge in Home**

In `apps/architect/src/components/Home/Home.tsx`:

Remove `import Badge from '~/components/Badge';` (line 25) and `import { appVersion } from '~/utils/appVersion';` (line 39); add:

```tsx
import AppUpdatePill from '~/components/AppUpdate/AppUpdatePill';
```

Replace the version Badge (lines 237–239):

```tsx
<Badge color="platinum">
  <span className="bg-active h-2 w-2 rounded-full" />v{appVersion}
</Badge>
```

with:

```tsx
<AppUpdatePill />
```

- [ ] **Step 5: Add `api.github.com` to the CSP**

In `apps/architect/vite.config.ts`, change the `connect-src` directive to add `https://api.github.com`:

```ts
  "connect-src 'self' data: blob: https://api.github.com https://api.mapbox.com https://events.mapbox.com https://ph-relay.networkcanvas.com https://fonts.googleapis.com https://fonts.gstatic.com",
```

- [ ] **Step 6: Delete the old banner and its test**

```bash
git rm apps/architect/src/components/PwaUpdateBanner.tsx apps/architect/src/components/__tests__/PwaUpdateBanner.test.tsx
```

- [ ] **Step 7: Typecheck architect**

Run: `pnpm --filter @codaco/architect typecheck`
Expected: PASS. (If it reports fresco-ui subpath types missing, the fresco-ui dist is stale — run `turbo run build --filter=@codaco/fresco-ui` first.)

- [ ] **Step 8: Commit**

```bash
git add apps/architect
git commit -m "feat(architect): replace update toast with version update indicator"
```

---

### Task 6: Interviewer integration

**Files:**

- Create: `apps/interviewer/src/components/AppUpdate/AppUpdateProvider.tsx`
- Create: `apps/interviewer/src/components/AppUpdate/AppUpdatePill.tsx`
- Modify: `apps/interviewer/src/App.tsx`
- Modify: `apps/interviewer/src/components/StatusRow.tsx`
- Modify: `apps/interviewer/vite.renderer.config.ts` (connect-src)
- Delete: `apps/interviewer/src/components/PwaUpdateBanner.tsx`, `apps/interviewer/src/components/PwaUpdateBanner.stories.tsx`, `apps/interviewer/src/components/__tests__/PwaUpdateBanner.test.tsx`

**Interfaces:**

- Consumes: `@codaco/fresco-ui/appUpdate/useAppUpdate`, `@codaco/fresco-ui/appUpdate/AppUpdateIndicator`; `APP_VERSION` from `~/lib/appVersion`.
- Produces: `AppUpdateProvider`, `useAppUpdateContext`; `AppUpdatePill` (default).

- [ ] **Step 1: Create the provider**

Create `apps/interviewer/src/components/AppUpdate/AppUpdateProvider.tsx`:

```tsx
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLocation } from 'wouter';

import useAppUpdate, {
  type UseAppUpdateResult,
} from '@codaco/fresco-ui/appUpdate/useAppUpdate';

import { APP_VERSION } from '~/lib/appVersion';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

type AppUpdateContextValue = UseAppUpdateResult & { hasUnsavedWork: boolean };

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null);

export function useAppUpdateContext(): AppUpdateContextValue {
  const value = useContext(AppUpdateContext);
  if (!value) {
    throw new Error(
      'useAppUpdateContext must be used within AppUpdateProvider',
    );
  }
  return value;
}

// Owns service-worker registration (so the app stays installable/offline) and
// the update state, exposing it to the version pill via context. Replaces the
// old PwaUpdateBanner. A reload during an interview would interrupt data
// collection, so `/interview/*` counts as work in progress.
export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const hasUnsavedWork = location.startsWith('/interview/');

  const [registration, setRegistration] = useState<
    ServiceWorkerRegistration | undefined
  >();

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_swScriptUrl, swRegistration) => {
      setRegistration(swRegistration);
    },
  });

  useEffect(() => {
    if (!registration) return undefined;
    const intervalId = window.setInterval(() => {
      void registration.update();
    }, UPDATE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [registration]);

  const installUpdate = useCallback(
    () => void updateServiceWorker(true),
    [updateServiceWorker],
  );

  const update = useAppUpdate({
    app: 'interviewer',
    currentVersion: APP_VERSION,
    needRefresh,
    hasUnsavedWork,
    installUpdate,
  });

  return (
    <AppUpdateContext.Provider value={{ ...update, hasUnsavedWork }}>
      {children}
    </AppUpdateContext.Provider>
  );
}
```

- [ ] **Step 2: Create the pill wrapper**

Create `apps/interviewer/src/components/AppUpdate/AppUpdatePill.tsx`:

```tsx
import AppUpdateIndicator from '@codaco/fresco-ui/appUpdate/AppUpdateIndicator';

import { APP_VERSION } from '~/lib/appVersion';

import { useAppUpdateContext } from './AppUpdateProvider';

const UPDATE_CAVEAT =
  'Your saved responses are kept when the update is applied.';

export default function AppUpdatePill() {
  const { status, availableVersion, releaseNotes, install } =
    useAppUpdateContext();

  return (
    <AppUpdateIndicator
      status={status}
      appName="Interviewer"
      label={`Interviewer ${APP_VERSION}`}
      currentVersion={APP_VERSION}
      availableVersion={availableVersion}
      releaseNotes={releaseNotes}
      onInstall={install}
      unsavedWorkCaveat={UPDATE_CAVEAT}
      size="sm"
    />
  );
}
```

- [ ] **Step 3: Wrap the app with the provider and remove the banner**

In `apps/interviewer/src/App.tsx`:

Remove `import PwaUpdateBanner from './components/PwaUpdateBanner';` and add:

```tsx
import { AppUpdateProvider } from './components/AppUpdate/AppUpdateProvider';
```

Remove the `<PwaUpdateBanner />` element (line 50) and wrap the app content with the provider. The `<AppProviders>` block becomes:

```tsx
<AppProviders>
  <AppUpdateProvider>
    <AnimatePresence>
      {showBackgroundLights && (
        <motion.div
          key="background-lights"
          className="fixed inset-0 -z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.8 }}
          exit={{ opacity: 0, transition: { duration: 0.5 } }}
          transition={{ duration: 2 }}
        >
          <BackgroundLights
            large={0}
            medium={4}
            small={0}
            blendMode="color-dodge"
            speedFactor={30}
          />
        </motion.div>
      )}
    </AnimatePresence>
    <AuthGate>
      <AnimatePresence mode="wait">
        <motion.div
          key={pageKeyFor(location)}
          variants={pageWrapperVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="h-full"
        >
          <Switch location={location}>
            <Route path="/welcome" component={WelcomeRoute} />
            <Route path="/interview/:sessionId">
              {({ sessionId }) => <InterviewRoute sessionId={sessionId} />}
            </Route>
            <Route path="/:view?">
              {(params) => {
                if (params.view !== undefined && params.view !== 'data') {
                  return <NotFoundRoute />;
                }
                return <HomeRoute />;
              }}
            </Route>
            <Route component={NotFoundRoute} />
          </Switch>
        </motion.div>
      </AnimatePresence>
    </AuthGate>
  </AppUpdateProvider>
</AppProviders>
```

- [ ] **Step 4: Render the pill in StatusRow and widen the gap**

In `apps/interviewer/src/components/StatusRow.tsx`:

Add the import (top of file):

```tsx
import AppUpdatePill from './AppUpdate/AppUpdatePill';
```

Add a `versionSlot` prop to `StatusRowView` (keeping it pure and story-safe). Change its props type and signature:

```tsx
export function StatusRowView({
  protocolCount,
  interviewCount,
  mode,
  durability,
  versionSlot = <span>Interviewer {APP_VERSION}</span>,
}: {
  protocolCount: number;
  interviewCount: number;
  mode: AuthMode | undefined;
  durability: Durability | null;
  versionSlot?: React.ReactNode;
}) {
```

(Add `import type React from 'react';` if not already imported.)

Change the right-hand status group from `gap-3.5` to `gap-6`:

```tsx
      <div className="flex items-center gap-6">
```

Replace the version span:

```tsx
<span>Interviewer {APP_VERSION}</span>
```

with:

```tsx
{
  versionSlot;
}
```

In the `StatusRow` container, pass the real pill:

```tsx
<StatusRowView
  protocolCount={protocolCount}
  interviewCount={interviewCount}
  mode={mode}
  durability={durability}
  versionSlot={<AppUpdatePill />}
/>
```

- [ ] **Step 5: Add `api.github.com` to the CSP**

In `apps/interviewer/vite.renderer.config.ts`, change the `connect-src` directive:

```ts
  `connect-src 'self' https://api.github.com https://api.mapbox.com https://events.mapbox.com ${POSTHOG_RELAY_ORIGIN}`,
```

- [ ] **Step 6: Delete the old banner, its story, and its test**

```bash
git rm apps/interviewer/src/components/PwaUpdateBanner.tsx apps/interviewer/src/components/PwaUpdateBanner.stories.tsx apps/interviewer/src/components/__tests__/PwaUpdateBanner.test.tsx
```

- [ ] **Step 7: Typecheck interviewer**

Run: `pnpm --filter @codaco/interviewer typecheck`
Expected: PASS. (If fresco-ui subpath types are missing, run `turbo run build --filter=@codaco/fresco-ui` first.)

- [ ] **Step 8: Commit**

```bash
git add apps/interviewer
git commit -m "feat(interviewer): replace update toast with version update indicator"
```

---

### Task 7: Changesets + full verification

**Files:**

- Create: `.changeset/<generated-name>.md` (library) and `.changeset/<generated-name>.md` (apps)

- [ ] **Step 1: Create the library changeset**

Use the `creating-a-changeset` skill, or write `.changeset/pill-app-update-indicator.md`:

```markdown
---
'@codaco/fresco-ui': minor
---

Add a `Pill` component and an `AppUpdateIndicator` (with the `useAppUpdate` hook) for surfacing app version and update state with a changelog dialog.
```

- [ ] **Step 2: Create the apps changeset**

Write `.changeset/app-update-experience.md`:

```markdown
---
'@codaco/architect': minor
'@codaco/interviewer': minor
---

Replace the update toast with a version indicator that shows when an update is available or has just been applied, and displays the release changelog. Updates now apply automatically on a fresh load when no work is in progress.
```

- [ ] **Step 3: Run the full quality gate**

Run: `pnpm typecheck && pnpm lint:fix && pnpm knip`
Expected: all pass. Investigate any `knip` "unused export" hits — every new fresco-ui export (`Pill`, `pillVariants`, `useAppUpdate`, `AppUpdateIndicator`) is consumed by a story or an app, so they should not be flagged; `selectLatestForApp` is consumed only by its test, which is expected for a `knip`-tested export (leave it exported for the test, or inline-test via the fetch path if `knip` flags it).

- [ ] **Step 4: Run the fresco-ui unit tests**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run --project=unit src/Pill.test.tsx src/appUpdate`
Expected: PASS (all Pill + appUpdate tests).

- [ ] **Step 5: Build both apps**

Run: `turbo run build --filter=@codaco/architect --filter=@codaco/interviewer`
Expected: both builds succeed (this also verifies the injected CSP meta and the fresco-ui subpath imports resolve in a production build).

- [ ] **Step 6: Visual verification (manual, per project convention)**

Run the fresco-ui storybook and confirm `Components/AppUpdateIndicator` in BOTH the Dashboard and Interview themes: idle pill is monospace and un-boxed; `available` is a sea-serpent semi-transparent button with a refresh icon that opens the dialog with a scrollable changelog + "Install and reload"; `updated` is a sea-green button with the "was updated" tooltip and a dialog without the install action. Confirm the sea-serpent/sea-green colours are legible on the interview dark theme.

```bash
pnpm --filter @codaco/fresco-ui storybook
```

- [ ] **Step 7: Commit**

```bash
git add .changeset
git commit -m "chore: changesets for app update experience"
```

---

## Self-Review

**Spec coverage:**

- Shared `Pill` (monospace, size, icon, bg/border-without-spacing-shift) → Task 1. ✓
- Replace architect version pill / interviewer version string → Tasks 5, 6. ✓
- Interviewer: update-available sea-serpent button + dialog with markdown in inset scroll area + "Install and reload" + caveat → Task 4 (`AppUpdateIndicator`) + Task 6. ✓
- Interviewer: auto-update on fresh load; just-updated sea-green button + tooltip + dialog without install → Tasks 3 (auto-apply + detection), 4, 6. ✓
- Remove interviewer toast → Task 6. ✓
- Increase gap between encryption/persistence/version → Task 6, Step 4 (`gap-3.5`→`gap-6`). ✓
- Architect: same system, top-right nav, white-bg-no-border via custom classes, remove toast → Task 5 (`className="bg-platinum text-charcoal shadow-sm"`). ✓
- Changelog pulled from GitHub release, cached at detection → Tasks 2, 3. ✓
- CSP `api.github.com` → Tasks 5, 6. ✓
- Storybook coverage → Tasks 1, 4. ✓

**Placeholder scan:** none — every step contains full code or an exact command.

**Type consistency:** `AppId`, `ReleaseNotes`, `UpdateStatus`, `UseAppUpdateResult`, `UseAppUpdateOptions` are defined in Tasks 2–3 and consumed with the same names in Task 4 and the app providers (Tasks 5–6). `Pill`/`pillVariants`/`PillProps` from Task 1 are consumed by name in Task 4. The `AppUpdateIndicator` prop names (`status`, `label`, `currentVersion`, `availableVersion`, `releaseNotes`, `onInstall`, `unsavedWorkCaveat`, `size`, `className`, `idleIcon`) match between Task 4 and both app pill wrappers.
