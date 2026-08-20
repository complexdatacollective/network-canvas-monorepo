import { render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

// The connected node needs redux and a protocol; the centering contract does
// not, so capture what CanvasNode hands down instead.
const received: { style?: React.CSSProperties }[] = [];
vi.mock('../../components/ConnectedNode', () => ({
  default: (props: { style?: React.CSSProperties }) => {
    received.push(props);
    return null;
  },
}));

import CanvasNode from '../CanvasNode';
import { createCanvasStore } from '../useCanvasStore';

const node = {
  [entityPrimaryKeyProperty]: 'n1',
  type: 'person',
  [entityAttributesProperty]: {},
} as unknown as NcNode;

describe('CanvasNode centering', () => {
  it('centers with the independent translate property, never transform', () => {
    received.length = 0;
    const store = createCanvasStore();
    store.getState().setPosition('n1', { x: 0.5, y: 0.5 });

    render(
      <CanvasNode
        node={node}
        canvasRef={createRef<HTMLElement | null>()}
        store={store}
        onSelect={vi.fn()}
      />,
    );

    const style = received[0]?.style ?? {};
    // The press animation writes `transform: scale(...)` on the node's root;
    // transform-based centering would be replaced by it, shifting the node by
    // half its size on every press. The separate `translate` property
    // composes with an animated transform.
    expect(style.translate).toBe('-50% -50%');
    expect(style.transform).toBeUndefined();
  });
});
