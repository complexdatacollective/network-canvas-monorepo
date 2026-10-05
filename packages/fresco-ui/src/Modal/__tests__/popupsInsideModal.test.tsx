import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import Dialog from '../../dialogs/Dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../DropdownMenu';
import { PortalContainerProvider } from '../../PortalContainer';

/**
 * Popups opened from inside a dialog, with the shared portal container that
 * every app mounts.
 *
 * Without the container Base UI nests a popup's portal inside the dialog's
 * portal by itself, so a test that mounts none cannot see this. With the
 * container, popups used to portal beside the dialog. A `DropdownMenu` stays
 * mounted while closed, so its portal already existed when the dialog opened,
 * and Base UI marked it `aria-hidden="true"` as "outside" the modal dialog: it
 * only exempts portals nested in the dialog's own portal node.
 */

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 400));
});

const hiddenAncestorOf = (element: Element) =>
  element.closest('[aria-hidden="true"], [inert]');

/** The Base UI portal node a dialog or popup was rendered into. */
const portalOf = (element: Element) => element.closest('[data-base-ui-portal]');

describe('a popup opened inside a dialog', () => {
  it('portals into the dialog and stays in the accessibility tree', async () => {
    const user = userEvent.setup();

    render(
      <PortalContainerProvider>
        <Dialog open title="Edit this label">
          <DropdownMenu>
            <DropdownMenuTrigger>Editing language</DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>English</DropdownMenuItem>
              <DropdownMenuItem>Español</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Dialog>
      </PortalContainerProvider>,
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Edit this label',
    });
    await user.click(screen.getByRole('button', { name: 'Editing language' }));

    // No `hidden: true`: an `aria-hidden` ancestor fails this query.
    const menu = await screen.findByRole('menu');
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    expect(hiddenAncestorOf(menu)).toBeNull();
    expect(portalOf(dialog)?.contains(menu)).toBe(true);
  });
});

describe('a dialog declared inside another dialog', () => {
  function NestedDialogs() {
    const [inner, setInner] = useState(false);

    return (
      <PortalContainerProvider>
        <Dialog open title="Edit this prompt">
          <button type="button" onClick={() => setInner(true)}>
            Change attribute
          </button>
          <Dialog
            open={inner}
            title="Choose an attribute"
            closeDialog={() => setInner(false)}
          >
            <p>Attributes</p>
          </Dialog>
        </Dialog>
      </PortalContainerProvider>
    );
  }

  /**
   * It now portals into the outer dialog's portal node, as Base UI nests it
   * when no container is passed, instead of beside it. `inertOthers` keeps
   * isolating the parent all the same: its boundary is the inner portal node,
   * and the parent's popup is outside it.
   */
  it('isolates the outer dialog while it is open, and hands it back on close', async () => {
    const user = userEvent.setup();
    render(<NestedDialogs />);

    const outer = await screen.findByRole('dialog', {
      name: 'Edit this prompt',
    });
    await user.click(screen.getByRole('button', { name: 'Change attribute' }));
    const inner = await screen.findByRole('dialog', {
      name: 'Choose an attribute',
    });

    expect(portalOf(outer)?.contains(inner)).toBe(true);
    expect(hiddenAncestorOf(inner)).toBeNull();
    await waitFor(() => expect(outer.closest('[inert]')).not.toBeNull());

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Choose an attribute' }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(hiddenAncestorOf(outer)).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Edit this prompt' })).toBe(
      outer,
    );
  });
});
