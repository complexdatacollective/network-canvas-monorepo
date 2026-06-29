import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { edgeKey } from '~/interfaces/NarrativePedigree/highlight';

import { PedigreeEdgeSvg } from '../components/EdgeRenderer';
import type { ConnectorRenderData } from '../pedigreeAdapter';
import type {
  DuplicateArc,
  ParentChildConnector,
  TwinIndicator,
} from '../types';

// ---------------------------------------------------------------------------
// Minimal segment helpers
// ---------------------------------------------------------------------------

function seg(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): import('../types').LineSegment {
  return { type: 'line', x1, y1, x2, y2 };
}

function makeConnectorData(
  parentChildLines: ParentChildConnector[],
): ConnectorRenderData {
  return {
    connectors: {
      groupLines: [],
      parentChildLines,
      auxiliaryLines: [],
      twinIndicators: [],
      duplicateArcs: [],
    },
  };
}

function makeParentChildConnector(
  overrides: Partial<ParentChildConnector> = {},
): ParentChildConnector {
  return {
    type: 'parent-child',
    edgeType: 'biological',
    uplines: [seg(50, 100, 50, 150)],
    siblingBar: seg(30, 100, 70, 100),
    parentLink: [seg(50, 80, 50, 100)],
    parentIds: ['parent1', 'parent2'],
    uplineChildIds: ['child1'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PedigreeEdgeSvg — highlightedEdgeKeys undefined (FamilyPedigree path)
// ---------------------------------------------------------------------------

describe('PedigreeEdgeSvg — highlightedEdgeKeys undefined', () => {
  test('no data-edge-dimmed when both highlightedNodeIds and highlightedEdgeKeys are undefined', () => {
    const connector = makeParentChildConnector({
      parentIds: ['parent1', 'parent2'],
      uplineChildIds: ['child1'],
    });
    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeConnectorData([connector])}
        color="black"
        width={200}
        height={200}
      />,
    );
    expect(container.querySelectorAll('[data-edge-dimmed="true"]').length).toBe(
      0,
    );
  });
});

// ---------------------------------------------------------------------------
// PedigreeEdgeSvg — edge-key predicate for descent connectors
//
// Regression: a contributing descent line whose NON-TRANSMITTING co-parent is
// excluded from highlight.nodes was incorrectly dimmed because isDimmedByIds
// checked ALL parentIds. The fix uses highlightedEdgeKeys for descent segments.
// ---------------------------------------------------------------------------

describe('PedigreeEdgeSvg — descent connector with non-transmitting co-parent (regression)', () => {
  /**
   * Setup:
   *   transmittingParent (highlighted) + nonTransmittingParent (NOT highlighted)
   *         |
   *       child1 (highlighted)
   *
   * highlight.edges = { 'transmittingParent->child1' }
   * highlight.nodes = { transmittingParent, child1 }
   *
   * The descent connector's upline to child1 should be BRIGHT because
   * edgeKey('transmittingParent', 'child1') ∈ highlightedEdgeKeys.
   * The sibling bar / parentLink should also be BRIGHT for the same reason.
   */
  const TRANSMITTING = 'transmittingParent';
  const NON_TRANSMITTING = 'nonTransmittingParent';
  const CHILD = 'child1';

  const highlightedNodeIds = new Set([TRANSMITTING, CHILD]);
  const highlightedEdgeKeys = new Set([edgeKey(TRANSMITTING, CHILD)]);

  test('the upline to the contributing child is NOT dimmed', () => {
    const connector = makeParentChildConnector({
      parentIds: [TRANSMITTING, NON_TRANSMITTING],
      uplineChildIds: [CHILD],
    });
    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeConnectorData([connector])}
        color="black"
        width={200}
        height={200}
        highlightedNodeIds={highlightedNodeIds}
        highlightedEdgeKeys={highlightedEdgeKeys}
      />,
    );
    expect(container.querySelectorAll('[data-edge-dimmed="true"]').length).toBe(
      0,
    );
  });

  test('the sibling bar and parent link are NOT dimmed', () => {
    const connector = makeParentChildConnector({
      parentIds: [TRANSMITTING, NON_TRANSMITTING],
      uplineChildIds: [CHILD],
    });
    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeConnectorData([connector])}
        color="black"
        width={200}
        height={200}
        highlightedNodeIds={highlightedNodeIds}
        highlightedEdgeKeys={highlightedEdgeKeys}
      />,
    );
    const dimmedEls = container.querySelectorAll('[data-edge-dimmed="true"]');
    expect(dimmedEls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PedigreeEdgeSvg — sibling branch off the contributing lineage IS dimmed
// ---------------------------------------------------------------------------

describe('PedigreeEdgeSvg — sibling branch off contributing lineage is dimmed', () => {
  /**
   * Setup:
   *   transmittingParent + nonTransmittingParent
   *         |           |
   *       child1       sibling (NOT in highlight.edges)
   *
   * highlight.edges = { 'transmittingParent->child1' }
   * highlight.nodes = { transmittingParent, child1 }
   *
   * Two connectors: one for child1 (bright), one for sibling (dimmed).
   * The sibling upline is NOT in highlight.edges → must be dimmed.
   */
  const TRANSMITTING = 'transmittingParent';
  const NON_TRANSMITTING = 'nonTransmittingParent';
  const CHILD = 'child1';
  const SIBLING = 'sibling1';

  const highlightedNodeIds = new Set([TRANSMITTING, CHILD]);
  const highlightedEdgeKeys = new Set([edgeKey(TRANSMITTING, CHILD)]);

  test('the sibling upline IS dimmed when its edge key is not in highlightedEdgeKeys', () => {
    const siblingConnector = makeParentChildConnector({
      parentIds: [TRANSMITTING, NON_TRANSMITTING],
      uplineChildIds: [SIBLING],
    });
    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeConnectorData([siblingConnector])}
        color="black"
        width={200}
        height={200}
        highlightedNodeIds={highlightedNodeIds}
        highlightedEdgeKeys={highlightedEdgeKeys}
      />,
    );
    // The upline to sibling should be dimmed (sibling not in edge keys)
    expect(
      container.querySelectorAll('[data-edge-dimmed="true"]').length,
    ).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// PedigreeEdgeSvg — twin-indicator and duplicate-arc dimming (node-membership)
//
// Twin bars and duplicate arcs are decorative-genetic connectors, NOT
// parent-child lineage, so they dim by node membership (isDimmedByIds), exactly
// like partner bars: a twin bar dims unless BOTH twins are highlighted; a
// duplicate arc dims unless its person is highlighted. FamilyPedigree passes no
// highlight set, so the undefined short-circuit keeps them bright there.
// ---------------------------------------------------------------------------

function makeTwinConnectorData(
  twinIndicators: TwinIndicator[],
): ConnectorRenderData {
  return {
    connectors: {
      groupLines: [],
      parentChildLines: [],
      auxiliaryLines: [],
      twinIndicators,
      duplicateArcs: [],
    },
  };
}

function makeDuplicateArcConnectorData(
  duplicateArcs: DuplicateArc[],
): ConnectorRenderData {
  return {
    connectors: {
      groupLines: [],
      parentChildLines: [],
      auxiliaryLines: [],
      twinIndicators: [],
      duplicateArcs,
    },
  };
}

function makeTwinIndicator(
  overrides: Partial<TwinIndicator> = {},
): TwinIndicator {
  return {
    type: 'twin',
    code: 1,
    segment: seg(40, 80, 60, 80),
    twinIds: ['twinA', 'twinB'],
    ...overrides,
  };
}

function makeDuplicateArc(overrides: Partial<DuplicateArc> = {}): DuplicateArc {
  return {
    type: 'duplicate-arc',
    path: {
      type: 'arc',
      points: [
        { x: 10, y: 10 },
        { x: 20, y: 12 },
        { x: 30, y: 10 },
      ],
      dashed: true,
    },
    personIndex: 0,
    personId: 'dupPerson',
    ...overrides,
  };
}

describe('PedigreeEdgeSvg — twin and duplicate-arc dimming', () => {
  const DIM_BLEND = 'color-mix(in oklab, var(--edge-1) 30%, var(--background))';

  test('twin bar with neither twin highlighted is dimmed (blended stroke + data-edge-dimmed)', () => {
    const highlightedNodeIds = new Set(['someoneElse']);
    const connector = makeTwinIndicator({ twinIds: ['twinA', 'twinB'] });

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeTwinConnectorData([connector])}
        color="var(--edge-1)"
        width={200}
        height={200}
        highlightedNodeIds={highlightedNodeIds}
      />,
    );

    const dimmed = container.querySelectorAll('[data-edge-dimmed="true"]');
    expect(dimmed.length).toBeGreaterThan(0);
    const line = container.querySelector('line');
    expect(line?.getAttribute('stroke')).toBe(DIM_BLEND);
  });

  test('twin bar with BOTH twins highlighted is bright', () => {
    const highlightedNodeIds = new Set(['twinA', 'twinB']);
    const connector = makeTwinIndicator({ twinIds: ['twinA', 'twinB'] });

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeTwinConnectorData([connector])}
        color="var(--edge-1)"
        width={200}
        height={200}
        highlightedNodeIds={highlightedNodeIds}
      />,
    );

    expect(container.querySelectorAll('[data-edge-dimmed="true"]').length).toBe(
      0,
    );
    const line = container.querySelector('line');
    expect(line?.getAttribute('stroke')).toBe('var(--edge-1)');
  });

  test('duplicate arc whose person is NOT highlighted is dimmed', () => {
    const highlightedNodeIds = new Set(['someoneElse']);
    const arc = makeDuplicateArc({ personId: 'dupPerson' });

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeDuplicateArcConnectorData([arc])}
        color="var(--edge-1)"
        width={200}
        height={200}
        highlightedNodeIds={highlightedNodeIds}
      />,
    );

    const dimmed = container.querySelectorAll('[data-edge-dimmed="true"]');
    expect(dimmed.length).toBeGreaterThan(0);
    const polyline = container.querySelector('polyline');
    expect(polyline?.getAttribute('stroke')).toBe(DIM_BLEND);
  });

  test('duplicate arc whose person IS highlighted is bright', () => {
    const highlightedNodeIds = new Set(['dupPerson']);
    const arc = makeDuplicateArc({ personId: 'dupPerson' });

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeDuplicateArcConnectorData([arc])}
        color="var(--edge-1)"
        width={200}
        height={200}
        highlightedNodeIds={highlightedNodeIds}
      />,
    );

    expect(container.querySelectorAll('[data-edge-dimmed="true"]').length).toBe(
      0,
    );
  });

  test('with highlightedNodeIds undefined, neither twin nor duplicate arc is dimmed (FamilyPedigree path)', () => {
    const twin = makeTwinIndicator({ twinIds: ['twinA', 'twinB'] });
    const arc = makeDuplicateArc({ personId: 'dupPerson' });

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={{
          connectors: {
            groupLines: [],
            parentChildLines: [],
            auxiliaryLines: [],
            twinIndicators: [twin],
            duplicateArcs: [arc],
          },
        }}
        color="var(--edge-1)"
        width={200}
        height={200}
      />,
    );

    expect(container.querySelectorAll('[data-edge-dimmed="true"]').length).toBe(
      0,
    );
    expect(container.querySelector('line')?.getAttribute('stroke')).toBe(
      'var(--edge-1)',
    );
    expect(container.querySelector('polyline')?.getAttribute('stroke')).toBe(
      'var(--edge-1)',
    );
  });

  test('twin bar with no twinIds (id-less connector) stays bright even with a highlight set', () => {
    const highlightedNodeIds = new Set(['someoneElse']);
    const connector = makeTwinIndicator({ twinIds: undefined });

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeTwinConnectorData([connector])}
        color="var(--edge-1)"
        width={200}
        height={200}
        highlightedNodeIds={highlightedNodeIds}
      />,
    );

    expect(container.querySelectorAll('[data-edge-dimmed="true"]').length).toBe(
      0,
    );
  });
});

// ---------------------------------------------------------------------------
// PedigreeLayout integration — highlightedEdgeKeys threads through
// ---------------------------------------------------------------------------

import type { NcEdge, NcNode } from '@codaco/shared-consts';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import PedigreeLayout from '../components/PedigreeLayout';

const variableConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'rel',
  isActiveVariable: 'active',
  isGestationalCarrierVariable: 'gc',
  gameteRoleVariable: 'gameteRole',
  biologicalSexVariable: 'biologicalSex',
};

const DIMS = { nodeWidth: 100, nodeHeight: 100 };

function makeNodes(
  entries: { id: string; isEgo?: boolean }[],
): Map<string, NcNode> {
  const map = new Map<string, NcNode>();
  for (const { id, isEgo } of entries) {
    map.set(id, {
      _uid: id,
      type: 'person',
      attributes: { [variableConfig.egoVariable]: isEgo ?? false },
    });
  }
  return map;
}

function makeEdges(
  entries: {
    from: string;
    to: string;
    relationshipType: string;
    isActive: boolean;
  }[],
): Map<string, NcEdge> {
  const map = new Map<string, NcEdge>();
  entries.forEach((e, i) => {
    map.set(`e${i}`, {
      _uid: `e${i}`,
      type: 'family',
      from: e.from,
      to: e.to,
      attributes: {
        [variableConfig.relationshipTypeVariable]: [e.relationshipType],
        [variableConfig.isActiveVariable]: e.isActive,
      },
    });
  });
  return map;
}

const renderNode = (node: NcNode & { id: string }) => (
  <div data-testid={`node-${node.id}`}>{node.id}</div>
);

describe('PedigreeLayout — highlightedEdgeKeys prop forwarded', () => {
  test('no dimmed edges when highlightedEdgeKeys is undefined (FamilyPedigree path)', () => {
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
        nodes={nodes}
        edges={edges}
        variableConfig={variableConfig}
        {...DIMS}
        renderNode={renderNode}
      />,
    );
    expect(container.querySelectorAll('[data-edge-dimmed="true"]').length).toBe(
      0,
    );
  });

  test('accepts highlightedEdgeKeys prop without error', () => {
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

    const highlightedEdgeKeys = new Set([edgeKey('mother', 'ego')]);
    const highlightedNodeIds = new Set(['mother', 'ego']);

    expect(() =>
      render(
        <PedigreeLayout
          nodes={nodes}
          edges={edges}
          variableConfig={variableConfig}
          {...DIMS}
          renderNode={renderNode}
          highlightedNodeIds={highlightedNodeIds}
          highlightedEdgeKeys={highlightedEdgeKeys}
        />,
      ),
    ).not.toThrow();
  });
});
