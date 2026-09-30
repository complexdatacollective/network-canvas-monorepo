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
 * Each refusal below is paired with the same gesture on a dismissible dialog.
 * Without that pair, a "fix" that simply stopped Escape working everywhere
 * would pass.
 */

const Harness = ({
  dismissible,
  onClose,
}: {
  dismissible?: boolean;
  onClose: () => void;
}) => {
  const [open, setOpen] = useState(true);

  return (
    <Dialog
      open={open}
      title="Exporting 12 interviews"
      dismissible={dismissible}
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
  it('does not close on Escape when it is not dismissible', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness dismissible={false} onClose={onClose} />);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not close on an outside press when it is not dismissible', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness dismissible={false} onClose={onClose} />);
    await screen.findByRole('dialog');

    await pressOutside(user);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('offers no close button when it is not dismissible', async () => {
    render(<Harness dismissible={false} onClose={vi.fn()} />);
    await screen.findByRole('dialog');

    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();
  });

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
