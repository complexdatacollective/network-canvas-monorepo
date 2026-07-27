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
// toast, and the toast is what constrains it: fresco-ui anchors the viewport to
// the bottom of the screen and each toast grows upwards from it, so a toast
// taller than the viewport pushes its own title and Close control off the top.
// These stories therefore mount the real toast rather than the component alone,
// and measure it.

const RULES = ['unique', 'differentFrom', 'greaterThan', 'lessThan'];

function makeConflicts(howMany: number): ConstraintConflict[] {
  return Array.from({ length: howMany }, (_, i) => ({
    entity: 'node' as const,
    entityType: `type-${i}`,
    entityTypeName: `Person type ${i + 1}`,
    variableIds: [`variable-${i}`],
    variableNames: [`Attribute ${i + 1}`],
    rules: [RULES[i % RULES.length] ?? 'unique'],
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
 * viewport. The toast must still fit on screen, and every conflict must still
 * be reachable — by scrolling the list, not by growing the toast.
 */
export const ManyConflicts: Story = {
  args: { conflictCount: 40 },
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    const screen = within(doc.body);

    // Base UI sets `aria-hidden` on Toast.Close until the toast is hovered or
    // focused, so it has no ARIA role to query by until then — match the label
    // attribute instead, which reflects presence either way.
    const close = await screen.findByLabelText('Close');
    const toast = toastRootFor(close);

    await waitFor(() => {
      const box = toast.getBoundingClientRect();
      // Anchored to the bottom and growing up, overflow shows as a negative
      // top: the title and Close control leaving the top of the screen.
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.height).toBeLessThanOrEqual(window.innerHeight);
    });

    // The Close control has to be on screen to be clickable at all...
    const closeBox = close.getBoundingClientRect();
    expect(closeBox.top).toBeGreaterThanOrEqual(0);
    expect(closeBox.bottom).toBeLessThanOrEqual(window.innerHeight);
    // ...and it has to be the topmost element at its own centre, or the click
    // lands on whatever covers it.
    const atCentre = doc.elementFromPoint(
      closeBox.left + closeBox.width / 2,
      closeBox.top + closeBox.height / 2,
    );
    expect(close.contains(atCentre)).toBe(true);

    // Every conflict is still rendered, and stays readable by scrolling the
    // list rather than by growing the toast.
    expect(screen.getAllByRole('listitem')).toHaveLength(40);
    const region = screen.getByRole('region', {
      name: 'Conflicting validation rules',
    });
    expect(region.scrollHeight).toBeGreaterThan(region.clientHeight);
    region.scrollTop = region.scrollHeight;
    await waitFor(() => expect(region.scrollTop).toBeGreaterThan(0));

    // A scrollable region with no focusable content is unreachable by keyboard
    // unless it is in the tab order itself — `focus()` alone would still pass
    // with `tabindex="-1"`, which no amount of tabbing can reach.
    expect(region.tabIndex).toBeGreaterThanOrEqual(0);
    region.focus();
    expect(doc.activeElement).toBe(region);

    // Escape closes the toast whenever focus is inside it — the keyboard route
    // to dismissal, independent of the Close button.
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByLabelText('Close')).not.toBeInTheDocument(),
    );
  },
};
