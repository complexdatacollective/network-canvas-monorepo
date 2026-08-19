import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import Modal from '../index';
import ModalPopup from '../ModalPopup';

/**
 * A closing popup animates out and only then returns focus. Unmounting the
 * tree mid-animation (what RTL's automatic cleanup does at the end of a test)
 * leaves that focus move pending, and it would otherwise land in the middle of
 * the NEXT test and move focus there. Settle each test's teardown first.
 */
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 400));
});

/**
 * Focus return for a modal surface that renders `ModalPopup` inside `Modal`
 * DIRECTLY, without going through `Dialog`.
 *
 * This is how Architect's variable pill editor, variable spotlight and nav
 * drawer, and Fresco's mobile nav drawer are built. The opener capture and the
 * usability check on an explicit target used to live in `Dialog`, so none of
 * these surfaces had either: a `finalFocus` naming a control that the popup's
 * own work has since removed was handed straight to Base UI, which bypasses its
 * connectivity check and leaves focus on `<body>`.
 */
const Harness = ({
  finalFocus,
}: {
  finalFocus?: React.ComponentProps<typeof ModalPopup>['finalFocus'];
}) => {
  const [open, setOpen] = useState(false);
  // The control an explicit `finalFocus` names, which the popup's own work
  // removes — the ordinary outcome of an editor that deletes what it edited.
  const [targetPresent, setTargetPresent] = useState(true);

  return (
    <div>
      <button type="button" id="background">
        Return to start screen
      </button>
      <button type="button" id="opener" onClick={() => setOpen(true)}>
        Open drawer
      </button>
      {targetPresent && (
        <button type="button" id="named-target">
          Named target
        </button>
      )}
      <Modal open={open} onOpenChange={setOpen}>
        <ModalPopup aria-label="Drawer" finalFocus={finalFocus}>
          <button
            type="button"
            id="remove-target"
            onClick={() => setTargetPresent(false)}
          >
            Remove named target
          </button>
          <button type="button" id="in-popup" onClick={() => setOpen(false)}>
            Close drawer
          </button>
        </ModalPopup>
      </Modal>
    </div>
  );
};

const openViaOpener = async () => {
  const opener = document.getElementById('opener')!;
  opener.focus();
  opener.click();
  const popup = await screen.findByRole('dialog');
  // Base UI moves focus into the popup on a deferred frame. Waiting for it is
  // both the real user's timeline and the precondition for asserting anything
  // about where focus goes NEXT.
  await waitFor(() =>
    expect(popup.contains(document.activeElement)).toBe(true),
  );
  return opener;
};

describe('ModalPopup focus return', () => {
  it('returns focus to the control that opened the modal', async () => {
    render(<Harness />);
    const opener = await openViaOpener();

    screen.getByRole('button', { name: 'Close drawer' }).click();

    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('prefers an explicit finalFocus over the remembered opener', async () => {
    render(
      <Harness finalFocus={() => document.getElementById('background')} />,
    );
    await openViaOpener();

    screen.getByRole('button', { name: 'Close drawer' }).click();

    await waitFor(() =>
      expect(document.activeElement).toBe(
        document.getElementById('background'),
      ),
    );
  });

  it('falls back to the opener when an explicit finalFocus names an element that is no longer in the document', async () => {
    // Resolved lazily, so it hands back the detached node rather than `null`:
    // exactly what a call site that captured the element up front produces.
    const removed = { current: null as HTMLElement | null };
    render(
      <Harness
        finalFocus={() =>
          removed.current ?? document.getElementById('named-target')
        }
      />,
    );
    const opener = await openViaOpener();

    removed.current = document.getElementById('named-target');
    screen.getByRole('button', { name: 'Remove named target' }).click();
    await waitFor(() =>
      expect(document.getElementById('named-target')).toBeNull(),
    );

    screen.getByRole('button', { name: 'Close drawer' }).click();

    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(document.activeElement).not.toBe(document.body);
  });
});
