import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import {
  auxiliaryPath,
  edgeKey,
  PedigreeEdgeSvg,
} from '../components/EdgeRenderer';
import { dimColor } from '../dimColor';
import { type ConnectorRenderData, drawPedigree } from '../pedigreeAdapter';
import type {
  AuxiliaryConnector,
  DescentPiece,
  DuplicateArc,
  LineSegment,
  ParentChildConnector,
  ParentGroupConnector,
  TwinIndicator,
  PedigreeEdgeType,
  PedigreeLink,
  Upline,
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

/** A child's line up, naming the child. */
function ofChild(segment: LineSegment, childId: string): Upline {
  return { ...segment, childId };
}

/** A piece of a line of descent carrying only these parents' ties. */
function carrying(segment: LineSegment, parentIds: string[]): DescentPiece {
  return { ...segment, parentIds };
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
    // A lone child: the line runs straight down to them, with no bar.
    uplines: [ofChild(seg(50, 100, 50, 150), 'child1')],
    parentLink: [seg(50, 80, 50, 100)],
    parentIds: ['parent1', 'parent2'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PedigreeEdgeSvg — highlightedEdgeKeys undefined (FamilyPedigree path)
// ---------------------------------------------------------------------------

describe('PedigreeEdgeSvg — highlightedEdgeKeys undefined', () => {
  test('no data-edge-dimmed when both highlightedNodeIds and highlightedEdgeKeys are undefined', () => {
    const connector = makeParentChildConnector({
      uplines: [ofChild(seg(50, 100, 50, 150), 'child1')],
      parentIds: ['parent1', 'parent2'],
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
   * The line down from the parents should also be BRIGHT for the same reason.
   */
  const TRANSMITTING = 'transmittingParent';
  const NON_TRANSMITTING = 'nonTransmittingParent';
  const CHILD = 'child1';

  const highlightedNodeIds = new Set([TRANSMITTING, CHILD]);
  const highlightedEdgeKeys = new Set([edgeKey(TRANSMITTING, CHILD)]);

  test('the upline to the contributing child is NOT dimmed', () => {
    const connector = makeParentChildConnector({
      uplines: [ofChild(seg(50, 100, 50, 150), CHILD)],
      parentIds: [TRANSMITTING, NON_TRANSMITTING],
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

  test('the line down from the parents is NOT dimmed', () => {
    const connector = makeParentChildConnector({
      uplines: [ofChild(seg(50, 100, 50, 150), CHILD)],
      parentIds: [TRANSMITTING, NON_TRANSMITTING],
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
      uplines: [ofChild(seg(50, 100, 50, 150), SIBLING)],
      parentIds: [TRANSMITTING, NON_TRANSMITTING],
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

// Derive the dimmed stroke from dimColor itself, so these assertions verify the
// renderer dims *via* dimColor rather than duplicating its exact output string
// (which would go stale whenever the blend target changes, e.g. the snapshot
// re-theme to --dim-blend).
const DIM_BLEND_BLACK = dimColor('black');

/** The points a <polyline> or straight-line <path> stroke runs through. */
function drawnPoints(el: Element): { x: number; y: number }[] {
  if (el.tagName === 'path') {
    return [
      ...(el.getAttribute('d') ?? '').matchAll(/[ML]([\d.-]+),([\d.-]+)/g),
    ].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
  }
  return (el.getAttribute('points') ?? '')
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [px, py] = pair.split(',').map(Number);
      return { x: px!, y: py! };
    });
}

/**
 * The rendered stroke (a <line>, or a <polyline> the bar's pieces are joined
 * into) that draws the sibling bar at the point (x, y).
 */
function barStrokeAt(
  container: HTMLElement,
  x: number,
  y: number,
): SVGElement | undefined {
  const runsThrough = (points: { x: number; y: number }[]) =>
    points
      .slice(1)
      .some(
        (to, k) =>
          points[k]!.y === y &&
          to.y === y &&
          Math.min(points[k]!.x, to.x) <= x &&
          Math.max(points[k]!.x, to.x) >= x,
      );
  for (const line of Array.from(container.querySelectorAll('line'))) {
    const points = [
      {
        x: Number(line.getAttribute('x1')),
        y: Number(line.getAttribute('y1')),
      },
      {
        x: Number(line.getAttribute('x2')),
        y: Number(line.getAttribute('y2')),
      },
    ];
    if (runsThrough(points)) return line;
  }
  for (const stroke of Array.from(
    container.querySelectorAll<SVGElement>('polyline, path'),
  )) {
    if (runsThrough(drawnPoints(stroke))) return stroke;
  }
  return undefined;
}

/** Find the rendered horizontal <line>s (couple-bar pieces) at a shared y. */
function siblingBarLines(container: HTMLElement, y: number): SVGLineElement[] {
  return Array.from(container.querySelectorAll('line')).filter(
    (line) =>
      Number(line.getAttribute('y1')) === y &&
      Number(line.getAttribute('y2')) === y,
  );
}

/** True when the stroke (or an ancestor) carries data-edge-dimmed="true". */
function isLineDimmed(line: SVGElement): boolean {
  return line.closest('[data-edge-dimmed="true"]') !== null;
}

describe('PedigreeEdgeSvg — sibling bar per-segment dimming', () => {
  const FOCAL_CHILD = 'child1';
  const SIBLING = 'child2';
  const PARENT = 'parent1';

  function makeSplitConnector(): ParentChildConnector {
    return makeParentChildConnector({
      // Two uplines: contributing child at x=20, non-contributing at x=180.
      uplines: [
        ofChild(seg(20, 150, 20, 100), FOCAL_CHILD),
        ofChild(seg(180, 150, 180, 100), SIBLING),
      ],
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

    // The bar is split at x=20 (child1 upline), x=100 (descent), x=180 (child2
    // upline). The stretch between the descent (100) and the contributing
    // child's upline (20) is bright.
    const brightStretch = barStrokeAt(container, 60, 100);
    expect(brightStretch).toBeDefined();
    expect(isLineDimmed(brightStretch!)).toBe(false);

    // The stretch toward the non-contributing sibling (between 100 and 180) is
    // dim, drawn apart from the bright one.
    const dimStretch = barStrokeAt(container, 140, 100);
    expect(dimStretch).toBeDefined();
    expect(dimStretch).not.toBe(brightStretch);
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

    const outerStub = barStrokeAt(container, 190, 100);
    expect(outerStub).toBeDefined();
    expect(isLineDimmed(outerStub!)).toBe(true);
  });

  test('with highlight props undefined (FamilyPedigree path), the whole sibling bar is bright', () => {
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
    // The whole bar [0, 200] is drawn bright, by strokes that run away from
    // where the parents' drop meets it.
    for (const x of [0, 60, 140, 200]) {
      expect(barStrokeAt(container, x, 100)?.getAttribute('stroke')).toBe(
        'black',
      );
    }
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

    // The stretch toward the incidentally-highlighted sibling (100 → 180) is dim.
    const towardSibling = barStrokeAt(container, 140, 100);
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

/** A partnership line with one child's line of descent dropping from its
 * middle (from its lower rail, when it has two). */
function makeCoupleWithChild(
  bar: ParentGroupConnector,
  childId = 'child',
): ConnectorRenderData {
  const railY = (bar.doubleSegment ?? bar.segment).y1;
  return {
    connectors: {
      groupLines: [bar],
      parentChildLines: [
        makeParentChildConnector({
          uplines: [ofChild(seg(100, 150, 100, 100), childId)],
          parentLink: [seg(100, railY, 100, 100)],
          parentIds: bar.partnerIds ? [...bar.partnerIds] : [],
        }),
      ],
      auxiliaryLines: [],
      twinIndicators: [],
      duplicateArcs: [],
    },
  };
}

/** The rendered stroke running upright through the point (x, y). */
function uprightStrokeAt(
  container: HTMLElement,
  x: number,
  y: number,
): SVGElement | undefined {
  return Array.from(
    container.querySelectorAll<SVGElement>('polyline, path'),
  ).find((stroke) => {
    const points = drawnPoints(stroke);
    return points
      .slice(1)
      .some(
        (to, k) =>
          points[k]!.x === x &&
          to.x === x &&
          Math.min(points[k]!.y, to.y) <= y &&
          Math.max(points[k]!.y, to.y) >= y,
      );
  });
}

describe('PedigreeEdgeSvg — a run of the sibship hanging from its own stem', () => {
  // Child 1 and child 2 share a donor the third child does not: they hang
  // from a sub-bar at y=130, on a stem down from the sibling bar at x=40.
  const connector = makeParentChildConnector({
    uplines: [
      ofChild(seg(20, 150, 20, 130), 'child1'),
      ofChild(seg(60, 150, 60, 130), 'child2'),
      ofChild(seg(180, 150, 180, 100), 'child3'),
    ],
    siblingBar: seg(40, 100, 180, 100),
    parentLink: [seg(100, 60, 100, 100)],
    parentIds: ['parent1'],
    runs: [{ stem: seg(40, 100, 40, 130), bar: seg(20, 130, 60, 130) }],
  });
  const draw = (lit?: string) =>
    render(
      <PedigreeEdgeSvg
        connectorData={makeConnectorData([connector])}
        color="black"
        width={300}
        height={300}
        {...(lit
          ? {
              highlightedNodeIds: new Set([lit, 'parent1']),
              highlightedEdgeKeys: new Set([edgeKey('parent1', lit)]),
            }
          : {})}
      />,
    ).container;

  test('draws the stem and the sub-bar', () => {
    const container = draw();
    expect(uprightStrokeAt(container, 40, 115)).toBeDefined();
    expect(barStrokeAt(container, 50, 130)).toBeDefined();
    expect(barStrokeAt(container, 30, 130)).toBeDefined();
  });

  test('lights the way down the stem to a contributing child of the run, and dims the rest', () => {
    const container = draw('child1');
    expect(isLineDimmed(uprightStrokeAt(container, 40, 115)!)).toBe(false);
    expect(isLineDimmed(barStrokeAt(container, 70, 100)!)).toBe(false);
    expect(isLineDimmed(barStrokeAt(container, 30, 130)!)).toBe(false);
    expect(isLineDimmed(barStrokeAt(container, 50, 130)!)).toBe(true);
    expect(isLineDimmed(barStrokeAt(container, 140, 100)!)).toBe(true);
  });

  test('dims the stem and its sub-bar when only a child outside the run contributes', () => {
    const container = draw('child3');
    expect(isLineDimmed(uprightStrokeAt(container, 40, 115)!)).toBe(true);
    expect(isLineDimmed(barStrokeAt(container, 30, 130)!)).toBe(true);
    expect(isLineDimmed(barStrokeAt(container, 70, 100)!)).toBe(true);
    expect(isLineDimmed(barStrokeAt(container, 140, 100)!)).toBe(false);
  });
});

describe('PedigreeEdgeSvg — couple bar per-segment dimming', () => {
  test('the contributing-parent half is bright; the other half is dimmed', () => {
    // Only the left parent contributes to the couple's child.
    const highlightedNodeIds = new Set(['leftParent', 'child']);

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeCoupleWithChild(makeCoupleBar())}
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
    const highlightedNodeIds = new Set(['leftParent', 'rightParent', 'child']);

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeCoupleWithChild(makeCoupleBar())}
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

  test('renders endpoint leads for a routed non-adjacent partnership', () => {
    const routedBar = makeCoupleBar({
      segment: seg(20, 25, 180, 25),
      endpointSegments: [seg(20, 100, 20, 25), seg(180, 100, 180, 25)],
      isActive: false,
      descentXPositions: undefined,
    });

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeGroupConnectorData([routedBar])}
        color="black"
        width={200}
        height={120}
      />,
    );

    const verticalLeads = Array.from(container.querySelectorAll('line')).filter(
      (line) =>
        line.getAttribute('x1') === line.getAttribute('x2') &&
        line.getAttribute('y1') === '100' &&
        line.getAttribute('y2') === '25',
    );
    expect(verticalLeads).toHaveLength(2);
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
        connectorData={makeCoupleWithChild(bar)}
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
        connectorData={makeCoupleWithChild(bar)}
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
  const DIM_BLEND = dimColor('var(--edge-1)');

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

  test('draws the unknown-zygosity question mark at the size it is given', () => {
    const connector = makeTwinIndicator({
      code: 3,
      segment: undefined,
      label: { x: 50, y: 80 },
      labelSize: 32,
    });
    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeTwinConnectorData([connector])}
        color="var(--edge-1)"
        width={200}
        height={200}
      />,
    );
    expect(container.querySelector('text')?.getAttribute('font-size')).toBe(
      '32',
    );
  });
});

// ---------------------------------------------------------------------------
// PedigreeLayout integration — highlightedEdgeKeys threads through
// ---------------------------------------------------------------------------

import PedigreeLayout from '../components/PedigreeLayout';

const DIMS = { nodeWidth: 100, nodeHeight: 100 };

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
        nodeShapes={new Map()}
        nodeIds={nodes}
        links={edges}
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
          nodeShapes={new Map()}
          nodeIds={nodes}
          links={edges}
          {...DIMS}
          renderNode={renderNode}
          highlightedNodeIds={highlightedNodeIds}
          highlightedEdgeKeys={highlightedEdgeKeys}
        />,
      ),
    ).not.toThrow();
  });
});

describe('auxiliary lines that cross another line', () => {
  test('hop over each crossing with a half circle, and are drawn whole elsewhere', () => {
    const hopped = auxiliaryPath({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      hops: [
        { x: 50, y: 0 },
        { x: 100, y: 60 },
      ],
    });
    // Level piece: up to the hop, over it, on to the corner.
    expect(hopped).toMatch(/^M0,0 L42,0 A8,8 0 0 1 58,0 L100,0 /);
    // Upright piece: down to the hop, round it, on to the end.
    expect(hopped).toMatch(/L100,52 A8,8 0 0 1 100,68 L100,100$/);

    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={{
          connectors: {
            groupLines: [],
            parentChildLines: [],
            auxiliaryLines: [
              {
                type: 'auxiliary',
                edgeType: 'social',
                points: [
                  { x: 0, y: 0 },
                  { x: 100, y: 0 },
                ],
                hops: [{ x: 50, y: 0 }],
              },
              {
                type: 'auxiliary',
                edgeType: 'donor',
                points: [
                  { x: 0, y: 20 },
                  { x: 100, y: 20 },
                ],
              },
            ],
            twinIndicators: [],
            duplicateArcs: [],
          },
        }}
        color="var(--edge-1)"
        width={200}
        height={200}
      />,
    );
    const path = container.querySelector('path');
    expect(path?.getAttribute('d')).toContain('A8,8');
    expect(path?.getAttribute('stroke-dasharray')).toBe('8 8');
    expect(
      Array.from(container.querySelectorAll('path')).map((el) =>
        el.getAttribute('d'),
      ),
    ).toContain('M0,20 L100,20');
  });
});

describe('PedigreeEdgeSvg — a donor’s line carries the lineage on down the line of descent it joins', () => {
  // Child 1 and child 2 share a donor the third child does not: they hang
  // from a sub-bar at y=130 on a stem at x=40, which the donor's line meets
  // at y=115. A second donor's line meets child 3's own line up at y=120.
  // Parent 1 transmits to no one.
  const connector = makeParentChildConnector({
    uplines: [
      ofChild(seg(20, 150, 20, 130), 'child1'),
      ofChild(seg(60, 150, 60, 130), 'child2'),
      ofChild(seg(180, 150, 180, 100), 'child3'),
    ],
    siblingBar: seg(40, 100, 180, 100),
    parentLink: [seg(100, 60, 100, 100)],
    parentIds: ['parent1'],
    runs: [{ stem: seg(40, 100, 40, 130), bar: seg(20, 130, 60, 130) }],
  });
  const donorLine = (
    donor: string,
    end: { x: number; y: number },
  ): AuxiliaryConnector => ({
    type: 'auxiliary',
    edgeType: 'donor',
    points: [{ x: end.x - 30, y: 0 }, { x: end.x - 30, y: end.y }, end],
    endpointIds: [donor, undefined],
  });
  const draw = (edges: string[]) =>
    render(
      <PedigreeEdgeSvg
        connectorData={{
          connectors: {
            groupLines: [],
            parentChildLines: [connector],
            auxiliaryLines: [
              donorLine('donor', { x: 40, y: 115 }),
              donorLine('donor2', { x: 180, y: 120 }),
            ],
            twinIndicators: [],
            duplicateArcs: [],
          },
        }}
        color="black"
        width={300}
        height={300}
        highlightedNodeIds={new Set(edges.flatMap((edge) => edge.split('->')))}
        highlightedEdgeKeys={new Set(edges)}
      />,
    ).container;

  test('lights the stem below the donor’s line, the sub-bar and the line up to the child the donor gave the lineage to', () => {
    const container = draw([edgeKey('donor', 'child1')]);
    expect(isLineDimmed(uprightStrokeAt(container, 40, 125)!)).toBe(false);
    expect(isLineDimmed(barStrokeAt(container, 30, 130)!)).toBe(false);
    expect(isLineDimmed(uprightStrokeAt(container, 20, 140)!)).toBe(false);
    // Above where the donor's line meets it, the stem carries only the
    // parents' line of descent, which transmits nothing.
    expect(isLineDimmed(uprightStrokeAt(container, 40, 105)!)).toBe(true);
    expect(isLineDimmed(barStrokeAt(container, 50, 130)!)).toBe(true);
    expect(isLineDimmed(uprightStrokeAt(container, 60, 140)!)).toBe(true);
    expect(isLineDimmed(barStrokeAt(container, 70, 100)!)).toBe(true);
  });

  test('lights a lone child’s line up below where a donor’s line meets it', () => {
    const container = draw([edgeKey('donor2', 'child3')]);
    expect(isLineDimmed(uprightStrokeAt(container, 180, 135)!)).toBe(false);
    expect(isLineDimmed(uprightStrokeAt(container, 180, 110)!)).toBe(true);
    expect(isLineDimmed(uprightStrokeAt(container, 40, 125)!)).toBe(true);
  });
});

describe('PedigreeEdgeSvg — co-parents with no partnership line', () => {
  // A line down from Ann (x=0) and from Bob (x=100) to y=62, a level line
  // joining them, and one line from x=50 down to their child.
  const connector = makeParentChildConnector({
    uplines: [ofChild(seg(50, 150, 50, 100), 'child1')],
    siblingBar: undefined,
    parentLink: [
      carrying(seg(0, 25, 0, 62), ['ann']),
      carrying(seg(100, 25, 100, 62), ['bob']),
      carrying(seg(0, 62, 50, 62), ['ann']),
      carrying(seg(50, 62, 100, 62), ['bob']),
      carrying(seg(50, 62, 50, 100), ['ann', 'bob']),
    ],
    parentIds: ['ann', 'bob'],
  });

  test('light the line down from the parent who transmits, and dim the other’s until the two join', () => {
    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeConnectorData([connector])}
        color="black"
        width={300}
        height={300}
        highlightedNodeIds={new Set(['ann', 'bob', 'child1'])}
        highlightedEdgeKeys={new Set([edgeKey('ann', 'child1')])}
      />,
    );
    expect(isLineDimmed(uprightStrokeAt(container, 0, 40)!)).toBe(false);
    expect(isLineDimmed(barStrokeAt(container, 25, 62)!)).toBe(false);
    expect(isLineDimmed(uprightStrokeAt(container, 50, 80)!)).toBe(false);
    expect(isLineDimmed(uprightStrokeAt(container, 100, 40)!)).toBe(true);
    expect(isLineDimmed(barStrokeAt(container, 75, 62)!)).toBe(true);
  });

  test('light the other parent’s line down when theirs is the lit tie', () => {
    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={makeConnectorData([connector])}
        color="black"
        width={300}
        height={300}
        highlightedNodeIds={new Set(['ann', 'bob', 'child1'])}
        highlightedEdgeKeys={new Set([edgeKey('bob', 'child1')])}
      />,
    );
    expect(isLineDimmed(uprightStrokeAt(container, 100, 40)!)).toBe(false);
    expect(isLineDimmed(barStrokeAt(container, 75, 62)!)).toBe(false);
    expect(isLineDimmed(uprightStrokeAt(container, 50, 80)!)).toBe(false);
    expect(isLineDimmed(uprightStrokeAt(container, 0, 40)!)).toBe(true);
    expect(isLineDimmed(barStrokeAt(container, 25, 62)!)).toBe(true);
  });
});

describe('PedigreeEdgeSvg — two co-parents’ lines that join', () => {
  // Each comes down from their own symbol and runs level at y=50; from
  // (100, 50) they are one line down to the child.
  const joined = (dimmedLead: boolean) => {
    const lines: AuxiliaryConnector[] = [
      {
        type: 'auxiliary',
        edgeType: 'social',
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 50 },
          { x: 100, y: 50 },
          { x: 100, y: 100 },
        ],
        endpointIds: ['lead', 'child'],
        joinsAt: 2,
      },
      {
        type: 'auxiliary',
        edgeType: 'social',
        points: [
          { x: 200, y: 0 },
          { x: 200, y: 50 },
          { x: 100, y: 50 },
          { x: 100, y: 100 },
        ],
        endpointIds: ['mate', 'child'],
        joinsAt: 2,
      },
    ];
    return render(
      <PedigreeEdgeSvg
        connectorData={{
          connectors: {
            groupLines: [],
            parentChildLines: [],
            auxiliaryLines: lines,
            twinIndicators: [],
            duplicateArcs: [],
          },
        }}
        color="black"
        width={300}
        height={300}
        {...(dimmedLead
          ? { highlightedNodeIds: new Set(['mate', 'child']) }
          : {})}
      />,
    ).container;
  };
  const strokesThrough = (container: HTMLElement, x: number, y: number) =>
    Array.from(container.querySelectorAll('polyline, path')).filter((el) => {
      const points =
        el.tagName === 'path'
          ? [
              ...(el.getAttribute('d') ?? '').matchAll(
                /[ML]([\d.-]+),([\d.-]+)/g,
              ),
            ].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
          : (el.getAttribute('points') ?? '')
              .trim()
              .split(/\s+/)
              .map((pair) => {
                const [px, py] = pair.split(',').map(Number);
                return { x: px!, y: py! };
              });
      return points
        .slice(1)
        .some(
          (to, k) =>
            Math.min(points[k]!.x, to.x) <= x &&
            Math.max(points[k]!.x, to.x) >= x &&
            Math.min(points[k]!.y, to.y) <= y &&
            Math.max(points[k]!.y, to.y) >= y,
        );
    });

  test('draw the line they share once, so its dashes keep one rhythm', () => {
    const container = joined(false);
    expect(strokesThrough(container, 100, 75)).toHaveLength(1);
    expect(strokesThrough(container, 0, 25)).toHaveLength(1);
    expect(strokesThrough(container, 200, 25)).toHaveLength(1);
  });

  test('draw it lit when either line is lit', () => {
    const container = joined(true);
    const [shared] = strokesThrough(container, 100, 75);
    expect(strokesThrough(container, 100, 75)).toHaveLength(1);
    expect(isLineDimmed(shared as SVGElement)).toBe(false);
    expect(
      isLineDimmed(strokesThrough(container, 0, 25)[0] as SVGElement),
    ).toBe(true);
  });
});

describe('PedigreeEdgeSvg — a run inside another run', () => {
  // A donor gave to children 1-3, who hang from a sub-bar at y=120 on a
  // stem at x=60; a surrogate carried children 1 and 2, who hang from a
  // sub-bar at y=140 on a stem at x=30 down from the first sub-bar. The
  // donor's line meets the outer stem at y=110. Child 4 hangs from the
  // sibling bar.
  const connector = makeParentChildConnector({
    uplines: [
      ofChild(seg(20, 160, 20, 140), 'child1'),
      ofChild(seg(40, 160, 40, 140), 'child2'),
      ofChild(seg(100, 160, 100, 120), 'child3'),
      ofChild(seg(180, 160, 180, 100), 'child4'),
    ],
    siblingBar: seg(60, 100, 180, 100),
    parentLink: [seg(120, 60, 120, 100)],
    parentIds: ['parent1'],
    runs: [
      { stem: seg(60, 100, 60, 120), bar: seg(20, 120, 100, 120) },
      { stem: seg(30, 120, 30, 140), bar: seg(20, 140, 40, 140) },
    ],
  });
  const draw = (edges: string[]) =>
    render(
      <PedigreeEdgeSvg
        connectorData={{
          connectors: {
            groupLines: [],
            parentChildLines: [connector],
            auxiliaryLines: [
              {
                type: 'auxiliary',
                edgeType: 'donor',
                points: [
                  { x: 0, y: 0 },
                  { x: 0, y: 110 },
                  { x: 60, y: 110 },
                ],
                endpointIds: ['donor', undefined],
              },
            ],
            twinIndicators: [],
            duplicateArcs: [],
          },
        }}
        color="black"
        width={300}
        height={300}
        highlightedNodeIds={new Set(edges.flatMap((edge) => edge.split('->')))}
        highlightedEdgeKeys={new Set(edges)}
      />,
    ).container;

  test('lights the way from the sibling bar down both stems to a contributing child of the inner run', () => {
    const container = draw([edgeKey('parent1', 'child1')]);
    expect(isLineDimmed(barStrokeAt(container, 90, 100)!)).toBe(false);
    expect(isLineDimmed(uprightStrokeAt(container, 60, 115)!)).toBe(false);
    expect(isLineDimmed(barStrokeAt(container, 45, 120)!)).toBe(false);
    expect(isLineDimmed(uprightStrokeAt(container, 30, 130)!)).toBe(false);
    expect(isLineDimmed(barStrokeAt(container, 25, 140)!)).toBe(false);
    expect(isLineDimmed(barStrokeAt(container, 35, 140)!)).toBe(true);
    expect(isLineDimmed(barStrokeAt(container, 80, 120)!)).toBe(true);
    expect(isLineDimmed(barStrokeAt(container, 150, 100)!)).toBe(true);
  });

  test('carries a donor’s lineage from the outer stem down the inner one', () => {
    const container = draw([edgeKey('donor', 'child2')]);
    expect(isLineDimmed(uprightStrokeAt(container, 60, 105)!)).toBe(true);
    expect(isLineDimmed(uprightStrokeAt(container, 60, 115)!)).toBe(false);
    expect(isLineDimmed(barStrokeAt(container, 45, 120)!)).toBe(false);
    expect(isLineDimmed(uprightStrokeAt(container, 30, 130)!)).toBe(false);
    expect(isLineDimmed(barStrokeAt(container, 35, 140)!)).toBe(false);
    expect(isLineDimmed(uprightStrokeAt(container, 40, 150)!)).toBe(false);
    expect(isLineDimmed(uprightStrokeAt(container, 20, 150)!)).toBe(true);
    expect(isLineDimmed(barStrokeAt(container, 90, 100)!)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// One rule for every piece: a piece is lit if and only if a lit tie's course
// passes through it, whatever the line's style or the piece's kind.
// ---------------------------------------------------------------------------

describe('PedigreeEdgeSvg — a piece is lit only by a lit tie whose course passes through it', () => {
  const dashedStroke = (el: SVGElement | undefined) =>
    el?.getAttribute('stroke-dasharray');
  const draw = (
    connectorData: ConnectorRenderData,
    lit: string[],
    people: string[] = lit.flatMap((edge) => edge.split('->')),
  ) =>
    render(
      <PedigreeEdgeSvg
        connectorData={connectorData}
        color="black"
        width={500}
        height={300}
        highlightedNodeIds={new Set(people)}
        highlightedEdgeKeys={new Set(lit)}
      />,
    ).container;
  const withLines = (
    parentChildLines: ParentChildConnector[],
    extra: Partial<ConnectorRenderData['connectors']> = {},
  ): ConnectorRenderData => ({
    connectors: {
      groupLines: [],
      parentChildLines,
      auxiliaryLines: [],
      twinIndicators: [],
      duplicateArcs: [],
      ...extra,
    },
  });

  // Children 1 and 2, conceived with a donor, are raised by two adoptive
  // parents: the line of descent is dashed. They hang from a sub-bar at
  // y=130 on a stem at x=40, which the donor's line meets at y=115.
  const adoptiveRun = makeParentChildConnector({
    edgeType: 'adoptive',
    uplines: [
      ofChild(seg(20, 150, 20, 130), 'child1'),
      ofChild(seg(60, 150, 60, 130), 'child2'),
      ofChild(seg(180, 150, 180, 100), 'child3'),
    ],
    siblingBar: seg(40, 100, 180, 100),
    parentLink: [seg(100, 60, 100, 100)],
    parentIds: ['gran', 'grandad'],
    runs: [{ stem: seg(40, 100, 40, 130), bar: seg(20, 130, 60, 130) }],
  });
  const donorToStem: AuxiliaryConnector = {
    type: 'auxiliary',
    edgeType: 'donor',
    points: [
      { x: 10, y: 0 },
      { x: 10, y: 115 },
      { x: 40, y: 115 },
    ],
    endpointIds: ['donor', undefined],
  };

  test('a dashed line of descent carries a donor’s lit tie down from where the donor’s line meets it', () => {
    const container = draw(
      withLines([adoptiveRun], { auxiliaryLines: [donorToStem] }),
      [edgeKey('donor', 'child1')],
    );
    expect(isLineDimmed(uprightStrokeAt(container, 40, 125)!)).toBe(false);
    expect(isLineDimmed(barStrokeAt(container, 30, 130)!)).toBe(false);
    expect(isLineDimmed(uprightStrokeAt(container, 20, 140)!)).toBe(false);
    expect(isLineDimmed(uprightStrokeAt(container, 40, 105)!)).toBe(true);
    expect(isLineDimmed(barStrokeAt(container, 50, 130)!)).toBe(true);
    expect(isLineDimmed(uprightStrokeAt(container, 60, 140)!)).toBe(true);
    expect(isLineDimmed(barStrokeAt(container, 70, 100)!)).toBe(true);
    // Lit or dim, the line keeps its dashes.
    expect(dashedStroke(uprightStrokeAt(container, 40, 125))).toBe('8 8');
    expect(dashedStroke(uprightStrokeAt(container, 40, 105))).toBe('8 8');
  });

  test('a dashed line keeps one dash rhythm along its whole course, however it is shaded', () => {
    // How far the course has run from the parents' drop (100,60) when it
    // reaches each point a stroke may start at: down the drop, along the
    // sibling bar either way, down the run's stem, and along its sub-bar.
    const reached: Record<string, number> = {
      '100,60': 0,
      '100,100': 40,
      '40,100': 100,
      '40,115': 115,
      '40,130': 130,
      '20,130': 150,
      '60,130': 150,
      '180,100': 120,
    };
    const rhythmFaults = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('polyline'))
        .filter((stroke) => stroke.getAttribute('stroke-dasharray') === '8 8')
        .flatMap((stroke) => {
          const start = (stroke.getAttribute('points') ?? '')
            .trim()
            .split(/\s+/)[0]!;
          const expected = reached[start];
          const offset = Number(stroke.getAttribute('stroke-dashoffset') ?? 0);
          if (expected === undefined) {
            return [
              `a stroke starts at ${start}, not where the course reaches it first`,
            ];
          }
          const drift = (((offset - expected) % 16) + 16) % 16;
          return Math.min(drift, 16 - drift) < 1e-6
            ? []
            : [
                `the stroke from ${start} restarts the dashes (offset ${offset}, course ${expected})`,
              ];
        });
    // Partly lit: the donor's tie lights the stem below the donor's line,
    // the sub-bar to child 1 and child 1's line up.
    expect(
      rhythmFaults(
        draw(withLines([adoptiveRun], { auxiliaryLines: [donorToStem] }), [
          edgeKey('donor', 'child1'),
        ]),
      ),
    ).toEqual([]);
    // Unshaded, the line still reads as one course from the parents down.
    expect(
      rhythmFaults(
        render(
          <PedigreeEdgeSvg
            connectorData={withLines([adoptiveRun])}
            color="black"
            width={500}
            height={300}
          />,
        ).container,
      ),
    ).toEqual([]);
  });

  test('an adoptive line of descent stays dim when no tie through it is lit, however many of its people are highlighted', () => {
    // Grandparents raising their grandchildren are on the focal lineage
    // through the children's parent, not through the adoption.
    const container = draw(
      withLines([adoptiveRun]),
      [edgeKey('grandad', 'parent')],
      ['gran', 'grandad', 'parent', 'child1', 'child2', 'child3'],
    );
    expect(isLineDimmed(uprightStrokeAt(container, 100, 80)!)).toBe(true);
    expect(isLineDimmed(barStrokeAt(container, 140, 100)!)).toBe(true);
    expect(isLineDimmed(uprightStrokeAt(container, 180, 140)!)).toBe(true);
  });

  test('dashed co-parents’ drops each carry only their own parent’s tie', () => {
    const connector = makeParentChildConnector({
      edgeType: 'social',
      uplines: [ofChild(seg(50, 150, 50, 100), 'child1')],
      siblingBar: undefined,
      parentLink: [
        carrying(seg(0, 25, 0, 62), ['ann']),
        carrying(seg(100, 25, 100, 62), ['bob']),
        carrying(seg(0, 62, 50, 62), ['ann']),
        carrying(seg(50, 62, 100, 62), ['bob']),
        carrying(seg(50, 62, 50, 100), ['ann', 'bob']),
      ],
      parentIds: ['ann', 'bob'],
    });
    const container = draw(
      withLines([connector]),
      [edgeKey('ann', 'child1')],
      ['ann', 'bob', 'child1'],
    );
    expect(isLineDimmed(uprightStrokeAt(container, 0, 40)!)).toBe(false);
    expect(isLineDimmed(barStrokeAt(container, 25, 62)!)).toBe(false);
    expect(isLineDimmed(uprightStrokeAt(container, 50, 80)!)).toBe(false);
    expect(isLineDimmed(uprightStrokeAt(container, 100, 40)!)).toBe(true);
    expect(isLineDimmed(barStrokeAt(container, 75, 62)!)).toBe(true);
  });

  // Two social co-parents' lines that join at (100, 50) and run on as one
  // line down to the child.
  const joinedSocial: AuxiliaryConnector[] = [
    {
      type: 'auxiliary',
      edgeType: 'social',
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 50 },
        { x: 100, y: 50 },
        { x: 100, y: 100 },
      ],
      endpointIds: ['lead', 'child'],
      joinsAt: 2,
    },
    {
      type: 'auxiliary',
      edgeType: 'social',
      points: [
        { x: 200, y: 0 },
        { x: 200, y: 50 },
        { x: 100, y: 50 },
        { x: 100, y: 100 },
      ],
      endpointIds: ['mate', 'child'],
      joinsAt: 2,
    },
  ];

  test('a dashed joined tail and each lead-in are lit by their own lit ties, not by their people being highlighted', () => {
    const container = draw(
      withLines([], { auxiliaryLines: joinedSocial }),
      [edgeKey('mate', 'child')],
      ['lead', 'mate', 'child'],
    );
    expect(isLineDimmed(uprightStrokeAt(container, 100, 75)!)).toBe(false);
    expect(isLineDimmed(uprightStrokeAt(container, 200, 25)!)).toBe(false);
    expect(isLineDimmed(uprightStrokeAt(container, 0, 25)!)).toBe(true);

    const none = draw(
      withLines([], { auxiliaryLines: joinedSocial }),
      [],
      ['lead', 'mate', 'child'],
    );
    expect(isLineDimmed(uprightStrokeAt(none, 100, 75)!)).toBe(true);
    expect(isLineDimmed(uprightStrokeAt(none, 200, 25)!)).toBe(true);
  });

  test('a donor’s line ending on a line of descent is lit only when a lit tie enters there', () => {
    const solidRun = makeParentChildConnector({
      ...adoptiveRun,
      edgeType: 'biological',
      parentIds: ['parent1'],
    });
    // The donor is on the focal lineage through someone else entirely.
    const elsewhere = draw(
      withLines([solidRun], { auxiliaryLines: [donorToStem] }),
      [edgeKey('parent1', 'child3'), edgeKey('donor', 'someoneElse')],
    );
    expect(isLineDimmed(uprightStrokeAt(elsewhere, 10, 50)!)).toBe(true);

    const here = draw(
      withLines([solidRun], { auxiliaryLines: [donorToStem] }),
      [edgeKey('donor', 'child2')],
    );
    expect(isLineDimmed(uprightStrokeAt(here, 10, 50)!)).toBe(false);
  });

  // Dad (x=200) has a child with Ann (x=0) and a child with Bea (x=400);
  // each couple's line of descent drops from the middle of their
  // partnership line.
  const twoPartnerships = (isActive = true) =>
    withLines(
      [
        makeParentChildConnector({
          uplines: [ofChild(seg(100, 150, 100, 100), 'childA')],
          siblingBar: undefined,
          parentLink: [seg(100, 50, 100, 100)],
          parentIds: ['ann', 'dad'],
        }),
        makeParentChildConnector({
          uplines: [ofChild(seg(300, 150, 300, 100), 'childB')],
          siblingBar: undefined,
          parentLink: [seg(300, 50, 300, 100)],
          parentIds: ['dad', 'bea'],
        }),
      ],
      {
        groupLines: [
          makeCoupleBar({
            segment: seg(0, 50, 200, 50),
            partnerIds: ['ann', 'dad'],
            descentXPositions: [100],
            isActive,
          }),
          makeCoupleBar({
            segment: seg(200, 50, 400, 50),
            partnerIds: ['dad', 'bea'],
            descentXPositions: [300],
          }),
        ],
      },
    );

  test('a partner’s half of a partnership line lights only for a lit tie to a child of that partnership', () => {
    const container = draw(
      twoPartnerships(),
      [edgeKey('dad', 'childA')],
      ['dad', 'childA'],
    );
    expect(isLineDimmed(barStrokeAt(container, 150, 50)!)).toBe(false);
    expect(isLineDimmed(barStrokeAt(container, 50, 50)!)).toBe(true);
    expect(isLineDimmed(barStrokeAt(container, 250, 50)!)).toBe(true);
    expect(isLineDimmed(barStrokeAt(container, 350, 50)!)).toBe(true);
    expect(isLineDimmed(uprightStrokeAt(container, 100, 75)!)).toBe(false);
    expect(isLineDimmed(uprightStrokeAt(container, 300, 75)!)).toBe(true);
  });

  test('a couple’s line carries both partners’ ties, from where it leaves their partnership line', () => {
    // An aunt and uncle with no children of their own raise their niece:
    // one line leaves the middle of their partnership line for her.
    const container = draw(
      withLines([], {
        groupLines: [
          makeCoupleBar({
            partnerIds: ['aunt', 'uncle'],
            descentXPositions: undefined,
          }),
        ],
        auxiliaryLines: [
          {
            type: 'auxiliary',
            edgeType: 'adoptive',
            points: [
              { x: 100, y: 50 },
              { x: 100, y: 120 },
              { x: 300, y: 120 },
              { x: 300, y: 200 },
            ],
            endpointIds: ['aunt', 'niece'],
            ownerIds: ['aunt', 'uncle'],
          },
        ],
      }),
      [edgeKey('uncle', 'niece')],
    );
    expect(isLineDimmed(uprightStrokeAt(container, 100, 80)!)).toBe(false);
    expect(isLineDimmed(barStrokeAt(container, 150, 50)!)).toBe(false);
    expect(isLineDimmed(barStrokeAt(container, 50, 50)!)).toBe(true);
  });

  test('a former partnership line is lit only along the lit tie’s course', () => {
    const container = draw(
      twoPartnerships(false),
      [edgeKey('ann', 'childA')],
      ['ann', 'dad', 'childA'],
    );
    expect(isLineDimmed(barStrokeAt(container, 10, 50)!)).toBe(false);
    expect(isLineDimmed(barStrokeAt(container, 190, 50)!)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// One highlight rule through one tracer: a piece is lit if and only if a lit
// tie passes through it, read from the line model (its owners and course),
// and every piece is drawn once.
// ---------------------------------------------------------------------------

/** The points of a drawn auxiliary stroke (moves and straight lines). */
function strokePoints(el: Element): { x: number; y: number }[] {
  const raw = el.getAttribute('d') ?? el.getAttribute('points') ?? '';
  const numbers = [...raw.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) =>
    Number(m[0]),
  );
  const points: { x: number; y: number }[] = [];
  for (let k = 0; k + 1 < numbers.length; k += 2) {
    points.push({ x: numbers[k]!, y: numbers[k + 1]! });
  }
  return points;
}

/** Whether a stroke's course runs along the piece from `a` to `b`. */
function strokeCovers(
  el: Element,
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  const points = strokePoints(el);
  const on = (p: { x: number; y: number }, s: { x: number; y: number }[]) => {
    const [u, v] = s as [{ x: number; y: number }, { x: number; y: number }];
    const cross = (v.x - u.x) * (p.y - u.y) - (v.y - u.y) * (p.x - u.x);
    const dot = (p.x - u.x) * (v.x - u.x) + (p.y - u.y) * (v.y - u.y);
    const len2 = (v.x - u.x) ** 2 + (v.y - u.y) ** 2;
    return Math.abs(cross) < 1e-6 * len2 && dot >= -1e-6 && dot <= len2 + 1e-6;
  };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return points
    .slice(1)
    .some((p, k) => on(mid, [points[k]!, p]) && on(a, [points[k]!, p]));
}

const auxStrokes = (container: HTMLElement) => [
  ...container.querySelectorAll('path, polyline'),
];

describe('PedigreeEdgeSvg — one tracer lights every piece by the ties through it', () => {
  test('a couple’s shared line that ends on a line of descent is lit by the second partner’s lit tie', () => {
    // A surrogate's line of descent to twins, who hang from one point; the
    // twins' parents' line leaves their partnership line and ends there.
    const data: ConnectorRenderData = {
      connectors: {
        groupLines: [
          {
            type: 'parent-group',
            segment: seg(0, 0, 200, 0),
            double: false,
            isActive: true,
            partnerIds: ['a', 'b'],
          },
        ],
        parentChildLines: [
          makeParentChildConnector({
            parentLink: [seg(300, 0, 300, 100)],
            uplines: [
              ofChild(seg(300, 100, 250, 150), 'p1'),
              ofChild(seg(300, 100, 350, 150), 'p2'),
            ],
            parentIds: ['lena'],
          }),
        ],
        auxiliaryLines: [
          {
            type: 'auxiliary',
            edgeType: 'biological',
            points: [
              { x: 100, y: 0 },
              { x: 300, y: 100 },
            ],
            endpointIds: ['a', undefined],
            ownerIds: ['a', 'b'],
          },
        ],
        twinIndicators: [],
        duplicateArcs: [],
      },
    };
    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={data}
        color="#000"
        width={400}
        height={300}
        highlightedEdgeKeys={new Set([edgeKey('b', 'p1')])}
      />,
    );
    const strokes = auxStrokes(container).filter((el) =>
      strokeCovers(el, { x: 100, y: 0 }, { x: 300, y: 100 }),
    );
    expect(strokes).toHaveLength(1);
    expect(strokes[0]!.closest('[data-edge-dimmed]')).toBeNull();
  });

  test('two lines of one owner that share a course draw the shared piece once, lit when either tie is', () => {
    const line = (
      child: string,
      end: { x: number; y: number },
    ): AuxiliaryConnector => ({
      type: 'auxiliary',
      edgeType: 'social',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }, end],
      endpointIds: ['s', child],
      ownerIds: ['s'],
    });
    const data: ConnectorRenderData = {
      connectors: {
        groupLines: [],
        parentChildLines: [],
        // The dim line second, so drawn after the lit one.
        auxiliaryLines: [
          line('c1', { x: 0, y: 200 }),
          line('c2', { x: 200, y: 200 }),
        ],
        twinIndicators: [],
        duplicateArcs: [],
      },
    };
    for (const lit of ['c1', 'c2']) {
      const { container, unmount } = render(
        <PedigreeEdgeSvg
          connectorData={data}
          color="#000"
          width={300}
          height={300}
          highlightedEdgeKeys={new Set([edgeKey('s', lit)])}
        />,
      );
      const shared = auxStrokes(container).filter((el) =>
        strokeCovers(el, { x: 0, y: 0 }, { x: 100, y: 100 }),
      );
      expect(shared, lit).toHaveLength(1);
      expect(shared[0]!.closest('[data-edge-dimmed]'), lit).toBeNull();
      unmount();
    }
  });
});

// Every line ends exactly on what it meets, and joints show no gap, overhang
// or notch at any angle (Josh, 12 Oct 2026): every connector is stroked with
// round caps, and every stroke of several pieces with round joins, so a
// line meeting another at any angle, on its centreline, is covered to the
// other's edge, and a dashed line's pattern is left as it is.
describe('PedigreeEdgeSvg — joints', () => {
  // A former partnership line is square-ended at its break, where it meets
  // nothing, so the gap the slashes stand in is exact; its ends at the
  // partners are under their symbols.
  const strokes = (container: HTMLElement, former: boolean) =>
    Array.from(container.querySelectorAll('line, polyline, path')).filter(
      (element) =>
        element.getAttribute('stroke') !== null &&
        !(
          former &&
          element.tagName === 'line' &&
          element.getAttribute('y1') === '50' &&
          element.getAttribute('y2') === '50'
        ),
    );

  for (const [name, bar] of [
    ['a partnership line', makeCoupleBar()],
    ['a former partnership line', makeCoupleBar({ isActive: false })],
    [
      'a consanguineous couple’s line',
      makeCoupleBar({ double: true, doubleSegment: seg(0, 60, 200, 60) }),
    ],
  ] as const) {
    test(`strokes ${name} and the line of descent from it with round caps and joins`, () => {
      const data = makeCoupleWithChild(bar);
      data.connectors.auxiliaryLines.push({
        type: 'auxiliary',
        edgeType: 'donor',
        points: [
          { x: 250, y: 0 },
          { x: 150, y: 100 },
          { x: 100, y: 100 },
        ],
        endpointIds: ['donor', undefined],
        ownerIds: ['donor'],
      });
      for (const highlightedNodeIds of [undefined, new Set(['child'])]) {
        const { container, unmount } = render(
          <PedigreeEdgeSvg
            connectorData={data}
            color="black"
            width={300}
            height={300}
            {...(highlightedNodeIds ? { highlightedNodeIds } : {})}
          />,
        );
        const drawn = strokes(container, !bar.isActive);
        expect(drawn.length).toBeGreaterThanOrEqual(3);
        for (const element of drawn) {
          expect(
            element.getAttribute('stroke-linecap'),
            element.outerHTML,
          ).toBe('round');
          if (element.tagName !== 'line') {
            expect(
              element.getAttribute('stroke-linejoin'),
              element.outerHTML,
            ).toBe('round');
          }
        }
        unmount();
      }
    });
  }
});

describe('The leads of a partnership line routed between rows', () => {
  // A father partnered with his adult daughter: she sits a row below him,
  // with her mother and brother on his row, so her lead to their line
  // detours round the lane above her: up from her, along, and up the clear
  // lane to the line above his row.
  const people = ['grandma', 'grandad', 'son', 'daughter', 'baby'];
  const links: PedigreeLink[] = [
    { source: 'grandma', target: 'grandad', kind: 'partner', isActive: true },
    {
      source: 'grandma',
      target: 'son',
      kind: 'biological',
      isGestationalCarrier: true,
    },
    { source: 'grandad', target: 'son', kind: 'biological' },
    {
      source: 'grandma',
      target: 'daughter',
      kind: 'biological',
      isGestationalCarrier: true,
    },
    { source: 'grandad', target: 'daughter', kind: 'biological' },
    { source: 'grandad', target: 'daughter', kind: 'partner', isActive: true },
    { source: 'grandad', target: 'baby', kind: 'biological' },
    {
      source: 'daughter',
      target: 'baby',
      kind: 'biological',
      isGestationalCarrier: true,
    },
  ];
  const SYMBOL = 96;

  test('name the partner each piece joins, and each partner’s pieces run unbroken from their symbol to the line', () => {
    const { connectorData, positions } = drawPedigree({
      nodeIds: people,
      links,
      dimensions: {
        nodeWidth: SYMBOL,
        nodeHeight: SYMBOL,
        rowGapRatio: 1.4,
        columnGapRatio: 1.4,
      },
      nodeNames: new Map(people.map((id) => [id, id])),
    });
    const routed = connectorData.connectors.groupLines.find(
      (line) => line.endpointSegments,
    )!;
    expect(routed.endpointSegments).toHaveLength(4);
    const { segment } = routed;
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
    const onLine = (p: { x: number; y: number }) =>
      near(p.y, segment.y1) &&
      p.x > Math.min(segment.x1, segment.x2) - 1e-6 &&
      p.x < Math.max(segment.x1, segment.x2) + 1e-6;
    const faults = (routed.partnerIds ?? []).flatMap((partnerId) => {
      const symbol = positions.get(partnerId)!;
      const inSymbol = (p: { x: number; y: number }) =>
        p.x > symbol.x &&
        p.x < symbol.x + SYMBOL &&
        p.y > symbol.y - 1e-6 &&
        p.y < symbol.y + SYMBOL;
      const pieces = routed.endpointSegments!.filter(
        (piece) => piece.partnerId === partnerId,
      );
      const ends = (piece: LineSegment) => [
        { x: piece.x1, y: piece.y1 },
        { x: piece.x2, y: piece.y2 },
      ];
      // From the symbol, piece by piece, to the line.
      let at = pieces.flatMap(ends).find(inSymbol);
      const left = [...pieces];
      while (at && left.length > 0) {
        const here = at;
        const k = left.findIndex((piece) =>
          ends(piece).some((p) => near(p.x, here.x) && near(p.y, here.y)),
        );
        if (k < 0) break;
        const [piece] = left.splice(k, 1);
        at = ends(piece!).find(
          (p) => !(near(p.x, here.x) && near(p.y, here.y)),
        );
      }
      return pieces.length > 0 && left.length === 0 && at && onLine(at)
        ? []
        : [`${partnerId}: ${pieces.length} pieces, ${left.length} not reached`];
    });
    expect(faults).toEqual([]);
    expect(
      routed.endpointSegments!.filter(
        (piece) => piece.partnerId === 'daughter',
      ),
    ).toHaveLength(3);
  });

  // A line of descent leaving such a line: Ann's lead drops straight to it;
  // Bob's, from a row below, comes up a lane, along, and up again.
  const connectorData: ConnectorRenderData = {
    connectors: {
      groupLines: [
        {
          type: 'parent-group',
          segment: seg(0, 0, 100, 0),
          endpointSegments: [
            { ...seg(0, 50, 0, 0), partnerId: 'ann' },
            { ...seg(100, 0, 100, 150), partnerId: 'bob' },
            { ...seg(100, 150, 160, 150), partnerId: 'bob' },
            { ...seg(160, 200, 160, 150), partnerId: 'bob' },
          ],
          double: false,
          isActive: true,
          partnerIds: ['ann', 'bob'],
          descentXPositions: [50],
        },
      ],
      parentChildLines: [
        makeParentChildConnector({
          uplines: [ofChild(seg(50, 130, 50, 100), 'kid')],
          parentLink: [seg(50, 0, 50, 100)],
          parentIds: ['ann', 'bob'],
        }),
      ],
      auxiliaryLines: [],
      twinIndicators: [],
      duplicateArcs: [],
    },
  };
  const leadsLit = (parentId: string) => {
    const { container } = render(
      <PedigreeEdgeSvg
        connectorData={connectorData}
        color="black"
        width={300}
        height={300}
        highlightedNodeIds={new Set([parentId, 'kid'])}
        highlightedEdgeKeys={new Set([edgeKey(parentId, 'kid')])}
      />,
    );
    return connectorData.connectors.groupLines[0]!.endpointSegments!.map(
      (lead) => {
        const strokes = Array.from(container.querySelectorAll('line')).filter(
          (line) =>
            Number(line.getAttribute('x1')) === lead.x1 &&
            Number(line.getAttribute('y1')) === lead.y1 &&
            Number(line.getAttribute('x2')) === lead.x2 &&
            Number(line.getAttribute('y2')) === lead.y2,
        );
        return `${lead.partnerId} ${strokes.length > 0 && strokes.every((line) => !isLineDimmed(line)) ? 'lit' : 'dim'}`;
      },
    );
  };

  test('light every piece of the lead of the partner whose tie is lit, and none of the other’s', () => {
    expect(leadsLit('bob')).toEqual([
      'ann dim',
      'bob lit',
      'bob lit',
      'bob lit',
    ]);
    expect(leadsLit('ann')).toEqual([
      'ann lit',
      'bob dim',
      'bob dim',
      'bob dim',
    ]);
  });
});
