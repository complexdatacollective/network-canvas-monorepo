import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { edgeKey } from '~/interfaces/NarrativePedigree/highlight';

import { PedigreeEdgeSvg } from '../components/EdgeRenderer';
import type { ConnectorRenderData } from '../pedigreeAdapter';
import type { ParentChildConnector } from '../types';

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
