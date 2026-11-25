import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';

import { type DndStore, DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { useDndStoreApi } from '@codaco/fresco-ui/dnd/DndStoreProvider';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { createSoundSpy } from '../../sounds/__tests__/soundSpy';
import { InteractionSoundsProvider } from '../../sounds/InteractionSounds';
import NodeBin from '../NodeBin';

// The bin used to be an <img> fed by `import url from './node-bin.svg'`.
// Hosts compile this package with their own bundler, and Next.js resolves
// that import to an object rather than a URL, so Fresco rendered
// `<img src="[object Object]">`. The drawing must not depend on how a host
// treats asset imports: it is inline SVG with its own geometry.
beforeAll(() => {
  // The drop target watches its own size and visibility; jsdom has neither
  // observer.
  class InertObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('ResizeObserver', InertObserver);
  vi.stubGlobal('IntersectionObserver', InertObserver);
});

describe('NodeBin', () => {
  const renderBin = () =>
    render(
      <DndStoreProvider>
        <NodeBin accepts={() => true} dropHandler={vi.fn()} />
      </DndStoreProvider>,
    );

  it('draws the bin inline instead of loading an image asset', () => {
    const { container, getByTestId } = renderBin();

    expect(container.querySelector('img')).toBeNull();

    const drawing = getByTestId('node-bin-illustration');
    expect(drawing.tagName.toLowerCase()).toBe('svg');
    expect(drawing.getAttribute('viewBox')).toBe('0 0 120 140');
    expect(drawing.getAttribute('aria-hidden')).toBe('true');
    expect(
      drawing.querySelectorAll('rect, polygon, circle').length,
    ).toBeGreaterThan(0);
  });

  it('adds nothing to the page that another inline SVG could collide with', () => {
    const { getByTestId } = renderBin();
    const drawing = getByTestId('node-bin-illustration');

    expect(drawing.querySelector('style')).toBeNull();
    expect(drawing.querySelector('[id]')).toBeNull();
    expect(drawing.querySelector('[class]')).toBeNull();
  });
});

function CaptureDndStore({
  onStore,
}: {
  onStore: (store: StoreApi<DndStore>) => void;
}) {
  const store = useDndStoreApi();
  useEffect(() => {
    onStore(store);
  }, [store, onStore]);
  return null;
}

describe('NodeBin drops', () => {
  // A bin that takes only people already named on the question, as a name
  // generator's does.
  function renderBin() {
    const sounds = createSoundSpy();
    const dropHandler = vi.fn();
    let dndStore: StoreApi<DndStore> | undefined;
    render(
      <DndStoreProvider>
        <InteractionSoundsProvider engine={sounds.engine}>
          <CaptureDndStore
            onStore={(store) => {
              dndStore = store;
            }}
          />
          <NodeBin
            accepts={(node) =>
              'itemType' in node && node.itemType === 'EXISTING_NODE'
            }
            dropHandler={dropHandler}
          />
        </InteractionSoundsProvider>
      </DndStoreProvider>,
    );
    // Drops a person of the type the bin takes, whose metadata the stage's
    // filter judges, on the bin.
    const dropOnBin = (itemType: string) => {
      const store = dndStore;
      if (!store) throw new Error('No drag and drop store');
      act(() => {
        store.getState().startDrag(
          {
            id: 'a',
            type: 'EXISTING_NODE',
            metadata: {
              [entityPrimaryKeyProperty]: 'a',
              type: 'person',
              [entityAttributesProperty]: {},
              itemType,
            },
            _sourceZone: null,
          },
          { x: 0, y: 0, width: 10, height: 10 },
        );
      });
      act(() => {
        store.getState().setActiveDropTarget('node-bin');
        store.getState().endDrag();
      });
    };
    return { sounds, dropHandler, dropOnBin };
  }

  it('takes a person the stage lets go in the bin, with the bin’s sound', () => {
    const { sounds, dropHandler, dropOnBin } = renderBin();
    dropOnBin('EXISTING_NODE');
    expect(dropHandler).toHaveBeenCalledTimes(1);
    expect(sounds.play.mock.calls).toEqual([['discard']]);
  });

  it('does not take a person the stage keeps out of the bin, and makes no sound', () => {
    const { sounds, dropHandler, dropOnBin } = renderBin();
    dropOnBin('NEW_NODE');
    expect(dropHandler).not.toHaveBeenCalled();
    expect(sounds.play).not.toHaveBeenCalled();
  });
});
