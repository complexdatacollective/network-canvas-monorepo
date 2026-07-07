# Family Pedigree Interface Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Add sibling" discoverable (visible-but-disabled with a hint when it can't apply, instead of hidden) and prove first cousins can be represented and created via the wizards with Storybook stories.

**Architecture:** Keep the existing `canAddSibling` rule (a sibling needs an existing shared parent) and `siblingCellTransform` unchanged; change only `NodeContextMenu` to always render the item, disabled with an inline hint when `canAddSibling` is false. First cousins already render ("Cousin" via `getDisplayLabel`); the work is two Storybook stories (representation + creation-via-wizard).

**Tech Stack:** React, `@codaco/fresco-ui` (Base UI `Menu`), Vitest, Storybook (`@storybook/test`, `SyntheticInterview`, `StoryInterviewShell`).

## Global Constraints

- **No `any` types; no `as` assertions to bypass type errors; no barrel files.**
- **Keep the shared-parent rule** — do NOT relax `canAddSibling` or make `siblingCellTransform` create+link new parents to the anchor (explicitly rejected in the spec).
- **Inline hint, not a hover tooltip** — interviews run on touch tablets where hover/disabled-item tooltips are unreliable.
- **NEVER run e2e/Playwright locally** — CI owns e2e. Storybook play stories run via the interview `units`/storybook test projects.
- Reference spec: `docs/superpowers/specs/2026-06-26-pedigree-interface-fixes-design.md`.

---

## File Structure

- `packages/fresco-ui/src/DropdownMenu.tsx` (modify) — ensure `DropdownMenuItem` forwards `disabled` to Base UI `Menu.Item`.
- `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/components/NodeContextMenu.tsx` (modify) — always render "Add sibling"; disabled + inline hint when `!canAddSibling`.
- `packages/interview/src/interfaces/FamilyPedigree/FamilyPedigree.cousins.stories.tsx` (new) — representation + creation stories.

---

## Task 1: `DropdownMenuItem` forwards `disabled`

**Files:**

- Modify: `packages/fresco-ui/src/DropdownMenu.tsx`
- Test: `packages/fresco-ui/src/__tests__/DropdownMenu.test.tsx` (create if absent)

**Interfaces:**

- Produces: `DropdownMenuItem` accepting `disabled?: boolean` and forwarding it to Base UI `Menu.Item`; a disabled item does not fire `onClick`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../DropdownMenu';

it('does not fire onClick for a disabled item', async () => {
  const onClick = vi.fn();
  render(
    <DropdownMenu>
      <DropdownMenuTrigger render={<button>open</button>} />
      <DropdownMenuContent>
        <DropdownMenuItem disabled onClick={onClick}>
          Add sibling
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  await userEvent.click(screen.getByText('open'));
  await userEvent.click(screen.getByText('Add sibling'));
  expect(onClick).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run** `pnpm --filter @codaco/fresco-ui test -- DropdownMenu` → FAIL (if `disabled` isn't currently forwarded).

- [ ] **Step 3: Implement** — inspect the current `DropdownMenuItem` definition; ensure it spreads a `disabled` prop onto `Menu.Item` (Base UI `Menu.Item` supports `disabled`, which blocks activation). If it already forwards props, add an explicit `disabled` passthrough and a disabled style variant.

- [ ] **Step 4: Run** the test → PASS.

- [ ] **Step 5: Commit** `fix(fresco-ui): forward disabled to DropdownMenuItem`.

---

## Task 2: Discoverable "Add sibling" with inline hint

**Files:**

- Modify: `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/components/NodeContextMenu.tsx`
- Test: `packages/interview/src/interfaces/FamilyPedigree/pedigree-layout/components/__tests__/NodeContextMenu.test.tsx` (create)

**Interfaces:**

- Consumes: `canAddSibling: boolean` (already a prop); `onAction('sibling')`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NodeContextMenu from '../NodeContextMenu';

const open = async () => userEvent.click(screen.getByRole('button'));

it('renders Add sibling enabled when canAddSibling is true', async () => {
  const onAction = vi.fn();
  render(
    <NodeContextMenu
      isEgo={false}
      isFinalized={false}
      canAddSibling
      onAction={onAction}
    >
      <button>n</button>
    </NodeContextMenu>,
  );
  await open();
  await userEvent.click(screen.getByText('Add sibling'));
  expect(onAction).toHaveBeenCalledWith('sibling');
});

it('renders Add sibling disabled with a hint when canAddSibling is false', async () => {
  const onAction = vi.fn();
  render(
    <NodeContextMenu
      isEgo={false}
      isFinalized={false}
      canAddSibling={false}
      onAction={onAction}
    >
      <button>n</button>
    </NodeContextMenu>,
  );
  await open();
  expect(screen.getByText(/add a parent first/i)).toBeInTheDocument();
  await userEvent.click(screen.getByText('Add sibling'));
  expect(onAction).not.toHaveBeenCalledWith('sibling');
});
```

- [ ] **Step 2: Run** `pnpm --filter @codaco/interview test -- NodeContextMenu` → FAIL.

- [ ] **Step 3: Implement** — replace the `{canAddSibling && (<DropdownMenuItem …>Add sibling</DropdownMenuItem>)}` block so the item **always** renders; when `!canAddSibling`, pass `disabled` and render an inline muted hint caption ("Add a parent first") inside the item. Disabled item must not call `onAction('sibling')`.

- [ ] **Step 4: Run** the test → PASS.

- [ ] **Step 5: Commit** `fix(interview): make Add sibling discoverable with an inline hint`.

---

## Task 3: First-cousin representation story

**Files:**

- Create: `packages/interview/src/interfaces/FamilyPedigree/FamilyPedigree.cousins.stories.tsx`
- Reference: existing `FamilyPedigree.stories.tsx` and `pedigree-layout/components/PedigreeLayout.stories.tsx` for `SyntheticInterview`/`StoryInterviewShell` setup and an existing cousin example.

- [ ] **Step 1: Write the story** — build a pre-populated network: ego → two parents → both grandparents on one side → an aunt/uncle sharing those grandparents → the aunt/uncle's child. Render via `StoryInterviewShell` with a FamilyPedigree stage config.

- [ ] **Step 2: Add a play assertion** — assert a node labelled `Cousin` is present (the `parent,parent,child,child` path), and the branch lays out without overlap.

- [ ] **Step 3: Run** `pnpm --filter @codaco/interview test --project units -- cousins` (and the storybook project if it runs locally; otherwise rely on CI). Expected: PASS.

- [ ] **Step 4: Commit** `test(interview): first-cousin representation story`.

---

## Task 4: First-cousin creation-via-wizard story

**Files:**

- Modify: `FamilyPedigree.cousins.stories.tsx` (add the creation story)

- [ ] **Step 1: Write the play story** — start from ego with two parents (use the quick-start or a seeded network). Drive via `userEvent`: on one parent, "Add parent" twice (or the define-parents flow) to record both grandparents; then "Add sibling" on that parent — now enabled (exercises Feature #2 Task 2) — selecting the shared grandparents to create the aunt/uncle; then "Add child" on the aunt/uncle to create the cousin.

- [ ] **Step 2: Assert** a `Cousin`-labelled node appears after the flow, and that "Add sibling" was disabled before the grandparents existed and enabled after (query the menu item's disabled state at both points).

- [ ] **Step 3: Run** the units project for this story → PASS. If a genuine layout/label bug surfaces, fix it at the source (`pedigree-layout/*` or `getDisplayLabel.ts`) within this feature and add a regression test.

- [ ] **Step 4: Commit** `test(interview): first-cousin creation-via-wizard story`.

---

## Task 5: Verification

- [ ] **Step 1** Run `pnpm typecheck`, `pnpm lint:fix`, `pnpm knip` at the root; fix at source.
- [ ] **Step 2** Run `pnpm --filter @codaco/fresco-ui test` and `pnpm --filter @codaco/interview test --project units` for the touched areas.
- [ ] **Step 3: Commit** any fixups.

---

## Self-Review notes (author)

- **Spec coverage:** F discoverability (T1,T2), G representation (T3), G creation-via-wizard (T4) — all mapped.
- **Type consistency:** `NodeContextMenu` keeps its existing `canAddSibling: boolean` prop and `onAction: (a: NodeContextMenuAction) => void`; `DropdownMenuItem` gains `disabled?: boolean`.
- **No rule change:** `canAddSibling` and `siblingCellTransform` are untouched (only rendering changes), per the spec's rejected-alternative note.
