import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { useToast } from '@codaco/fresco-ui/Toast';
import {
  type ConstraintConflict,
  SyntheticDataConstraintError,
} from '@codaco/protocol-utilities';

import { GenerationFailureDescription } from './GenerationFailureDescription';

// SettingsDialog renders this inside a persistent (`timeout: 0`) destructive
// toast. fresco-ui's `Toast` bounds and scrolls its description internally
// (see its own `LongDescription` story), so these stories mount the real
// toast rather than the component alone and confirm this call site's content
// still fits within that bound — they don't re-prove the scrolling mechanics
// themselves.

const RULES = ['unique', 'differentFrom', 'greaterThan', 'lessThan'];

function makeConflicts(howMany: number): ConstraintConflict[] {
  return Array.from({ length: howMany }, (_, i) => ({
    entity: 'node' as const,
    entityType: `type-${i}`,
    entityTypeName: `Person type ${i + 1}`,
    variableIds: [`variable-${i}`],
    variableNames: [`Attribute ${i + 1}`],
    rules: [RULES[i % RULES.length] ?? 'unique'],
    reasonCode: 'insufficientUniqueValues',
    reason:
      'only 2 distinct values are possible, but up to 5 nodes of this type can be generated',
  }));
}

function FailureToast({ conflictCount }: { conflictCount: number }) {
  const toast = useToast();
  // `useToast()` returns a fresh object every render, so the effect can't key
  // off it; track the count actually shown instead.
  const shownFor = useRef<number | null>(null);

  useEffect(() => {
    if (shownFor.current === conflictCount) return;
    shownFor.current = conflictCount;
    const error = new SyntheticDataConstraintError(
      makeConflicts(conflictCount),
      'this protocol declares validation rules that cannot all be satisfied together',
    );
    toast.add({
      title: 'Generation failed',
      description: <GenerationFailureDescription error={error} />,
      variant: 'destructive',
      timeout: 0,
    });
  }, [toast, conflictCount]);

  return null;
}

function toastRootFor(close: HTMLElement): HTMLElement {
  const root = close.closest('[data-testid="toast-viewport"] > *');
  if (!(root instanceof HTMLElement)) {
    throw new Error('Close button is not inside a toast');
  }
  return root;
}

type StoryArgs = { conflictCount: number };

const meta: Meta<StoryArgs> = {
  title: 'Components/GenerationFailureDescription',
  parameters: { layout: 'fullscreen' },
  args: { conflictCount: 2 },
  render: ({ conflictCount }) => <FailureToast conflictCount={conflictCount} />,
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const AFewConflicts: Story = {};

/**
 * The failure mode: a protocol with enough clashing rules to overflow the
 * toast's bounded description. The toast must still fit on screen, and every
 * conflict must still render — reachable by scrolling the toast's
 * description, not by the toast growing past the viewport.
 */
export const ManyConflicts: Story = {
  args: { conflictCount: 40 },
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    const screen = within(doc.body);

    // Base UI hides Toast.Close from the accessibility tree until the toast
    // is hovered or focused, so it has no ARIA role to query by until then —
    // match the label attribute instead, which reflects presence either way.
    const close = await screen.findByLabelText('Close');
    const toast = toastRootFor(close);

    // fresco-ui's Toast caps and scrolls its description internally (proven
    // generically by its own `LongDescription` story) — this just confirms
    // this call site's content still fits within that bound rather than
    // pushing the title and Close control off the top of the screen.
    await waitFor(() => {
      const box = toast.getBoundingClientRect();
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.height).toBeLessThanOrEqual(window.innerHeight);
    });

    // Every conflict is still rendered.
    expect(screen.getAllByRole('listitem')).toHaveLength(40);

    // Escape closes the toast whenever focus is inside it — the keyboard
    // route to dismissal, independent of the Close button.
    close.focus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByLabelText('Close')).not.toBeInTheDocument(),
    );
  },
};
