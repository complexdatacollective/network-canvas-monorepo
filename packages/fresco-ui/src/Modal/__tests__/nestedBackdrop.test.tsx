import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import Dialog from '../../dialogs/Dialog';
import Modal from '../index';
import ModalPopup from '../ModalPopup';

/**
 * A closing backdrop animates out before it leaves the DOM, so unmounting the
 * tree mid-animation would leave the next test counting the previous test's
 * layers. Settle each teardown first.
 */
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 400));
});

/**
 * The dimmed layer a modal surface puts up, counted.
 *
 * Modals portal out of the tree they are written in, so they are read from the
 * document rather than from a render result. The backdrop carries no role and
 * no name — it is the one thing on screen that is deliberately not addressed —
 * so `data-modal-backdrop` is what names it here.
 */
const backdrops = () =>
  document.querySelectorAll('[data-modal-backdrop]').length;

/**
 * A dialog opened from inside another dialog dims what is behind it.
 *
 * Base UI suppresses the backdrop of any dialog whose React subtree sits
 * inside another open dialog, and nesting is React context rather than DOM
 * position, so a portalled overlay opened from inside a dialog counts as
 * nested. Left to that default, the variable spotlight opened from a prompt
 * dialog, or an attribute editor opened from a row dialog, comes up with NO
 * dimmed layer at all — not one painted underneath the wrong sibling, but none
 * in the document.
 */
describe('a modal surface opened from inside another one', () => {
  it('dims the background for each open layer, not only the outermost', async () => {
    function NestedDialogs() {
      const [inner, setInner] = useState(false);

      return (
        <Dialog open title="Edit this prompt">
          <button type="button" onClick={() => setInner(true)}>
            Change attribute
          </button>
          <Dialog open={inner} title="Choose an attribute">
            <p>Attributes</p>
          </Dialog>
        </Dialog>
      );
    }

    render(<NestedDialogs />);

    await screen.findByRole('dialog', { name: 'Edit this prompt' });
    await waitFor(() => {
      expect(backdrops()).toBe(1);
    });

    screen.getByRole('button', { name: 'Change attribute' }).click();

    await screen.findByRole('dialog', { name: 'Choose an attribute' });
    await waitFor(() => {
      expect(backdrops()).toBe(2);
    });
  });

  it('dims the background for a Modal opened from inside a dialog', async () => {
    function DialogWithSpotlight() {
      const [spotlight, setSpotlight] = useState(false);

      return (
        <Dialog open title="Edit this prompt">
          <button type="button" onClick={() => setSpotlight(true)}>
            Open spotlight
          </button>
          <Modal open={spotlight} onOpenChange={setSpotlight}>
            <ModalPopup aria-label="Attribute spotlight">
              <p>Attributes</p>
            </ModalPopup>
          </Modal>
        </Dialog>
      );
    }

    render(<DialogWithSpotlight />);

    await screen.findByRole('dialog', { name: 'Edit this prompt' });
    screen.getByRole('button', { name: 'Open spotlight' }).click();

    await screen.findByRole('dialog', { name: 'Attribute spotlight' });
    await waitFor(() => {
      expect(backdrops()).toBe(2);
    });
  });

  it('takes its dimmed layer away again when it closes', async () => {
    function ClosableInner() {
      const [inner, setInner] = useState(true);

      return (
        <Dialog open title="Edit this prompt">
          <Dialog
            open={inner}
            title="Choose an attribute"
            closeDialog={() => setInner(false)}
          >
            <button type="button" onClick={() => setInner(false)}>
              Done
            </button>
          </Dialog>
        </Dialog>
      );
    }

    render(<ClosableInner />);

    await screen.findByRole('dialog', { name: 'Choose an attribute' });
    await waitFor(() => {
      expect(backdrops()).toBe(2);
    });

    screen.getByRole('button', { name: 'Done' }).click();

    await waitFor(() => {
      expect(backdrops()).toBe(1);
    });
  });
});
