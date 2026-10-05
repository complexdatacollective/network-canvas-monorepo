import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Collection } from '../components/Collection';
import { ListLayout } from '../layout/ListLayout';

type TestItem = { id: string; name: string };

const testItems: TestItem[] = [
  { id: '1', name: 'Item 1' },
  { id: '2', name: 'Item 2' },
  { id: '3', name: 'Item 3' },
];

const layout = new ListLayout<TestItem>({ gap: 0 });

const list = () => (
  <Collection<TestItem>
    id="results"
    aria-label="Results"
    items={testItems}
    keyExtractor={(item) => item.id}
    textValueExtractor={(item) => item.name}
    layout={layout}
    selectionMode="single"
    renderItem={(item, itemProps) => (
      <div {...itemProps} data-testid={`item-${item.id}`}>
        {item.name}
      </div>
    )}
  >
    {(CollectionElements) => CollectionElements}
  </Collection>
);

/**
 * The listbox names the row a keyboard is on, which is the only thing a screen
 * reader on the listbox has to go by.
 *
 * It used to be read off the selection manager during render. That manager is
 * deliberately stable and resolves everything through the store, so the
 * container never re-rendered when an arrow key moved the focus — and the
 * attribute stayed at whatever it had been when the list was first drawn,
 * which for a list entered by keyboard is nothing at all.
 */
describe('a collection’s active descendant', () => {
  it('names the row focus entered on, and follows the arrow keys', async () => {
    const user = userEvent.setup();
    render(list());

    const listbox = screen.getByRole('listbox', { name: 'Results' });
    expect(listbox).not.toHaveAttribute('aria-activedescendant');

    // Entered with the keyboard, which is the path that was broken: nothing
    // outside the collection's own store changes, so a container that reads
    // the focused row off the stable selection manager during render never
    // re-renders and the attribute stays absent.
    await user.tab();
    expect(listbox.contains(document.activeElement)).toBe(true);
    expect(listbox).toHaveAttribute('aria-activedescendant', 'results-item-1');

    await user.keyboard('{ArrowDown}');
    expect(listbox).toHaveAttribute('aria-activedescendant', 'results-item-2');

    await user.keyboard('{End}');
    expect(listbox).toHaveAttribute('aria-activedescendant', 'results-item-3');
  });

  it('names a row that exists, so a reader is never sent to nothing', async () => {
    const user = userEvent.setup();
    render(list());

    const listbox = screen.getByRole('listbox', { name: 'Results' });
    await user.click(screen.getByTestId('item-2'));

    const named = listbox.getAttribute('aria-activedescendant');
    expect(named).not.toBeNull();
    expect(document.getElementById(named ?? '')).toBe(
      screen.getByTestId('item-2'),
    );
  });
});

/**
 * A `<section>` is a `region` landmark and accepts almost no explicit role, so
 * a collection's `role="listbox"` on one is a role ARIA does not allow there —
 * an axe `aria-allowed-role` failure, and a role a browser may decline to
 * apply at all. `ScrollArea` drops the `<section>` for any caller that says
 * what its viewport is.
 */
describe('a collection’s viewport element', () => {
  it('is not a section, because a section may not be a listbox', () => {
    render(list());

    const listbox = screen.getByRole('listbox', { name: 'Results' });
    expect(listbox.tagName).toBe('DIV');
  });
});
