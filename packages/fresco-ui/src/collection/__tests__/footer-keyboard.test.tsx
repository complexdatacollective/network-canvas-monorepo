import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Collection } from '../components/Collection';
import { ListLayout } from '../layout/ListLayout';

/**
 * A collection with a `footer`.
 *
 * The footer scrolls with the items, so it renders inside the element that
 * carries `role="listbox"` and the collection's keyboard and focus handlers.
 * Its controls are ordinary buttons and links, not collection items, and their
 * events bubble to those handlers like any other descendant's. Left unguarded,
 * an Arrow key pressed on a footer button is taken as list navigation and a
 * printable character as type-ahead — either moves `focusedKey`, whose focus
 * effect then pulls focus off the control the researcher is on and onto a row.
 * Focus arriving from outside the collection reads the same way, delegating to
 * the first item and taking focus straight back off the footer.
 */

type TestItem = { id: string; name: string };

const items: TestItem[] = [
  { id: '1', name: 'Alpha' },
  { id: '2', name: 'Beta' },
  { id: '3', name: 'Gamma' },
];

const layout = new ListLayout<TestItem>({ gap: 0 });

const CollectionUnderTest = ({ visible = items }: { visible?: TestItem[] }) => (
  <>
    <button type="button">Before</button>
    <Collection<TestItem>
      id="footer-collection"
      items={visible}
      keyExtractor={(item) => item.id}
      textValueExtractor={(item) => item.name}
      layout={layout}
      selectionMode="none"
      animate={false}
      aria-label="Rows"
      footer={
        <div role="group" aria-label="More">
          <a href="https://example.com">Gallery link</a>
          <button type="button">Dismiss</button>
        </div>
      }
      renderItem={(item, itemProps) => (
        <div {...itemProps} data-testid={`item-${item.id}`}>
          {item.name}
        </div>
      )}
    >
      {(CollectionElements) => CollectionElements}
    </Collection>
    <button type="button">After</button>
  </>
);

const renderCollection = (visible: TestItem[] = items) =>
  render(<CollectionUnderTest visible={visible} />);

describe('a collection footer', () => {
  it('renders inside the scrolling listbox, so it scrolls with the items', () => {
    renderCollection();

    const listbox = screen.getByRole('listbox', { name: 'Rows' });
    const footer = screen.getByRole('group', { name: 'More' });

    expect(listbox).toContainElement(footer);
    // It is still not one of the options.
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('leaves arrow keys to the control the researcher is actually on', async () => {
    const user = userEvent.setup();
    renderCollection();

    const dismiss = screen.getByRole('button', { name: 'Dismiss' });
    dismiss.focus();
    expect(dismiss).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowUp}');
    await user.keyboard('{Home}');

    expect(dismiss).toHaveFocus();
  });

  it('does not treat typing in the footer as list type-ahead', async () => {
    const user = userEvent.setup();
    renderCollection();

    const link = screen.getByRole('link', { name: 'Gallery link' });
    link.focus();

    await user.keyboard('g');

    expect(link).toHaveFocus();
  });

  it('does not delegate to the first item when focus enters the footer from outside', async () => {
    const user = userEvent.setup();
    renderCollection();

    // Shift-Tab backwards from the control after the collection lands on the
    // footer's last control, which is not an entry into the list.
    screen.getByRole('button', { name: 'After' }).focus();
    await user.tab({ shift: true });

    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveFocus();
  });

  it('keeps focus on a footer control when the focused item is removed', async () => {
    const user = userEvent.setup();
    const { rerender } = renderCollection();

    // Give the list a focusedKey, then tab on into the footer.
    screen.getByRole('listbox', { name: 'Rows' }).focus();
    await user.keyboard('{ArrowDown}');
    const link = screen.getByRole('link', { name: 'Gallery link' });
    link.focus();
    expect(link).toHaveFocus();

    // The item holding `focusedKey` goes away — filtered, or deleted by
    // another tab. Repairing `focusedKey` must not reach out of the list and
    // take focus off the control the researcher is on.
    rerender(
      <CollectionUnderTest visible={items.filter((item) => item.id !== '2')} />,
    );

    expect(link).toHaveFocus();
  });

  it('still navigates the items themselves', async () => {
    const user = userEvent.setup();
    renderCollection();

    // Focusing the listbox delegates to the first item, so the arrow moves on
    // to the second — the guard must not have cost the items their navigation.
    screen.getByRole('listbox', { name: 'Rows' }).focus();
    await user.keyboard('{ArrowDown}');

    expect(screen.getByTestId('item-2')).toHaveFocus();
  });
});
