import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import Modal from '../../Modal';
import Dialog from '../Dialog';

/**
 * A closing dialog animates out and only then returns focus. Unmounting the
 * tree mid-animation (what RTL's automatic cleanup does at the end of a test)
 * leaves that focus move pending, and it would otherwise land in the middle of
 * the NEXT test and move focus there. Settle each test's teardown first.
 */
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 400));
});

/**
 * Focus return and modal isolation for `Dialog`.
 *
 * Every one of these fails on the unfixed component: `ModalPopup` spread
 * `finalFocus` onto its rendered `motion.div` instead of handing it to Base
 * UI's focus manager, no dialog remembered what opened it, and nothing outside
 * an open dialog was ever made `inert`.
 */

const Harness = ({
  withOpener = true,
  finalFocus,
}: {
  withOpener?: boolean;
  finalFocus?: React.ComponentProps<typeof Dialog>['finalFocus'];
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button type="button" id="background">
        Return to start screen
      </button>
      {withOpener && (
        <button type="button" id="opener" onClick={() => setOpen(true)}>
          Edit field
        </button>
      )}
      <button type="button" id="programmatic" onClick={() => setOpen(true)}>
        Open without focusing
      </button>
      <Dialog
        open={open}
        title="Edit Field"
        closeDialog={() => setOpen(false)}
        finalFocus={finalFocus}
      >
        <button type="button" id="in-dialog">
          Inside
        </button>
      </Dialog>
    </div>
  );
};

const openViaOpener = async () => {
  const opener = document.getElementById('opener')!;
  opener.focus();
  opener.click();
  const dialog = await screen.findByRole('dialog');
  // Base UI moves focus into the popup on a deferred frame. Waiting for it is
  // both the real user's timeline and the precondition for asserting anything
  // about where focus goes NEXT: with focus still parked outside the popup,
  // closing it correctly declines to move focus at all.
  await waitFor(() =>
    expect(dialog.contains(document.activeElement)).toBe(true),
  );
  return opener;
};

const closeViaCloseButton = () => {
  screen.getByRole('button', { name: 'Close' }).click();
};

describe('Dialog focus return', () => {
  it('returns focus to the control that opened it', async () => {
    // A guard rather than a reproduction: in this shape Base UI's own fallback
    // already lands on the opener, and the reported failures are the ones where
    // it cannot (an opener that is replaced while the dialog is open — see
    // DialogArrayField's tests — or a dialog opened through `useDialog`, below).
    render(<Harness />);
    const opener = await openViaOpener();

    closeViaCloseButton();

    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('does not send focus to the first tabbable element when nothing opened it', async () => {
    // Opening from a popstate handler or a timer leaves `document.activeElement`
    // on <body>. Handing `body` to Base UI as an explicit return target makes it
    // focus the FIRST TABBABLE ELEMENT IN THE DOCUMENT — manufacturing the
    // reported "focus restarts at the header" symptom.
    render(<Harness withOpener={false} />);
    const background = document.getElementById('background')!;

    document.getElementById('programmatic')!.click();
    (document.activeElement as HTMLElement | null)?.blur();
    await screen.findByRole('dialog');

    closeViaCloseButton();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    expect(document.activeElement).not.toBe(background);
  });

  it('prefers an explicit finalFocus over the remembered opener', async () => {
    render(
      <Harness finalFocus={() => document.getElementById('background')} />,
    );
    await openViaOpener();

    closeViaCloseButton();

    await waitFor(() =>
      expect(document.activeElement).toBe(
        document.getElementById('background'),
      ),
    );
  });

  it('falls back to the opener when an explicit finalFocus resolves to nothing', async () => {
    // The Cancel branch of a destructive confirm: the caller's fallback exists
    // for the case where the action destroyed the opener, and must not displace
    // the opener when it survives.
    render(<Harness finalFocus={() => null} />);
    const opener = await openViaOpener();

    closeViaCloseButton();

    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('ignores an explicit finalFocus naming an element that is no longer in the document', async () => {
    // A caller's `finalFocus` usually names a control the confirmed action goes
    // on to destroy. An explicit target BYPASSES Base UI's own connectivity
    // check, so handing over the detached node parks focus on <body> — strictly
    // worse than declining and letting the remembered opener answer.
    const detached = document.createElement('button');
    render(<Harness finalFocus={() => detached} />);
    const opener = await openViaOpener();

    closeViaCloseButton();

    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(detached.isConnected).toBe(false);
  });

  it('does not return focus to an opener that has been removed', async () => {
    const Removing = () => {
      const [open, setOpen] = useState(false);
      const [showOpener, setShowOpener] = useState(true);
      return (
        <div>
          <button type="button" id="background">
            Background
          </button>
          {showOpener && (
            <button type="button" id="opener" onClick={() => setOpen(true)}>
              Remove item
            </button>
          )}
          <Dialog
            open={open}
            title="Remove this item?"
            closeDialog={() => {
              setShowOpener(false);
              setOpen(false);
            }}
          >
            body
          </Dialog>
        </div>
      );
    };

    render(<Removing />);
    const opener = document.getElementById('opener')!;
    opener.focus();
    opener.click();
    await screen.findByRole('dialog');

    closeViaCloseButton();

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    // A detached node cannot take focus; the point is that nothing throws and
    // focus is not parked on the removed element.
    expect(opener.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(opener);
  });
});

describe('Dialog modal isolation', () => {
  it('makes the page behind it inert while open, and restores it on close', async () => {
    render(<Harness />);
    const opener = await openViaOpener();
    const backgroundRoot = opener.parentElement!;

    expect(backgroundRoot.closest('[inert]')).not.toBeNull();

    closeViaCloseButton();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(backgroundRoot.closest('[inert]')).toBeNull();
  });

  it('leaves live regions out of the sweep', async () => {
    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.id = 'announcer';
    document.body.append(liveRegion);

    render(<Harness />);
    await openViaOpener();

    expect(liveRegion.closest('[inert]')).toBeNull();

    closeViaCloseButton();
    liveRegion.remove();
  });
});

describe('Dialog scroll region', () => {
  it('is neither a tab stop nor a landmark when its content fits', async () => {
    render(<Harness />);
    await openViaOpener();

    const viewport = screen.getByRole('dialog').querySelector('section');

    // jsdom reports no overflow — the "nothing to scroll" case. The viewport
    // used to be an unconditional, unannounced stop right after Close; naming
    // it unconditionally instead would put a `region` landmark inside every
    // dialog, repeating the dialog's own name.
    expect(viewport).toHaveAttribute('tabindex', '-1');
    expect(viewport).not.toHaveAttribute('aria-labelledby');
  });
});

describe('Dialog isolation scope', () => {
  it('does not isolate an overlay that renders no dialog', () => {
    // `Modal` is also used for chrome that merely covers the page — Architect's
    // protocol-loading overlay is a bare spinner with no `Dialog.Popup`, so Base
    // UI's focus manager never mounts for it either. Taking the whole document
    // out of the accessibility tree for that would leave a screen-reader user
    // with an empty document and nothing to hear.
    render(
      <div>
        <button type="button" id="page-control">
          Background
        </button>
        <Modal open onOpenChange={() => undefined}>
          <div>Loading…</div>
        </Modal>
      </div>,
    );

    expect(
      document.getElementById('page-control')!.closest('[inert]'),
    ).toBeNull();
  });
});
