# Architect Home CTA Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Architect home CTAs to sea green/slate blue at the Fresco medium button size.

**Architecture:** Keep both actions in `Home.tsx` and continue composing the shared Fresco `Button`. Change only their size props and the Open button's local component color tokens, with a focused render test that observes the generated button classes.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Tailwind CSS v4, `@codaco/fresco-ui`

## Global Constraints

- Both CTA buttons must use `size="md"`.
- Create must remain `color="primary"`, which maps to Architect sea green.
- Open must use `--accent` and `--accent-contrast`, which map to Architect slate blue and its readable foreground.
- Preserve labels, icons, actions, order, wrapping behavior, focus behavior, and surrounding layout.
- Do not redefine Architect's global `secondary` token or expand the shared Fresco Button API.
- Do not add hardcoded colors, `any`, assertions, ignore rules, barrel files, or convenience re-exports.

---

### Task 1: Restore the Home CTA presentation

**Files:**

- Create: `apps/architect/src/components/Home/__tests__/Home.test.tsx`
- Modify: `apps/architect/src/components/Home/Home.tsx:296-312`

**Interfaces:**

- Consumes: the existing `Button` size prop and local CSS custom-property utilities
- Produces: the existing default-exported `Home` component with unchanged props and action behavior

- [ ] **Step 1: Add the focused failing test**

Create `Home.test.tsx` with lightweight mocks for Home's application
dependencies, render the real `Home` and Fresco buttons, and assert the desired
medium size and accent tokens:

```tsx
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const openFileDialogMock = vi.hoisted(() => vi.fn());

vi.mock('react-dropzone', () => ({
  useDropzone: () => ({
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    isDragActive: false,
    open: openFileDialogMock,
  }),
}));

vi.mock('~/components/AppUpdate/AppUpdatePill', () => ({
  default: () => null,
}));

vi.mock('~/components/NewProtocolDialog', () => ({
  default: () => null,
}));

vi.mock('~/components/ProjectNav/NavShell', () => ({
  default: ({ trailing }: { trailing: ReactNode }) => <nav>{trailing}</nav>,
}));

vi.mock('~/components/protocolOpenDialogs', () => ({
  showProtocolOpenResultDialog: vi.fn(),
}));

vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => vi.fn(),
}));

vi.mock('~/ducks/modules/userActions/userActions', () => ({
  createNetcanvas: vi.fn(),
  openBundledTemplate: vi.fn(),
  openLibraryProtocol: vi.fn(),
  openLocalNetcanvas: vi.fn(),
}));

vi.mock('~/templates', () => ({
  BUNDLED_TEMPLATES: [],
}));

vi.mock('~/templates/sample-protocol', () => ({
  loadSampleAssets: vi.fn(),
  sampleProtocol: {},
}));

vi.mock('../LibraryPanel', () => ({ default: () => null }));
vi.mock('../ProtocolLoadingOverlay', () => ({ default: () => null }));
vi.mock('../TransitMap', () => ({ default: () => null }));

import Home from '../Home';

describe('<Home />', () => {
  it('uses medium brand-colored call-to-action buttons', () => {
    render(<Home />);

    const createButton = screen.getByRole('button', {
      name: 'Create a new protocol',
    });
    const openButton = screen.getByRole('button', {
      name: 'Open existing protocol',
    });

    expect(createButton).toHaveClass('h-12', 'text-base');
    expect(openButton).toHaveClass('h-12', 'text-base');
    expect(openButton).toHaveClass(
      '[--component-bg:var(--accent-contrast)]',
      '[--component-text:var(--accent)]',
      'focus:outline-accent',
    );
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @codaco/architect exec vitest run src/components/Home/__tests__/Home.test.tsx --reporter=verbose
```

Expected: FAIL because both current CTAs generate `h-16 text-lg`, and Open
does not carry the accent component tokens.

- [ ] **Step 3: Apply the minimal CTA prop changes**

Replace the two CTA button declarations in `Home.tsx` with:

```tsx
<Button
  size="md"
  color="primary"
  onClick={() => setShowNewDialog(true)}
>
  <FilePlus />
  Create a new protocol
</Button>
<Button
  size="md"
  className="focus:outline-accent [--component-bg:var(--accent-contrast)] [--component-text:var(--accent)]"
  onClick={openFileDialog}
>
  <FolderOpen />
  Open existing protocol
</Button>
```

- [ ] **Step 4: Format, lint, and verify GREEN**

Run:

```bash
pnpm exec oxfmt apps/architect/src/components/Home/Home.tsx apps/architect/src/components/Home/__tests__/Home.test.tsx docs/superpowers/specs/2026-07-12-architect-home-cta-styling-design.md docs/superpowers/plans/2026-07-12-architect-home-cta-styling.md
pnpm exec oxlint --fix apps/architect/src/components/Home/Home.tsx apps/architect/src/components/Home/__tests__/Home.test.tsx
pnpm --filter @codaco/architect exec vitest run src/components/Home/__tests__/Home.test.tsx --reporter=verbose
pnpm --filter @codaco/architect typecheck
pnpm knip
```

Expected: all commands exit successfully with no new warnings or errors.

- [ ] **Step 5: Inspect the representative desktop layout**

Run Architect, inspect the landing page at a 1440 × 900 viewport, verify the
two buttons remain inline and visually balanced, confirm the browser console
has no errors, and capture the updated screenshot.

- [ ] **Step 6: Commit the verified change**

Run:

```bash
git add apps/architect/src/components/Home/Home.tsx apps/architect/src/components/Home/__tests__/Home.test.tsx docs/superpowers/specs/2026-07-12-architect-home-cta-styling-design.md docs/superpowers/plans/2026-07-12-architect-home-cta-styling.md
git commit -m "style(architect): restore home action hierarchy"
```

Expected: one commit containing the CTA styling change, its regression test,
and its design and implementation documentation.
