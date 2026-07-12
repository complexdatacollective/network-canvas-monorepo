# Segmented Toolbar Colored Hover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep filled SegmentedToolbar actions in their supplied color on hover, including Architect's Download and Finished Editing buttons.

**Architecture:** Forward an optional Fresco Button `variant` through `SegmentContent`, while retaining `text` as the default for every existing toolbar segment. Filled consumers opt into the Button `default` variant so the text variant's neutral hover rule is absent and their token-based background remains authoritative.

**Tech Stack:** React, TypeScript, Fresco UI, Base UI Toolbar, Tailwind CSS v4, Vitest, Testing Library.

## Global Constraints

- Preserve the current `text` variant for every segment that omits `variant`.
- Do not change the global Fresco Button variants or theme tokens.
- Preserve labels, icons, handlers, disabled state, tooltips, roving focus, orientation, and keyboard behavior.
- Use design-token utilities; do not introduce hardcoded colors.
- Keep the Fresco UI library and Architect app release notes in separate changeset files.
- Use test-first development and verify the failing test before production changes.

---

### Task 1: Forward the Button variant through SegmentedToolbar

**Files:**

- Modify: `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.test.tsx`
- Modify: `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx`
- Modify: `packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.stories.tsx`

**Interfaces:**

- Consumes: `ButtonProps['variant']` from `packages/fresco-ui/src/Button.tsx`.
- Produces: `SegmentContent.variant?: ButtonProps['variant']`; `segmentButton()` forwards it and defaults to `'text'`.

- [ ] **Step 1: Strengthen the color regression test**

Update the existing SegmentedToolbar color test so the filled segment opts into the default Button variant and the assertion rejects the text variant's neutral hover class:

```tsx
describe('SegmentedToolbar — colour', () => {
  it('uses the supplied variant without a text-button hover override', () => {
    const items: ToolbarSegment[] = [
      {
        type: 'button',
        id: 'delete',
        label: 'Delete',
        icon: <Trash2 />,
        variant: 'default',
        className: 'bg-tomato text-white',
        onClick: vi.fn(),
      },
    ];
    render(<SegmentedToolbar label="Tools" items={items} />);

    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toHaveClass('bg-tomato');
    expect(button).toHaveClass('text-white');
    expect(button).not.toHaveClass('hover:enabled:bg-(--component-text)');
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm --filter @codaco/fresco-ui exec vitest run src/SegmentedToolbar/SegmentedToolbar.test.tsx --reporter=verbose
```

Expected: TypeScript/Vitest fails because `variant` is not a property of `ToolbarSegment`, or the rendered button still contains `hover:enabled:bg-(--component-text)`.

- [ ] **Step 3: Forward the variant with a backward-compatible default**

Change the Button import and extend `SegmentContent`:

```tsx
import { Button, type ButtonProps } from '../Button';

export type SegmentContent = {
  label: string;
  icon?: React.ReactNode;
  showLabel?: boolean;
  /** Fresco Button variant. @default 'text' */
  variant?: ButtonProps['variant'];
  className?: string;
};
```

Forward it in `segmentButton()`:

```tsx
<Button
  variant={content.variant ?? 'text'}
  size={size}
  icon={content.icon}
  aria-label={labelVisible ? undefined : content.label}
  className={cx(
    'rounded-full',
    !labelVisible && 'aspect-square p-0',
    extraClassName,
    content.className,
  )}
>
  {labelVisible ? content.label : null}
</Button>
```

- [ ] **Step 4: Update the documented filled-color examples**

Add `variant: 'default'` to every filled segment in `sampleItems` and the `Colours` story. Keep the existing named token classes unchanged:

```tsx
{
  type: 'button',
  id: 'done',
  label: 'Done',
  showLabel: true,
  variant: 'default',
  className: 'bg-sea-green text-white',
  onClick: noop,
}
```

- [ ] **Step 5: Run the focused library test and verify GREEN**

Run:

```bash
pnpm --filter @codaco/fresco-ui exec vitest run src/SegmentedToolbar/SegmentedToolbar.test.tsx --reporter=verbose
```

Expected: 21 tests pass, including the fallback-variant coverage and the
strengthened color regression.

- [ ] **Step 6: Format and lint the task files**

Run:

```bash
pnpm exec oxlint --fix packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.test.tsx packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.stories.tsx
pnpm exec oxfmt packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.test.tsx packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.stories.tsx
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit the shared component change**

```bash
git add packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.test.tsx packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.stories.tsx
git commit -m "fix(fresco-ui): preserve filled toolbar colors on hover"
```

### Task 2: Opt Architect's filled actions into the default variant

**Files:**

- Modify: `apps/architect/src/components/__tests__/ProjectActions.test.tsx`
- Modify: `apps/architect/src/components/ProjectNav/ProjectActions.tsx`
- Modify: `apps/architect/src/components/ProjectNav/StageEditorNav.tsx`

**Interfaces:**

- Consumes: `SegmentContent.variant?: ButtonProps['variant']` from Task 1.
- Produces: Download and Finished Editing render as filled default-variant buttons with the existing sea-green/white token classes.

- [ ] **Step 1: Add an Architect regression assertion for Download**

Add this test before the existing export-flow test:

```tsx
it('keeps the Download action filled on hover', () => {
  const store = createTestStore();
  render(<ProjectActions />, { wrapper: wrap(store) });

  const downloadButton = screen.getByRole('button', { name: /^download$/i });
  expect(downloadButton).toHaveClass('bg-sea-green');
  expect(downloadButton).toHaveClass('text-white');
  expect(downloadButton).not.toHaveClass('hover:enabled:bg-(--component-text)');
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm --filter @codaco/architect exec vitest run src/components/__tests__/ProjectActions.test.tsx --reporter=verbose
```

Expected: the new assertion fails because Download still inherits the text variant's `hover:enabled:bg-(--component-text)` class.

- [ ] **Step 3: Opt both filled Architect actions into the default variant**

Add the same property to the Download segment in `ProjectActions.tsx` and Finished Editing segment in `StageEditorNav.tsx`:

```tsx
variant: 'default',
className: 'bg-sea-green text-white',
```

Do not change labels, icons, handlers, conditions, or surrounding separators.

- [ ] **Step 4: Run the Architect regression test and verify GREEN**

Run:

```bash
pnpm --filter @codaco/architect exec vitest run src/components/__tests__/ProjectActions.test.tsx --reporter=verbose
```

Expected: all ProjectActions tests pass.

- [ ] **Step 5: Format and lint the Architect task files**

Run:

```bash
pnpm exec oxlint --fix apps/architect/src/components/ProjectNav/ProjectActions.tsx apps/architect/src/components/ProjectNav/StageEditorNav.tsx apps/architect/src/components/__tests__/ProjectActions.test.tsx
pnpm exec oxfmt apps/architect/src/components/ProjectNav/ProjectActions.tsx apps/architect/src/components/ProjectNav/StageEditorNav.tsx apps/architect/src/components/__tests__/ProjectActions.test.tsx
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit the Architect consumer change**

```bash
git add apps/architect/src/components/ProjectNav/ProjectActions.tsx apps/architect/src/components/ProjectNav/StageEditorNav.tsx apps/architect/src/components/__tests__/ProjectActions.test.tsx
git commit -m "fix(architect): retain action colors on hover"
```

### Task 3: Verify the branch and add release notes

**Files:**

- Create: two generated `.changeset/*.md` files, one for `@codaco/fresco-ui` and one for `@codaco/architect`.

**Interfaces:**

- Consumes: the completed library and Architect changes from Tasks 1 and 2.
- Produces: separate patch release notes for the library and app release lanes.

- [ ] **Step 1: Run focused regression suites**

Run:

```bash
pnpm --filter @codaco/fresco-ui exec vitest run src/SegmentedToolbar/SegmentedToolbar.test.tsx --reporter=verbose
pnpm --filter @codaco/architect exec vitest run src/components/__tests__/ProjectActions.test.tsx src/components/__tests__/InstallBanner.test.tsx src/components/Home/__tests__/Home.test.tsx --reporter=verbose
```

Expected: all focused tests pass.

- [ ] **Step 2: Run repository quality gates**

Run:

```bash
pnpm lint:fix
pnpm typecheck
pnpm knip
```

Expected: every command exits 0; existing repository warnings may remain, but no new errors are introduced.

- [ ] **Step 3: Verify the rendered hover state in Architect**

Start Architect:

```bash
pnpm --filter @codaco/architect dev
```

Open the timeline view and record Download's computed background before and during hover; verify the two values match. Open a stage with unsaved changes and make the same comparison for Finished Editing. Confirm no browser console errors, then stop the server.

- [ ] **Step 4: Generate the Fresco UI library changeset**

Run `pnpm changeset` and select only `@codaco/fresco-ui`, patch. Use this reader-facing summary:

```text
Keep filled segmented-toolbar actions in their supplied color when hovered.
```

- [ ] **Step 5: Generate the Architect app changeset**

Run `pnpm changeset` again and select only `@codaco/architect`, patch. Use this reader-facing summary:

```text
Keep Download and Finished Editing actions sea green when hovered.
```

- [ ] **Step 6: Verify changeset lanes and commit**

Run:

```bash
pnpm check:changesets
git diff --check
git status --short
```

Expected: changeset validation passes, the diff has no whitespace errors, and only the two generated changeset files are uncommitted.

Commit:

```bash
git add .changeset
git commit -m "chore: add toolbar hover release notes"
```

### Task 4: Open and monitor the pull request

**Files:**

- Read: `.github/PULL_REQUEST_TEMPLATE.md` or `.github/PULL_REQUEST_TEMPLATE/*` when present.

**Interfaces:**

- Consumes: the clean, verified feature branch with separate library and app changesets.
- Produces: a GitHub pull request that remains monitored until checks pass and no actionable review feedback remains.

- [ ] **Step 1: Confirm final branch state**

```bash
git status --short
git branch --show-current
git log --oneline origin/main..HEAD
```

Expected: clean status on `codex/architect-install-warning-banner` with the complete banner, CTA, and toolbar-hover commits.

- [ ] **Step 2: Push the feature branch**

```bash
git push -u origin codex/architect-install-warning-banner
```

- [ ] **Step 3: Open the pull request**

Create a PR with a title under 70 characters and a body that follows the repository template. The summary must cover the warning install banner, restored home CTA hierarchy, and corrected segmented-toolbar hover behavior. The test plan must list focused tests, lint/format, typecheck, `knip`, changeset validation, and browser verification.

- [ ] **Step 4: Monitor CI and review feedback**

Run:

```bash
PR_NUMBER="$(gh pr view --json number --jq .number)"
gh pr checks "$PR_NUMBER" --json name,state,bucket,link
gh pr view "$PR_NUMBER" --json reviews,latestReviews,mergeStateStatus
gh api "repos/complexdatacollective/network-canvas/pulls/$PR_NUMBER/comments"
```

Expected: all checks pass or skip, merge state is not blocked by code, and there are no unresolved actionable comments. Diagnose and fix any genuine failure locally, re-run the quality gates, commit, push normally, and recheck. Do not merge the PR.
