import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Dialog from '../Dialog';

/**
 * `dismissible={false}` has to HOLD THE DIALOG OPEN, not merely hide its close
 * button.
 *
 * It used to do only the second thing: the prop was read once, to decide
 * whether to render `Dialog.Close`, and nothing reached Base UI. Escape and a
 * press outside still closed the dialog and still called `closeDialog` —
 * against a dialog the caller had declared un-dismissible because something was
 * in flight behind it (a submit, an export build) or because the flow had to be
 * completed (a lock screen).
 *
 * The refusals (Escape, an outside press, no close button) are asserted by the
 * `NonDismissible` play in `Dialogs.stories.tsx`. This file holds their pair:
 * the same gestures on a dismissible dialog. Without that pair, a "fix" that
 * simply stopped Escape working everywhere would pass.
 */

const Harness = ({ onClose }: { onClose: () => void }) => {
  const [open, setOpen] = useState(true);

  return (
    <Dialog
      open={open}
      title="Exporting 12 interviews"
      closeDialog={() => {
        onClose();
        setOpen(false);
      }}
    >
      <button type="button">Inside the dialog</button>
    </Dialog>
  );
};

/**
 * The same outside-press route the dimmed backdrop takes: Base UI treats a
 * press on any element outside the popup — including an ancestor of it — as an
 * outside press. `<body>` is named rather than the backdrop because the
 * backdrop is deliberately presentational, with no role or name to find it by.
 */
const pressOutside = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(document.body);

describe('Dialog dismissal', () => {
  it('closes on Escape by default', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('closes on an outside press by default', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    await screen.findByRole('dialog');

    await pressOutside(user);

    expect(onClose).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
});
