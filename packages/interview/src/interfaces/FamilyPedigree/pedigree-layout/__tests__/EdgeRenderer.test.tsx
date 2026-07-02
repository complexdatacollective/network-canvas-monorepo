import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { edgeKey } from '~/interfaces/NarrativePedigree/highlight';

import { PedigreeEdgeSvg } from '../components/EdgeRenderer';
import type { ConnectorRenderData } from '../pedigreeAdapter';
import type {
  DuplicateArc,
  ParentChildConnector,
  ParentGroupConnector,
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
// PedigreeEdgeSvg — per-segment SIBLING BAR dimming (focal view)
//
// The sibling bar joins a set of siblings (each child's upline drops from it;
// the parents' descent drops onto it via parentLink). When a focal node is
// selected it must be BRIGHT only along the path from the descent junction to a
// contributing child's upline; sub-segments toward non-contributing siblings
// must be DIMMED.
//
// Geometry used by these tests:
//   siblingBar: x from 0 to 200 at y=100
//   uplines:   child1 at x=20  (contributing)
//              child2 at x=180 (non-contributing sibling)
//   parentLink descent junction at x=100 (last parentLink point on the bar y)
//
// Expected: the [100, 20] stretch (descent junction → contributing child) is
// bright; the [100, 180] stretch (toward the non-contributing sibling) is dim.
// ---------------------------------------------------------------------------

const DIM_BLEND_BLACK = 'color-mix(in oklab, black 30%, var(--background))';

/** Find the rendered sibling-bar sub-segment <line>s by their shared y. */
function siblingBarLines(container: HTMLElement, y: number): SVGLineElement[] {
  return Array.from(container.querySelectorAll('line')).filter(
    (line) =>
      Number(line.getAttribute('y1')) === y &&
      Number(line.getAttribute('y2')) === y,
  );
}

/** True when the <line> (or an ancestor) carries data-edge-dimmed="true". */
function isLineDimmed(line: SVGLineElement): boolean {
  return line.closest('[data-edge-dimmed="true"]') !== null;
}

describe('PedigreeEdgeSvg — sibling bar per-segment dimming', () => {
  const FOCAL_CHILD = 'child1';
  const SIBLING = 'child2';
  const PARENT = 'parent1';

  function makeSplitConnector(): ParentChildConnector {
    return makeParentChildConnector({
      // Two uplines: contributing child at x=20, non-contributing at x=180.
      uplines: [seg(20, 150, 20, 100), seg(180, 150, 180, 100)],
      uplineChildIds: [FOCAL_CHILD, SIBLING],
      // Sibling bar spans both uplines.
      siblingBar: seg(0, 100, 200, 100),
      // Descent drops onto the bar at x=100.
      parentLink: [seg(100, 60, 100, 100)],
      parentIds: [PARENT],
    });
  }

  test('sub-segment from descent junction to the contributing child is bright; toward the non-contributing sibling is dimmed', () => {
    const highlightedNodeIds = new Set([FOCAL_CHILD, PARENT]);
    const highlightedEdgeKeys = new Set([edgeKey(PARENT, FOCAL_CHILD)]);

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeConnectorData([makeSplitConnector()])}
        color="black"
        width={300}
        height={300}
        highlightedNodeIds={highlightedNodeIds}
        highlightedEdgeKeys={highlightedEdgeKeys}
      />,
    );

    const barLines = siblingBarLines(container, 100);
    // The bar is split at x=20 (child1 upline), x=100 (descent), x=180 (child2
    // upline) → three sub-segments: [0,20], [20,100], [100,180], [180,200].
    expect(barLines.length).toBeGreaterThanOrEqual(3);

    // Sub-segment covering the path between descent (100) and contributing
    // child upline (20): bright.
    const brightStretch = barLines.find(
      (line) =>
        Number(line.getAttribute('x1')) === 20 &&
        Number(line.getAttribute('x2')) === 100,
    );
    expect(brightStretch).toBeDefined();
    expect(isLineDimmed(brightStretch!)).toBe(false);

    // Sub-segment toward the non-contributing sibling (between 100 and 180): dim.
    const dimStretch = barLines.find(
      (line) =>
        Number(line.getAttribute('x1')) === 100 &&
        Number(line.getAttribute('x2')) === 180,
    );
    expect(dimStretch).toBeDefined();
    expect(isLineDimmed(dimStretch!)).toBe(true);
    expect(dimStretch!.getAttribute('stroke')).toBe(DIM_BLEND_BLACK);
  });

  test('the outer stub beyond the non-contributing sibling is also dimmed', () => {
    const highlightedNodeIds = new Set([FOCAL_CHILD, PARENT]);
    const highlightedEdgeKeys = new Set([edgeKey(PARENT, FOCAL_CHILD)]);

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeConnectorData([makeSplitConnector()])}
        color="black"
        width={300}
        height={300}
        highlightedNodeIds={highlightedNodeIds}
        highlightedEdgeKeys={highlightedEdgeKeys}
      />,
    );

    const barLines = siblingBarLines(container, 100);
    const outerStub = barLines.find(
      (line) =>
        Number(line.getAttribute('x1')) === 180 &&
        Number(line.getAttribute('x2')) === 200,
    );
    expect(outerStub).toBeDefined();
    expect(isLineDimmed(outerStub!)).toBe(true);
  });

  test('with highlight props undefined (FamilyPedigree path), the sibling bar is a single bright segment', () => {
    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeConnectorData([makeSplitConnector()])}
        color="black"
        width={300}
        height={300}
      />,
    );

    expect(container.querySelectorAll('[data-edge-dimmed="true"]').length).toBe(
      0,
    );
    // The whole bar [0, 200] renders as one segment.
    const wholeBar = siblingBarLines(container, 100).find(
      (line) =>
        Number(line.getAttribute('x1')) === 0 &&
        Number(line.getAttribute('x2')) === 200,
    );
    expect(wholeBar).toBeDefined();
    expect(wholeBar!.getAttribute('stroke')).toBe('black');
  });

  // Regression: a child can be in highlightedNodeIds for a reason unrelated to
  // THESE parents (e.g. flagged by a downward-derived status). The sibling bar
  // must NOT light toward it unless one of these parents actually transmits to
  // it (a highlighted parent→child edge), otherwise the bar lights while the
  // links above it stay dim.
  test('a highlighted child with no contributing parent edge does NOT light the bar toward it', () => {
    // Both children are in the highlight set, but only FOCAL_CHILD has a
    // contributing edge from PARENT; SIBLING's highlight is incidental.
    const highlightedNodeIds = new Set([FOCAL_CHILD, SIBLING, PARENT]);
    const highlightedEdgeKeys = new Set([edgeKey(PARENT, FOCAL_CHILD)]);

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeConnectorData([makeSplitConnector()])}
        color="black"
        width={300}
        height={300}
        highlightedNodeIds={highlightedNodeIds}
        highlightedEdgeKeys={highlightedEdgeKeys}
      />,
    );

    const barLines = siblingBarLines(container, 100);
    // The stretch toward the incidentally-highlighted sibling (100 → 180) is dim.
    const towardSibling = barLines.find(
      (line) =>
        Number(line.getAttribute('x1')) === 100 &&
        Number(line.getAttribute('x2')) === 180,
    );
    expect(towardSibling).toBeDefined();
    expect(isLineDimmed(towardSibling!)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PedigreeEdgeSvg — per-segment COUPLE / PARENT BAR (groupLines) dimming
//
// The couple bar joins the two parents; the descent parentLink drops from a
// point on it. The half toward a CONTRIBUTING parent must be BRIGHT; the half
// toward the non-contributing parent must be DIMMED.
// ---------------------------------------------------------------------------

function makeGroupConnectorData(
  groupLines: ParentGroupConnector[],
): ConnectorRenderData {
  return {
    connectors: {
      groupLines,
      parentChildLines: [],
      auxiliaryLines: [],
      twinIndicators: [],
      duplicateArcs: [],
    },
  };
}

function makeCoupleBar(
  overrides: Partial<ParentGroupConnector> = {},
): ParentGroupConnector {
  return {
    type: 'parent-group',
    segment: seg(0, 50, 200, 50),
    double: false,
    isActive: true,
    descentXPositions: [100],
    partnerIds: ['leftParent', 'rightParent'],
    ...overrides,
  };
}

describe('PedigreeEdgeSvg — couple bar per-segment dimming', () => {
  test('the contributing-parent half is bright; the other half is dimmed', () => {
    // Only the left parent contributes.
    const highlightedNodeIds = new Set(['leftParent']);

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeGroupConnectorData([makeCoupleBar()])}
        color="black"
        width={300}
        height={300}
        highlightedNodeIds={highlightedNodeIds}
      />,
    );

    const barLines = siblingBarLines(container, 50);
    // Split at the descent x=100 → two sub-segments [0,100] and [100,200].
    expect(barLines.length).toBe(2);

    const leftHalf = barLines.find(
      (line) =>
        Number(line.getAttribute('x1')) === 0 &&
        Number(line.getAttribute('x2')) === 100,
    );
    const rightHalf = barLines.find(
      (line) =>
        Number(line.getAttribute('x1')) === 100 &&
        Number(line.getAttribute('x2')) === 200,
    );
    expect(leftHalf).toBeDefined();
    expect(rightHalf).toBeDefined();

    // Left parent contributes → left half bright.
    expect(isLineDimmed(leftHalf!)).toBe(false);
    // Right parent does not → right half dim.
    expect(isLineDimmed(rightHalf!)).toBe(true);
    expect(rightHalf!.getAttribute('stroke')).toBe(DIM_BLEND_BLACK);
  });

  test('both parents contributing → both halves bright', () => {
    const highlightedNodeIds = new Set(['leftParent', 'rightParent']);

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeGroupConnectorData([makeCoupleBar()])}
        color="black"
        width={300}
        height={300}
        highlightedNodeIds={highlightedNodeIds}
      />,
    );

    expect(container.querySelectorAll('[data-edge-dimmed="true"]').length).toBe(
      0,
    );
  });

  test('neither parent contributing → both halves dim', () => {
    const highlightedNodeIds = new Set(['someoneElse']);

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeGroupConnectorData([makeCoupleBar()])}
        color="black"
        width={300}
        height={300}
        highlightedNodeIds={highlightedNodeIds}
      />,
    );

    const barLines = siblingBarLines(container, 50);
    expect(barLines.length).toBe(2);
    expect(barLines.every(isLineDimmed)).toBe(true);
  });

  test('with highlightedNodeIds undefined (FamilyPedigree path), the couple bar is a single bright segment', () => {
    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeGroupConnectorData([makeCoupleBar()])}
        color="black"
        width={300}
        height={300}
      />,
    );

    expect(container.querySelectorAll('[data-edge-dimmed="true"]').length).toBe(
      0,
    );
    const wholeBar = siblingBarLines(container, 50).find(
      (line) =>
        Number(line.getAttribute('x1')) === 0 &&
        Number(line.getAttribute('x2')) === 200,
    );
    expect(wholeBar).toBeDefined();
    expect(wholeBar!.getAttribute('stroke')).toBe('black');
  });
});

// ---------------------------------------------------------------------------
// PedigreeEdgeSvg — couple bar uses edge-key TRANSMISSION, not node membership
//
// Regression (#9): a couple bar must light a partner's half only when that
// partner transmits to a contributing child (an outgoing edge in
// highlightedEdgeKeys), NOT merely because the partner node is highlighted. The
// focal person — highlighted, but walked upward only, so it has no outgoing
// highlighted edge — must therefore leave its OWN partner line dimmed.
// ---------------------------------------------------------------------------

describe('PedigreeEdgeSvg — couple bar transmission (edge-key path, #9)', () => {
  test('a highlighted partner that does not transmit (e.g. the focal) leaves its couple bar dim', () => {
    const bar = makeCoupleBar({
      partnerIds: ['focal', 'theirPartner'],
      descentXPositions: [100],
    });
    // The focal is highlighted, but it has NO outgoing highlighted edge (we walk
    // up from it, never down to its children). Its partner is not highlighted.
    const highlightedNodeIds = new Set(['focal']);
    const highlightedEdgeKeys = new Set<string>();

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeGroupConnectorData([bar])}
        color="black"
        width={300}
        height={300}
        highlightedNodeIds={highlightedNodeIds}
        highlightedEdgeKeys={highlightedEdgeKeys}
      />,
    );

    const barLines = siblingBarLines(container, 50);
    expect(barLines.length).toBe(2);
    // Both halves dim — the focal does not light its own partner line.
    expect(barLines.every(isLineDimmed)).toBe(true);
  });

  test('a transmitting parent lights its half; the non-transmitting co-parent half stays dim', () => {
    const bar = makeCoupleBar({
      partnerIds: ['transmitter', 'coParent'],
      descentXPositions: [100],
    });
    // transmitter → child is on the focal lineage; coParent transmits nothing.
    const highlightedNodeIds = new Set(['transmitter', 'child']);
    const highlightedEdgeKeys = new Set([edgeKey('transmitter', 'child')]);

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeGroupConnectorData([bar])}
        color="black"
        width={300}
        height={300}
        highlightedNodeIds={highlightedNodeIds}
        highlightedEdgeKeys={highlightedEdgeKeys}
      />,
    );

    const barLines = siblingBarLines(container, 50);
    const leftHalf = barLines.find(
      (line) =>
        Number(line.getAttribute('x1')) === 0 &&
        Number(line.getAttribute('x2')) === 100,
    );
    const rightHalf = barLines.find(
      (line) =>
        Number(line.getAttribute('x1')) === 100 &&
        Number(line.getAttribute('x2')) === 200,
    );
    expect(leftHalf).toBeDefined();
    expect(rightHalf).toBeDefined();
    // transmitter (left) has an outgoing highlighted edge → bright.
    expect(isLineDimmed(leftHalf!)).toBe(false);
    // coParent (right) transmits nothing on the lineage → dim.
    expect(isLineDimmed(rightHalf!)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PedigreeEdgeSvg — consanguineous DOUBLE couple bar tracks the focal highlight
//
// A consanguineous couple's bar is drawn as two parallel lines. It must dim /
// brighten by the same transmission rule as a single couple bar — per half, via
// highlightedEdgeKeys — on BOTH parallel lines. (Previously the double bar was
// excluded from the split path and fell back to whole-bar node-membership, so it
// did not track the focal lineage.)
// ---------------------------------------------------------------------------

describe('PedigreeEdgeSvg — consanguineous double couple bar', () => {
  test('both parallel lines split by transmission, like a single couple bar', () => {
    const bar = makeCoupleBar({
      partnerIds: ['transmitter', 'coParent'],
      descentXPositions: [100],
      double: true,
      doubleSegment: seg(0, 60, 200, 60),
    });
    const highlightedNodeIds = new Set(['transmitter', 'child']);
    const highlightedEdgeKeys = new Set([edgeKey('transmitter', 'child')]);

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeGroupConnectorData([bar])}
        color="black"
        width={300}
        height={300}
        highlightedNodeIds={highlightedNodeIds}
        highlightedEdgeKeys={highlightedEdgeKeys}
      />,
    );

    // Each of the two parallel lines (y=50, y=60) must split at the descent
    // x=100: the transmitter's (left) half bright, the co-parent's (right) dim.
    for (const y of [50, 60]) {
      const lines = siblingBarLines(container, y);
      const leftHalf = lines.find(
        (l) =>
          Number(l.getAttribute('x1')) === 0 &&
          Number(l.getAttribute('x2')) === 100,
      );
      const rightHalf = lines.find(
        (l) =>
          Number(l.getAttribute('x1')) === 100 &&
          Number(l.getAttribute('x2')) === 200,
      );
      expect(
        leftHalf,
        `line at y=${String(y)} should split at the descent`,
      ).toBeDefined();
      expect(
        rightHalf,
        `line at y=${String(y)} should split at the descent`,
      ).toBeDefined();
      expect(isLineDimmed(leftHalf!)).toBe(false);
      expect(isLineDimmed(rightHalf!)).toBe(true);
    }
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
