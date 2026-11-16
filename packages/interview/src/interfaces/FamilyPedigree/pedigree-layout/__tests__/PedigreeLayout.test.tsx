import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import PedigreeLayout from '../components/PedigreeLayout';
import type { PedigreeEdgeType, PedigreeLink } from '../types';

const DIMS = {
  nodeWidth: 100,
  nodeHeight: 100,
};

function makeNodes(entries: { id: string; isEgo?: boolean }[]): string[] {
  return entries.map(({ id }) => id);
}

function makeEdges(
  entries: {
    from: string;
    to: string;
    relationshipType: string;
    isActive?: boolean;
    isGestationalCarrier?: boolean;
  }[],
): PedigreeLink[] {
  return entries.map((e) => ({
    source: e.from,
    target: e.to,
    kind: e.relationshipType as PedigreeEdgeType,
    isActive: e.isActive ?? true,
    isGestationalCarrier: e.isGestationalCarrier ?? false,
  }));
}

const renderNode = (nodeId: string) => (
  <div data-testid={`node-${nodeId}`}>{nodeId}</div>
);

describe('PedigreeLayout', () => {
  test.each([
    { dimension: 'nodeWidth', size: { nodeWidth: 0 } },
    { dimension: 'nodeHeight', size: { nodeHeight: 0 } },
  ])('shows a spinner and no people while $dimension is 0', ({ size }) => {
    const nodes = makeNodes([{ id: 'ego', isEgo: true }]);
    render(
      <PedigreeLayout
        nodeShapes={new Map()}
        nodeIds={nodes}
        links={[]}
        {...DIMS}
        {...size}
        renderNode={renderNode}
      />,
    );
    expect(screen.getByTestId('pedigree-layout-spinner')).toBeInTheDocument();
    expect(screen.queryByTestId('node-ego')).not.toBeInTheDocument();
  });

  test('renders nothing when nodes map is empty', () => {
    const { container } = render(
      <PedigreeLayout
        nodeShapes={new Map()}
        nodeIds={[]}
        links={[]}
        {...DIMS}
        renderNode={renderNode}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  test('renders what renderNode returns for each person', () => {
    const nodes = makeNodes([
      { id: 'father' },
      { id: 'mother' },
      { id: 'ego', isEgo: true },
    ]);
    const edges = makeEdges([
      {
        from: 'father',
        to: 'mother',
        relationshipType: 'partner',
        isActive: true,
      },
      {
        from: 'father',
        to: 'ego',
        relationshipType: 'biological',
        isActive: true,
      },
      {
        from: 'mother',
        to: 'ego',
        relationshipType: 'biological',
        isActive: true,
      },
    ]);

    render(
      <PedigreeLayout
        nodeShapes={new Map()}
        nodeIds={nodes}
        links={edges}
        {...DIMS}
        renderNode={renderNode}
      />,
    );

    expect(screen.getByTestId('node-father')).toHaveTextContent('father');
    expect(screen.getByTestId('node-mother')).toHaveTextContent('mother');
    expect(screen.getByTestId('node-ego')).toHaveTextContent('ego');
  });

  test('places partners side by side on the same row', () => {
    const nodes = makeNodes([
      { id: 'father' },
      { id: 'mother' },
      { id: 'ego', isEgo: true },
    ]);
    const edges = makeEdges([
      {
        from: 'father',
        to: 'mother',
        relationshipType: 'partner',
        isActive: true,
      },
      {
        from: 'father',
        to: 'ego',
        relationshipType: 'biological',
        isActive: true,
      },
      {
        from: 'mother',
        to: 'ego',
        relationshipType: 'biological',
        isActive: true,
      },
    ]);

    render(
      <PedigreeLayout
        nodeShapes={new Map()}
        nodeIds={nodes}
        links={edges}
        {...DIMS}
        renderNode={renderNode}
      />,
    );

    const positionOf = (id: string) => {
      const wrapper = screen.getByTestId(`node-${id}`).parentElement;
      return {
        left: Number.parseFloat(wrapper?.style.left ?? ''),
        top: Number.parseFloat(wrapper?.style.top ?? ''),
      };
    };
    const father = positionOf('father');
    const mother = positionOf('mother');
    expect(Number.isFinite(father.left)).toBe(true);
    expect(Number.isFinite(mother.left)).toBe(true);
    expect(father.top).toBe(mother.top);
    expect(father.left).not.toBe(mother.left);
  });

  test('container has explicit width and height', () => {
    const nodes = makeNodes([
      { id: 'father' },
      { id: 'mother' },
      { id: 'ego', isEgo: true },
    ]);
    const edges = makeEdges([
      {
        from: 'father',
        to: 'mother',
        relationshipType: 'partner',
        isActive: true,
      },
      {
        from: 'father',
        to: 'ego',
        relationshipType: 'biological',
        isActive: true,
      },
      {
        from: 'mother',
        to: 'ego',
        relationshipType: 'biological',
        isActive: true,
      },
    ]);

    const { container } = render(
      <PedigreeLayout
        nodeShapes={new Map()}
        nodeIds={nodes}
        links={edges}
        {...DIMS}
        renderNode={renderNode}
      />,
    );

    const layout = container.firstElementChild as HTMLElement;
    expect(layout.style.width).toBeTruthy();
    expect(layout.style.height).toBeTruthy();
    expect(Number.parseInt(layout.style.width)).toBeGreaterThan(0);
    expect(Number.parseInt(layout.style.height)).toBeGreaterThan(0);
  });

  test('keeps a partnership drawn across rows inside the canvas', () => {
    // A grandparent partnered with their grandchild is drawn across rows,
    // down a lane beside the parent between them.
    const nodes = makeNodes([
      { id: 'grandparent' },
      { id: 'parent' },
      { id: 'grandchild', isEgo: true },
    ]);
    const edges = makeEdges([
      {
        from: 'grandparent',
        to: 'parent',
        relationshipType: 'biological',
        isActive: true,
      },
      {
        from: 'parent',
        to: 'grandchild',
        relationshipType: 'biological',
        isActive: true,
      },
      {
        from: 'grandparent',
        to: 'grandchild',
        relationshipType: 'partner',
        isActive: true,
      },
    ]);

    const { container } = render(
      <PedigreeLayout
        nodeShapes={new Map()}
        nodeIds={nodes}
        links={edges}
        {...DIMS}
        renderNode={renderNode}
      />,
    );

    const layout = container.firstElementChild as HTMLElement;
    const width = Number.parseFloat(layout.style.width);
    const height = Number.parseFloat(layout.style.height);
    const translate = container
      .querySelector('svg g[transform]')
      ?.getAttribute('transform')
      ?.match(/translate\(([-\d.]+),([-\d.]+)\)/);
    const [offsetX, offsetY] = translate
      ? [Number(translate[1]), Number(translate[2])]
      : [0, 0];
    const lines = [...container.querySelectorAll('svg line')];
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      for (const [x, y] of [
        ['x1', 'y1'],
        ['x2', 'y2'],
      ] as const) {
        const px = Number(line.getAttribute(x)) + offsetX;
        const py = Number(line.getAttribute(y)) + offsetY;
        expect(px).toBeGreaterThanOrEqual(0);
        expect(px).toBeLessThanOrEqual(width);
        expect(py).toBeGreaterThanOrEqual(0);
        expect(py).toBeLessThanOrEqual(height);
      }
    }
  });

  test('draws connector lines for the family', () => {
    const nodes = makeNodes([
      { id: 'father' },
      { id: 'mother' },
      { id: 'ego', isEgo: true },
    ]);
    const edges = makeEdges([
      {
        from: 'father',
        to: 'mother',
        relationshipType: 'partner',
        isActive: true,
      },
      {
        from: 'father',
        to: 'ego',
        relationshipType: 'biological',
        isActive: true,
      },
      {
        from: 'mother',
        to: 'ego',
        relationshipType: 'biological',
        isActive: true,
      },
    ]);

    const { container } = render(
      <PedigreeLayout
        nodeShapes={new Map()}
        nodeIds={nodes}
        links={edges}
        {...DIMS}
        renderNode={renderNode}
      />,
    );

    expect(container.querySelectorAll('svg line').length).toBeGreaterThan(0);
  });

  test('parent generation is above child generation', () => {
    const nodes = makeNodes([
      { id: 'father' },
      { id: 'mother' },
      { id: 'ego', isEgo: true },
    ]);
    const edges = makeEdges([
      {
        from: 'father',
        to: 'mother',
        relationshipType: 'partner',
        isActive: true,
      },
      {
        from: 'father',
        to: 'ego',
        relationshipType: 'biological',
        isActive: true,
      },
      {
        from: 'mother',
        to: 'ego',
        relationshipType: 'biological',
        isActive: true,
      },
    ]);

    render(
      <PedigreeLayout
        nodeShapes={new Map()}
        nodeIds={nodes}
        links={edges}
        {...DIMS}
        renderNode={renderNode}
      />,
    );

    const fatherWrapper = screen.getByTestId('node-father').parentElement!;
    const egoWrapper = screen.getByTestId('node-ego').parentElement!;

    const fatherY = Number.parseInt(fatherWrapper.style.top);
    const egoY = Number.parseInt(egoWrapper.style.top);

    expect(fatherY).toBeLessThan(egoY);
  });

  describe('connector dimming via highlightedNodeIds', () => {
    const familyNodes = () =>
      makeNodes([
        { id: 'father' },
        { id: 'mother' },
        { id: 'ego', isEgo: true },
      ]);

    const familyEdges = () =>
      makeEdges([
        {
          from: 'father',
          to: 'mother',
          relationshipType: 'partner',
          isActive: true,
        },
        {
          from: 'father',
          to: 'ego',
          relationshipType: 'biological',
          isActive: true,
        },
        {
          from: 'mother',
          to: 'ego',
          relationshipType: 'biological',
          isActive: true,
        },
      ]);

    test('no data-edge-dimmed attributes when highlightedNodeIds is undefined', () => {
      const { container } = render(
        <PedigreeLayout
          nodeShapes={new Map()}
          nodeIds={familyNodes()}
          links={familyEdges()}
          {...DIMS}
          renderNode={renderNode}
        />,
      );
      expect(
        container.querySelectorAll('[data-edge-dimmed="true"]').length,
      ).toBe(0);
    });

    test('no data-edge-dimmed when all nodes are highlighted', () => {
      const highlightedNodeIds = new Set(['father', 'mother', 'ego']);
      const { container } = render(
        <PedigreeLayout
          nodeShapes={new Map()}
          nodeIds={familyNodes()}
          links={familyEdges()}
          {...DIMS}
          renderNode={renderNode}
          highlightedNodeIds={highlightedNodeIds}
        />,
      );
      expect(
        container.querySelectorAll('[data-edge-dimmed="true"]').length,
      ).toBe(0);
    });

    test('partner line gets data-edge-dimmed when one partner is not highlighted', () => {
      // Only ego and mother are highlighted — father is not
      const highlightedNodeIds = new Set(['mother', 'ego']);
      const { container } = render(
        <PedigreeLayout
          nodeShapes={new Map()}
          nodeIds={familyNodes()}
          links={familyEdges()}
          {...DIMS}
          renderNode={renderNode}
          highlightedNodeIds={highlightedNodeIds}
        />,
      );
      expect(
        container.querySelectorAll('[data-edge-dimmed="true"]').length,
      ).toBeGreaterThan(0);
    });

    test('upline to highlighted child is not dimmed even when partner line is dimmed', () => {
      // Only ego is highlighted
      const highlightedNodeIds = new Set(['ego']);
      const { container } = render(
        <PedigreeLayout
          nodeShapes={new Map()}
          nodeIds={familyNodes()}
          links={familyEdges()}
          {...DIMS}
          renderNode={renderNode}
          highlightedNodeIds={highlightedNodeIds}
        />,
      );
      // The group line (partner bar) should be dimmed — father not highlighted
      const dimmedEls = container.querySelectorAll('[data-edge-dimmed="true"]');
      expect(dimmedEls.length).toBeGreaterThan(0);
    });
  });
});

describe('PedigreeLayout reading order', () => {
  test('renders people generation by generation, left to right', () => {
    const nodeIds = makeNodes([
      { id: 'child' },
      { id: 'mother' },
      { id: 'father' },
    ]);
    const links = makeEdges([
      { from: 'father', to: 'mother', relationshipType: 'partner' },
      { from: 'father', to: 'child', relationshipType: 'biological' },
      { from: 'mother', to: 'child', relationshipType: 'biological' },
    ]);
    render(
      <PedigreeLayout
        nodeShapes={new Map()}
        nodeIds={nodeIds}
        links={links}
        {...DIMS}
        renderNode={renderNode}
      />,
    );
    const order = screen
      .getAllByTestId(/^node-/)
      .map((element) => element.textContent);
    expect(order.at(-1)).toBe('child');
    expect(order.slice(0, 2).toSorted()).toEqual(['father', 'mother']);
  });
});
