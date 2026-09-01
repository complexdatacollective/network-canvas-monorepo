import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import Dialog from '../dialogs/Dialog';

/**
 * Drift detection for `inertOthers` against the real Base UI it shadows.
 *
 * `inertOthers` is a userland reimplementation of Base UI's private
 * `markOthers`. It is not avoidable by importing the original: `markOthers`
 * does accept `{ inert: true }`, but it is not reachable through
 * `@base-ui/react`'s exports map, and `FloatingFocusManager` calls it with
 * `ariaHidden` only — there is no prop that opts into the `inert` branch.
 * (Upstream limitation as of @base-ui/react 1.7. If a released version ever
 * exposes it, delete `inertOthers` and use it.)
 *
 * The risk that creates is drift: `@base-ui/react` is catalogued as `~1.7.0`,
 * so any patch release can change the portal structure, the marker attributes,
 * or the mount ordering our reimplementation mirrors — and
 * `inertOthers.test.ts` would not notice, because it pins the algorithm against
 * hand-built synthetic HTML that no upgrade can invalidate.
 *
 * These tests therefore drive REAL Base UI: fresco-ui's own `Dialog`, nested,
 * asserting the outcome the reimplementation exists to produce. They fail if an
 * upgrade moves the ground the sweep stands on.
 */

/**
 * A closing dialog animates out and only then returns focus. Settle each
 * test's teardown so a pending focus move cannot land inside the next test.
 */
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 400));
});

const NestedDialogs = () => {
  const [parentOpen, setParentOpen] = useState(false);
  const [childOpen, setChildOpen] = useState(false);

  return (
    <div>
      <button type="button" id="background" onClick={() => setParentOpen(true)}>
        Open parent
      </button>
      <Dialog
        open={parentOpen}
        title="Parent dialog"
        closeDialog={() => setParentOpen(false)}
      >
        <button type="button" id="in-parent" onClick={() => setChildOpen(true)}>
          Open child
        </button>
      </Dialog>
      <Dialog
        open={childOpen}
        title="Child dialog"
        closeDialog={() => setChildOpen(false)}
      >
        <button type="button" id="in-child">
          Inside child
        </button>
      </Dialog>
    </div>
  );
};

/** The portal subtree a sweep would mark, for the popup passed in. */
const inertAncestorOf = (element: Element) => element.closest('[inert]');

describe('inertOthers against real Base UI dialogs', () => {
  it('inerts the parent dialog while a child dialog is open, and restores it on close', async () => {
    render(<NestedDialogs />);

    const background = document.getElementById('background')!;
    background.click();

    const parentPopup = await screen.findByRole('dialog', {
      name: 'Parent dialog',
    });

    // Only the parent is open: the page behind it is isolated, the parent is
    // not. This is the precondition — without it the assertion below would
    // pass for the wrong reason.
    await waitFor(() => expect(background.closest('[inert]')).not.toBeNull());
    expect(inertAncestorOf(parentPopup)).toBeNull();

    document.getElementById('in-parent')!.click();
    await screen.findByRole('dialog', { name: 'Child dialog' });

    // The regression `inertOthers` exists for: Base UI's own marking never
    // reaches a sibling portal, so the parent dialog stayed fully exposed —
    // its controls tabbable — behind the child.
    await waitFor(() => expect(inertAncestorOf(parentPopup)).not.toBeNull());

    screen
      .getAllByRole('button', { name: 'Close' })
      .find((button) => !button.closest('[inert]'))!
      .click();

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Child dialog' }),
      ).not.toBeInTheDocument(),
    );

    // Closing the child hands the parent back, still isolated from the page.
    await waitFor(() => expect(inertAncestorOf(parentPopup)).toBeNull());
    expect(background.closest('[inert]')).not.toBeNull();
  });

  it('keeps the child dialog itself out of the sweep', async () => {
    render(<NestedDialogs />);

    document.getElementById('background')!.click();
    await screen.findByRole('dialog', { name: 'Parent dialog' });
    document.getElementById('in-parent')!.click();

    const childPopup = await screen.findByRole('dialog', {
      name: 'Child dialog',
    });

    await waitFor(() =>
      expect(
        document.getElementById('background')!.closest('[inert]'),
      ).not.toBeNull(),
    );
    expect(inertAncestorOf(childPopup)).toBeNull();
    expect(childPopup.hasAttribute('inert')).toBe(false);
  });
});
