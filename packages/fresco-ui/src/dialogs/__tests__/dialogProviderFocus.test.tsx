import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DialogProvider from '../DialogProvider';
import useDialog from '../useDialog';

/**
 * Focus return for dialogs opened imperatively through `useDialog`.
 *
 * These are the ones the report names — destructive confirms, Information item
 * removal, the unsaved-navigation warning, and the participant-facing Finish
 * confirmation, which all share this provider. The provider renders the dialog
 * a microtask after the call and hands Base UI no trigger at all, so its only
 * remaining fallbacks resolve to `<body>` or to an unrelated control focused
 * earlier in the session.
 */

const Opener = ({
  onConfirm = () => undefined,
  finalFocus,
}: {
  onConfirm?: () => void;
  finalFocus?: () => HTMLElement | null;
}) => {
  const { confirm } = useDialog();

  return (
    <div>
      <button type="button" id="first-tabbable">
        Return to start screen
      </button>
      <button
        type="button"
        id="trigger"
        onClick={() =>
          void confirm({
            title: 'Remove this item?',
            confirmLabel: 'Remove',
            onConfirm,
            finalFocus,
          })
        }
      >
        Remove item
      </button>
    </div>
  );
};

const openConfirm = async () => {
  const trigger = document.getElementById('trigger')!;
  trigger.focus();
  trigger.click();
  const dialog = await screen.findByRole('dialog');
  await waitFor(() =>
    expect(dialog.contains(document.activeElement)).toBe(true),
  );
  return trigger;
};

const settle = async () => {
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
};

describe('useDialog focus return', () => {
  it('returns focus to the control that asked for the dialog', async () => {
    render(
      <DialogProvider>
        <Opener />
      </DialogProvider>,
    );
    const trigger = await openConfirm();

    screen.getByTestId('dialog-cancel').click();
    await settle();

    expect(document.activeElement).toBe(trigger);
  });

  it('uses the caller’s fallback when the action removed the trigger', async () => {
    // The confirm branch of a destructive dialog: `onConfirm` destroys the very
    // control that opened it, so the opener is a detached node by the time focus
    // is returned and something else has to be named.
    const Host = () => {
      const fallback = () => document.getElementById('first-tabbable');
      return (
        <DialogProvider>
          <Opener
            finalFocus={fallback}
            onConfirm={() => document.getElementById('trigger')!.remove()}
          />
        </DialogProvider>
      );
    };

    render(<Host />);
    await openConfirm();

    screen.getByTestId('dialog-primary').click();
    await settle();

    expect(document.getElementById('trigger')).toBeNull();
    expect(document.activeElement).toBe(
      document.getElementById('first-tabbable'),
    );
  });
});
