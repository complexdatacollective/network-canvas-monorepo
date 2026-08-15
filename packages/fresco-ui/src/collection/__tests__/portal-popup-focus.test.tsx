import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { describe, expect, it } from 'vitest';

import {
  PortalContainerProvider,
  usePortalContainer,
} from '../../PortalContainer';
import { Collection } from '../components/Collection';
import { ListLayout } from '../layout/ListLayout';

/**
 * A collection whose items render a popup through a portal.
 *
 * React delivers a portalled subtree's events to its REACT ancestors, so every
 * focus, keydown and click inside the popup arrives at the collection container
 * and at the item that rendered the trigger — neither of which contains the
 * popup in the DOM. Before this was guarded, moving between two popup options
 * read to the collection as focus leaving and re-entering it, which re-ran the
 * item's focus effect and dragged focus out of the open popup onto the row.
 *
 * The popup here is a bare `createPortal` with `role="menu"`, deliberately NOT
 * Base UI's `DropdownMenu`: the invariant under test is about React's event
 * routing across a portal boundary, and a real menu's own focus manager would
 * mask a regression by putting focus back itself. It resolves its destination
 * the way every fresco-ui popup does — `usePortalContainer() ?? document.body`,
 * mirroring `container={portalContainer ?? undefined}` in `DropdownMenu` — so
 * both real deployments are reachable from these tests.
 */

type TestItem = { id: string; name: string };

const items: TestItem[] = [
  { id: '1', name: 'Item 1' },
  { id: '2', name: 'Item 2' },
  { id: '3', name: 'Item 3' },
];

const layout = new ListLayout<TestItem>({ gap: 0 });

const PopupRow = ({
  item,
  itemProps,
}: {
  item: TestItem;
  itemProps: React.ComponentProps<'div'>;
}) => {
  const [open, setOpen] = useState(false);
  const portalContainer = usePortalContainer();

  return (
    <div {...itemProps} data-testid={`item-${item.id}`}>
      {item.name}
      <button
        type="button"
        aria-label={`Actions for ${item.name}`}
        onClick={() => setOpen(true)}
      >
        …
      </button>
      {open &&
        createPortal(
          <div role="menu">
            <button type="button" role="menuitem">
              {`First for ${item.name}`}
            </button>
            <button type="button" role="menuitem">
              {`Second for ${item.name}`}
            </button>
          </div>,
          portalContainer ?? document.body,
        )}
    </div>
  );
};

/**
 * Renders the collection either bare (popups land in `document.body`) or inside
 * a `PortalContainerProvider` (popups land in its container, a SIBLING of the
 * collection rather than a document-level node).
 *
 * `portalContainerRef` is what makes the two configurations distinguishable:
 * each test asserts where its popup actually landed before asserting the focus
 * invariant, so a case cannot silently collapse into the other one.
 */
const renderCollection = (
  selectionMode: 'none' | 'single' | 'multiple' = 'none',
  withPortalContainer = false,
) => {
  const portalContainerRef: { current: HTMLElement | null } = { current: null };

  const CapturePortalContainer = () => {
    portalContainerRef.current = usePortalContainer();
    return null;
  };

  const collection = (
    <Collection<TestItem>
      id="portal-collection"
      items={items}
      keyExtractor={(item) => item.id}
      textValueExtractor={(item) => item.name}
      layout={layout}
      selectionMode={selectionMode}
      animate={false}
      aria-label="Rows"
      renderItem={(item, itemProps) => (
        <PopupRow item={item} itemProps={itemProps} />
      )}
    >
      {(CollectionElements) => CollectionElements}
    </Collection>
  );

  const result = render(
    withPortalContainer ? (
      <PortalContainerProvider>
        <CapturePortalContainer />
        {collection}
      </PortalContainerProvider>
    ) : (
      collection
    ),
  );

  return { ...result, portalContainerRef };
};

describe('collection items that render a portalled popup', () => {
  it('keeps focus in the popup while the researcher moves between its options', async () => {
    const user = userEvent.setup();
    renderCollection();

    await user.click(
      screen.getByRole('button', { name: 'Actions for Item 1' }),
    );

    const first = screen.getByRole('menuitem', { name: 'First for Item 1' });
    const second = screen.getByRole('menuitem', { name: 'Second for Item 1' });

    // Each move is settled through `act` before it is asserted: the steal comes
    // from an effect, so asserting synchronously after `.focus()` would pass
    // whether or not the effect goes on to move focus.
    await act(async () => {
      first.focus();
    });
    expect(document.activeElement).toBe(first);

    // The regression: the collection read this as an entry from outside, and the
    // item focus effect pulled focus onto the row behind the open popup.
    await act(async () => {
      second.focus();
    });
    expect(document.activeElement).toBe(second);
    expect(document.activeElement).not.toBe(screen.getByTestId('item-1'));
  });

  it('does not drive list navigation from keystrokes typed into the popup', async () => {
    const user = userEvent.setup();
    renderCollection();

    // Establish a known roving position first.
    await user.click(screen.getByTestId('item-1'));
    await waitFor(() => {
      expect(screen.getByTestId('item-1')).toHaveAttribute(
        'data-focused',
        'true',
      );
    });

    await user.click(
      screen.getByRole('button', { name: 'Actions for Item 1' }),
    );
    const first = screen.getByRole('menuitem', { name: 'First for Item 1' });
    first.focus();

    // ArrowDown would move the roving position; a printable character would
    // drive type-ahead onto "Item 2"/"Item 3"; Escape would clear selection.
    await user.keyboard('{ArrowDown}');
    await user.keyboard('I');
    await user.keyboard('{Escape}');

    expect(screen.getByTestId('item-1')).toHaveAttribute(
      'data-focused',
      'true',
    );
    expect(screen.getByTestId('item-2')).not.toHaveAttribute('data-focused');
    expect(document.activeElement).toBe(first);
  });

  it('does not toggle the row behind a popup when one of its options is activated', async () => {
    const user = userEvent.setup();
    renderCollection('multiple');

    // Clicking the trigger is a click inside the row, so it selects the row —
    // that is the collection's own behaviour and is not what is under test.
    await user.click(
      screen.getByRole('button', { name: 'Actions for Item 2' }),
    );
    expect(screen.getByTestId('item-2')).toHaveAttribute(
      'data-selected',
      'true',
    );

    // Space on a popup option reaches the row's key handler AND (on a button)
    // its click handler through the React tree. Either would toggle the row
    // straight back off.
    screen.getByRole('menuitem', { name: 'First for Item 2' }).focus();
    await user.keyboard(' ');

    expect(screen.getByTestId('item-2')).toHaveAttribute(
      'data-selected',
      'true',
    );
  });

  /**
   * The two places a fresco-ui popup can land, run as a contrasting pair.
   *
   * The guard is a plain DOM-containment test, so it should not care WHERE the
   * popup went — but an earlier design detected the app's portal container
   * specifically, which would have left the no-provider deployment broken while
   * every provider-wrapped test still passed. Neither destination is therefore
   * safe to leave untested, and each case asserts the popup's actual parent
   * first so it cannot quietly become a duplicate of the other.
   */
  describe.each([
    {
      name: 'portalled to document.body with no PortalContainerProvider',
      withPortalContainer: false,
    },
    {
      name: "portalled into the app's PortalContainerProvider container",
      withPortalContainer: true,
    },
  ])('a popup $name', ({ withPortalContainer }) => {
    it('keeps focus in the popup while the researcher moves between its options', async () => {
      const user = userEvent.setup();
      const { portalContainerRef } = renderCollection(
        'none',
        withPortalContainer,
      );

      await user.click(
        screen.getByRole('button', { name: 'Actions for Item 3' }),
      );

      // Pin the configuration before the behaviour: without this the two cases
      // would be indistinguishable if the popup ever stopped honouring the
      // provider, and one of them would be testing nothing new.
      const expectedParent = withPortalContainer
        ? portalContainerRef.current
        : document.body;
      expect(expectedParent).not.toBeNull();
      expect(screen.getByRole('menu').parentElement).toBe(expectedParent);
      if (withPortalContainer) {
        expect(screen.getByRole('menu').parentElement).not.toBe(document.body);
      }

      const second = screen.getByRole('menuitem', {
        name: 'Second for Item 3',
      });
      await act(async () => {
        screen.getByRole('menuitem', { name: 'First for Item 3' }).focus();
      });
      await act(async () => {
        second.focus();
      });

      expect(document.activeElement).toBe(second);
      expect(document.activeElement).not.toBe(screen.getByTestId('item-3'));
    });
  });

  it('lets focus rest on a control inside a row when it is reached from outside', async () => {
    renderCollection();

    const trigger = screen.getByRole('button', { name: 'Actions for Item 2' });
    trigger.focus();

    await waitFor(() => {
      expect(screen.getByTestId('item-2')).toHaveAttribute(
        'data-focused',
        'true',
      );
    });
    // The row claims the roving position — assistive technology still knows
    // which item is current — but does not steal focus from the button.
    expect(document.activeElement).toBe(trigger);
  });

  it('still moves focus between rows with the arrow keys', async () => {
    const user = userEvent.setup();
    renderCollection();

    await user.click(screen.getByTestId('item-1'));
    await user.keyboard('{ArrowDown}');

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('item-2'));
    });
    expect(screen.getByTestId('item-2')).toHaveAttribute(
      'data-focused',
      'true',
    );
  });
});
