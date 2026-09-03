import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Collection } from '../components/Collection';
import { ListLayout } from '../layout/ListLayout';

type Item = { id: string; name: string };

const items: Item[] = [
  { id: 'b', name: 'Banana' },
  { id: 'a', name: 'Apple' },
  { id: 'c', name: 'Carrot' },
];

function ControlledSortCollection() {
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const layout = useMemo(() => new ListLayout<Item>({ gap: 2 }), []);

  return (
    <>
      <button type="button" onClick={() => setDirection('desc')}>
        Sort descending
      </button>
      <Collection
        items={items}
        keyExtractor={(item) => item.id}
        textValueExtractor={(item) => item.name}
        layout={layout}
        sortBy="name"
        sortDirection={direction}
        sortType="string"
        renderItem={(item, itemProps) => (
          <div {...itemProps} data-testid="sorted-item">
            {item.name}
          </div>
        )}
      >
        {(collectionElements) => collectionElements}
      </Collection>
    </>
  );
}

describe('Collection controlled sorting', () => {
  it('re-sorts rendered items when controlled props change', async () => {
    const user = userEvent.setup();
    render(<ControlledSortCollection />);

    await waitFor(() => {
      expect(
        screen
          .getAllByTestId('sorted-item')
          .map((element) => element.textContent),
      ).toEqual(['Apple', 'Banana', 'Carrot']);
    });

    await user.click(screen.getByRole('button', { name: 'Sort descending' }));

    await waitFor(() => {
      expect(
        screen
          .getAllByTestId('sorted-item')
          .map((element) => element.textContent),
      ).toEqual(['Carrot', 'Banana', 'Apple']);
    });
  });
});

describe('Collection uncontrolled initial sort', () => {
  const layout = new ListLayout<Item>({ gap: 2 });
  const names = (markup: string) =>
    [...markup.matchAll(/data-testid="sorted-item"[^>]*>([^<]+)</g)].map(
      (match) => match[1],
    );

  it('renders the seeded items already sorted by defaultSortBy', () => {
    // The store is seeded with the items before the sort props are read, so
    // the very first markup — including server output — must be sorted.
    const markup = renderToString(
      <Collection
        items={items}
        keyExtractor={(item) => item.id}
        textValueExtractor={(item) => item.name}
        layout={layout}
        defaultSortBy="name"
        defaultSortDirection="desc"
        animate={false}
        renderItem={(item, itemProps) => (
          <div {...itemProps} data-testid="sorted-item">
            {item.name}
          </div>
        )}
      >
        {(collectionElements) => collectionElements}
      </Collection>,
    );

    expect(names(markup)).toEqual(['Carrot', 'Banana', 'Apple']);
  });

  it('renders the seeded items already sorted by uncontrolled sortRules', () => {
    const markup = renderToString(
      <Collection
        items={items}
        keyExtractor={(item) => item.id}
        textValueExtractor={(item) => item.name}
        layout={layout}
        sortRules={[{ property: 'name', direction: 'asc', type: 'string' }]}
        animate={false}
        renderItem={(item, itemProps) => (
          <div {...itemProps} data-testid="sorted-item">
            {item.name}
          </div>
        )}
      >
        {(collectionElements) => collectionElements}
      </Collection>,
    );

    expect(names(markup)).toEqual(['Apple', 'Banana', 'Carrot']);
  });
});
