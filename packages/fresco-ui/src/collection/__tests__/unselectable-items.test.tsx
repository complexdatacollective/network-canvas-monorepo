import { render, screen } from '@testing-library/react';
import { useMemo } from 'react';
import { describe, expect, it } from 'vitest';

import { Collection } from '../components/Collection';
import { ListLayout } from '../layout/ListLayout';
import type { ItemProps } from '../types';

type Item = { id: string; name: string };

const items: Item[] = [
  { id: '1', name: 'Apple' },
  { id: '2', name: 'Banana' },
];

const seen = new Map<string, ItemProps>();

function Harness({
  selectionMode,
}: {
  selectionMode: 'none' | 'single' | 'multiple';
}) {
  const layout = useMemo(() => new ListLayout<Item>({ gap: 2 }), []);
  return (
    <Collection
      items={items}
      keyExtractor={(item) => item.id}
      textValueExtractor={(item) => item.name}
      layout={layout}
      selectionMode={selectionMode}
      aria-label="Test collection"
      renderItem={(item, itemProps) => {
        seen.set(item.id, itemProps);
        return (
          <div {...itemProps} data-testid={`item-${item.id}`}>
            {item.name}
          </div>
        );
      }}
    >
      {(CollectionElements) => CollectionElements}
    </Collection>
  );
}

describe('Collection items that cannot be selected', () => {
  it('offers no click handler when the collection has no selection', () => {
    seen.clear();
    render(<Harness selectionMode="none" />);

    expect(screen.getByTestId('item-1')).toBeDefined();
    // A handler that exists but does nothing reads as "clickable" to whatever
    // renders the item — a Node then shows a pointer cursor and press
    // feedback for something no press can affect.
    expect(seen.get('1')?.onClick).toBeUndefined();
  });

  it.each(['single', 'multiple'] as const)(
    'still offers a click handler in %s selection',
    (selectionMode) => {
      seen.clear();
      render(<Harness selectionMode={selectionMode} />);

      expect(seen.get('1')?.onClick).toBeInstanceOf(Function);
    },
  );
});
