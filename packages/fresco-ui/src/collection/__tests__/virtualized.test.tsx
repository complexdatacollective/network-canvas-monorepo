import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Collection } from '../components/Collection';
import { ListLayout } from '../layout/ListLayout';

type Item = { id: string; name: string };

const items: Item[] = [
  { id: 'a', name: 'Apple' },
  { id: 'b', name: 'Banana' },
  { id: 'c', name: 'Carrot' },
];

describe('Collection virtualized', () => {
  let clientWidth: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // jsdom lays nothing out; give the scroll viewport a width so the
    // renderer has something to measure against.
    clientWidth = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(600);
  });

  afterEach(() => {
    clientWidth.mockRestore();
  });

  it('lays out items that were already present when it mounted', async () => {
    // The store is seeded with the items, so nothing updates it after mount.
    // The renderer must still find its scroll viewport — an ancestor whose
    // ref is attached after this component's layout effects — without
    // waiting for a re-render that never comes.
    const { container } = render(
      <Collection
        items={items}
        keyExtractor={(item) => item.id}
        textValueExtractor={(item) => item.name}
        layout={new ListLayout<Item>({ gap: 2 })}
        virtualized
        animate={false}
        renderItem={(item, itemProps) => <div {...itemProps}>{item.name}</div>}
      >
        {(collectionElements) => collectionElements}
      </Collection>,
    );

    // jsdom has no viewport height, so no row becomes visible; but once the
    // renderer has found its viewport and measured the items it sizes the
    // scroll body to the rows, which never happens if it is still waiting.
    await waitFor(() => {
      const body = container.querySelector<HTMLElement>('section > .relative');
      expect(body).not.toBeNull();
      expect(Number.parseFloat(body?.style.height ?? '0')).toBeGreaterThan(0);
    });
  });
});
