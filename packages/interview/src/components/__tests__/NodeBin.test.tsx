import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';

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
