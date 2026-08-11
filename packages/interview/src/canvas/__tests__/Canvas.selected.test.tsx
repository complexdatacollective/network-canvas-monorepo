import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

// Stand in for the real node so this exercises what Canvas hands down, without
// pulling in the store and protocol context ConnectedNode needs.
const received: {
  selected?: boolean;
  onSelect?: unknown;
  style?: React.CSSProperties;
}[] = [];
vi.mock('../CanvasNode', () => ({
  default: (props: {
    selected?: boolean;
    onSelect?: unknown;
    style?: React.CSSProperties;
  }) => {
    received.push(props);
    return null;
  },
}));

// Draws edges from the codebook in the store, which this test has no need of.
vi.mock('../EdgeLayer', () => ({ default: () => null }));

import Canvas from '../Canvas';
import { createCanvasStore } from '../useCanvasStore';

// jsdom implements neither observer; the canvas watches its own size and the
// drop target watches size and visibility.
beforeAll(() => {
  const noopObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
  globalThis.ResizeObserver ??=
    noopObserver as unknown as typeof ResizeObserver;
  globalThis.IntersectionObserver ??=
    noopObserver as unknown as typeof IntersectionObserver;
});

const HIGHLIGHT_VAR = 'closeness';
const NODE_ID = 'n1';

const node = (highlighted: boolean): NcNode =>
  ({
    [entityPrimaryKeyProperty]: NODE_ID,
    type: 'person',
    [entityAttributesProperty]: { [HIGHLIGHT_VAR]: highlighted },
  }) as unknown as NcNode;

function renderCanvas(
  props: Partial<React.ComponentProps<typeof Canvas>> = {},
  highlighted = false,
) {
  received.length = 0;
  const store = createCanvasStore();
  store.getState().setPosition(NODE_ID, { x: 0.5, y: 0.5 });

  render(
    <DndStoreProvider>
      <Canvas
        background={null}
        selectedNodeId={null}
        nodes={[node(highlighted)]}
        edges={[]}
        store={store}
        highlightAttribute={HIGHLIGHT_VAR}
        onNodeSelect={vi.fn()}
        {...props}
      />
    </DndStoreProvider>,
  );

  return received[0];
}

describe('Canvas node toggle wiring', () => {
  // The derivation is unit-tested on its own; this asserts Canvas actually
  // routes through it, which a helper test cannot show.
  it('reports the highlight attribute for a highlight prompt', () => {
    expect(renderCanvas({ nodeToggle: 'highlight' }, true)?.selected).toBe(
      true,
    );
    expect(renderCanvas({ nodeToggle: 'highlight' }, false)?.selected).toBe(
      false,
    );
  });

  it('reports the pending edge source for an edge prompt', () => {
    expect(
      renderCanvas({ nodeToggle: 'edge', selectedNodeId: NODE_ID })?.selected,
    ).toBe(true);
    expect(renderCanvas({ nodeToggle: 'edge' })?.selected).toBe(false);
  });

  it('unwires activation entirely for a display-only prompt', () => {
    // highlight.variable set for colour, allowHighlighting off: activation
    // does nothing, so the node must be no kind of toggle — not selectable,
    // and never announced as pressable.
    const props = renderCanvas({ nodeToggle: null }, true);
    expect(props?.onSelect).toBeUndefined();
    expect(props?.selected).toBe(false);
  });

  it('wires activation whenever the prompt has a toggle', () => {
    expect(renderCanvas({ nodeToggle: 'highlight' })?.onSelect).toBeDefined();
    expect(renderCanvas({ nodeToggle: 'edge' })?.onSelect).toBeDefined();
  });
});
