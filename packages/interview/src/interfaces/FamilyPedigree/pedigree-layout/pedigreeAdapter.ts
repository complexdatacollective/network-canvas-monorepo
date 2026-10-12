import type { PedigreeTwinKind } from '@codaco/protocol-validation';

import { alignPedigree } from './alignPedigree';
import { routePedigree } from './connectors';
import {
  computeLayoutMetrics,
  type LayoutDimensions,
} from './layoutDimensions';
import { drawnKind } from './lineOwners';
import type {
  LineSegment,
  ParentChildConnector,
  ParentConnection,
  PartnerConnection,
  PedigreeConnectors,
  PedigreeInput,
  PedigreeLayout,
  PedigreeLink,
  PedigreeSymbolShape,
  Relation,
  ScalingParams,
} from './types';

export type ConnectorRenderData = {
  connectors: PedigreeConnectors;
};

type ConversionResult = {
  input: PedigreeInput;
  indexToId: string[];
  idToIndex: Map<string, number>;
};

/** The layout's twin code for each twin kind: 1 identical (monozygotic),
 * 2 fraternal (dizygotic), 3 zygosity unknown. */
const TWIN_CODES: Record<PedigreeTwinKind, 1 | 2 | 3> = {
  identicalTwin: 1,
  fraternalTwin: 2,
  unknownZygosityTwin: 3,
};

const isTwinKind = (kind: PedigreeLink['kind']): kind is PedigreeTwinKind =>
  kind in TWIN_CODES;

function readLink(link: PedigreeLink) {
  return {
    relationshipType: link.kind,
    isActive: link.isActive !== false,
    isGestationalCarrier: link.isGestationalCarrier === true,
  };
}

export function toPedigreeInput(
  nodeIds: readonly string[],
  links: readonly PedigreeLink[],
): ConversionResult {
  const indexToId: string[] = [...nodeIds];
  const idToIndex = new Map<string, number>();
  indexToId.forEach((nodeId, index) => idToIndex.set(nodeId, index));

  const n = indexToId.length;
  const id: string[] = indexToId.slice();
  const parents: ParentConnection[][] = Array.from({ length: n }, () => []);
  const relations: Relation[] = [];
  const partnerConnections: PartnerConnection[] = [];

  const twinPairs = new Set<string>();
  for (const link of links) {
    const { kind } = link;
    if (isTwinKind(kind)) {
      const i1 = idToIndex.get(link.source);
      const i2 = idToIndex.get(link.target);
      if (i1 === undefined || i2 === undefined) continue;
      const pairKey = `${Math.min(i1, i2)},${Math.max(i1, i2)}`;
      if (twinPairs.has(pairKey)) continue;
      twinPairs.add(pairKey);
      relations.push({ id1: i1, id2: i2, code: TWIN_CODES[kind] });
      continue;
    }
    const { isActive, isGestationalCarrier } = readLink(link);
    const relationshipType = kind;

    if (relationshipType === 'partner') {
      const i1 = idToIndex.get(link.source);
      const i2 = idToIndex.get(link.target);
      if (i1 === undefined || i2 === undefined) continue;
      relations.push({ id1: i1, id2: i2, code: 4 });
      partnerConnections.push({
        partnerIndex1: i1,
        partnerIndex2: i2,
        isActive,
      });
    } else {
      const childIdx = idToIndex.get(link.target);
      const parentIdx = idToIndex.get(link.source);
      if (childIdx === undefined || parentIdx === undefined) continue;

      // Each tie as it is drawn (carrying the pregnancy is a birth tie), and
      // as recorded, where the two differ.
      const edgeType = drawnKind(relationshipType, isGestationalCarrier);
      parents[childIdx]!.push({
        parentIndex: parentIdx,
        edgeType,
        ...(edgeType === relationshipType
          ? {}
          : { recordedKind: relationshipType }),
        isGestationalCarrier,
      });
    }
  }

  return {
    input: {
      id,
      parents,
      partners: partnerConnections.length > 0 ? partnerConnections : undefined,
      relation: relations.length > 0 ? relations : undefined,
    },
    indexToId,
    idToIndex,
  };
}

export function pedigreeLayoutToPositions(
  layout: PedigreeLayout,
  indexToId: string[],
  dimensions: LayoutDimensions,
): Map<string, { x: number; y: number }> {
  const metrics = computeLayoutMetrics(dimensions);
  const positions = new Map<string, { x: number; y: number }>();

  for (let gen = 0; gen < layout.nid.length; gen++) {
    const genN = layout.n[gen] ?? 0;
    for (let col = 0; col < genN; col++) {
      const personIdx = layout.nid[gen]![col]!;
      if (personIdx < 0) continue;
      const nodeId = indexToId[personIdx];
      if (nodeId === undefined) continue;
      // Only record first appearance (skip duplicates)
      if (positions.has(nodeId)) continue;

      const x = layout.pos[gen]![col]! * metrics.siblingSpacing;
      const y = gen * metrics.rowHeight;
      positions.set(nodeId, { x, y });
    }
  }

  // Normalize so min x = 0 and min y = 0
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  for (const pos of positions.values()) {
    if (pos.x < minX) minX = pos.x;
    if (pos.y < minY) minY = pos.y;
  }
  if (Number.isFinite(minX) && minX !== 0) {
    for (const pos of positions.values()) {
      pos.x -= minX;
    }
  }
  if (Number.isFinite(minY) && minY !== 0) {
    for (const pos of positions.values()) {
      pos.y -= minY;
    }
  }

  return positions;
}

/**
 * A layout's connectors, routed, in layout units (columns and rows), and
 * what their routed lines cost the drawing (see `routePedigree`).
 */
function routeLayout(
  layout: PedigreeLayout,
  links: readonly PedigreeLink[],
  dimensions: LayoutDimensions,
  parents: ParentConnection[][],
  idToIndex?: Map<string, number>,
  nodeNames?: string[],
  indexToId?: string[],
  nodeShapes?: ReadonlyMap<string, PedigreeSymbolShape>,
  search: 'quick' | 'thorough' = 'thorough',
) {
  const metrics = computeLayoutMetrics(dimensions);
  const boxHeight = dimensions.nodeHeight / metrics.rowHeight;
  const scaling: ScalingParams = {
    boxWidth: dimensions.nodeWidth / metrics.siblingSpacing,
    boxHeight,
    legHeight: (1 - boxHeight) / 2,
    hScale: 1,
    vScale: 1,
  };

  // Build sets of all and active partner pairs (numeric index keys). The full
  // set is authoritative for connector endpoints; the active subset controls
  // whether the relationship break mark is rendered.
  let partnerPairs: Set<string> | undefined;
  let activePartnerPairs: Set<string> | undefined;
  if (idToIndex) {
    partnerPairs = new Set<string>();
    activePartnerPairs = new Set<string>();
    for (const link of links) {
      const { relationshipType, isActive } = readLink(link);
      if (relationshipType !== 'partner') continue;
      const i1 = idToIndex.get(link.source);
      const i2 = idToIndex.get(link.target);
      if (i1 === undefined || i2 === undefined) continue;
      const pairKey = `${Math.min(i1, i2)},${Math.max(i1, i2)}`;
      partnerPairs.add(pairKey);
      if (isActive) activePartnerPairs.add(pairKey);
    }
  }

  return routePedigree(
    layout,
    scaling,
    parents,
    activePartnerPairs,
    undefined,
    undefined,
    nodeNames,
    indexToId,
    partnerPairs,
    nodeShapes && indexToId
      ? indexToId.map((nodeId) => nodeShapes.get(nodeId))
      : undefined,
    search,
  );
}

export function buildConnectorData(
  layout: PedigreeLayout,
  links: readonly PedigreeLink[],
  dimensions: LayoutDimensions,
  parents: ParentConnection[][] = [],
  idToIndex?: Map<string, number>,
  nodeNames?: string[],
  indexToId?: string[],
  /** Each person's symbol shape, by node id. */
  nodeShapes?: ReadonlyMap<string, PedigreeSymbolShape>,
  /** The layout's connectors, already routed (see `routeLayout`). */
  routed?: PedigreeConnectors,
): ConnectorRenderData {
  const metrics = computeLayoutMetrics(dimensions);
  const connectors =
    routed ??
    routeLayout(
      layout,
      links,
      dimensions,
      parents,
      idToIndex,
      nodeNames,
      indexToId,
      nodeShapes,
    ).connectors;

  // Transform all coordinates to pixel space
  const sx = metrics.siblingSpacing;
  const sy = metrics.rowHeight;
  const xOffset = metrics.containerWidth / 2;

  for (const sp of connectors.groupLines) {
    transformSegment(sp.segment, sx, sy, xOffset);
    for (const endpoint of sp.endpointSegments ?? []) {
      transformSegment(endpoint, sx, sy, xOffset);
    }
    if (sp.doubleSegment) {
      transformSegment(sp.doubleSegment, sx, sy, xOffset);
    }
    for (const positions of [sp.descentXPositions, sp.auxiliaryXPositions]) {
      for (let k = 0; k < (positions?.length ?? 0); k++) {
        positions![k] = positions![k]! * sx + xOffset;
      }
    }
    sp.nodeHalfWidth = metrics.containerWidth / 2;
  }

  for (const pc of connectors.parentChildLines) {
    for (const ul of pc.uplines) {
      transformSegment(ul, sx, sy, xOffset);
    }
    if (pc.siblingBar) transformSegment(pc.siblingBar, sx, sy, xOffset);
    for (const pl of pc.parentLink) {
      transformSegment(pl, sx, sy, xOffset);
    }
    for (const segment of runSegments(pc)) {
      transformSegment(segment, sx, sy, xOffset);
    }
  }

  for (const ti of connectors.twinIndicators) {
    if (ti.segment) {
      transformSegment(ti.segment, sx, sy, xOffset);
    }
    if (ti.label) {
      ti.label.x = ti.label.x * sx + xOffset;
      ti.label.y = ti.label.y * sy;
    }
    if (ti.labelSize !== undefined) ti.labelSize *= sy;
  }

  for (const aux of connectors.auxiliaryLines) {
    for (const pt of [...aux.points, ...(aux.hops ?? [])]) {
      pt.x = pt.x * sx + xOffset;
      pt.y = pt.y * sy;
    }
  }

  for (const da of connectors.duplicateArcs) {
    for (const pt of da.path.points) {
      pt.x = pt.x * sx + xOffset;
      pt.y = pt.y * sy;
    }
  }

  let rawMinX = Number.POSITIVE_INFINITY;
  for (let gen = 0; gen < layout.nid.length; gen++) {
    const genN = layout.n[gen] ?? 0;
    for (let col = 0; col < genN; col++) {
      const personIdx = layout.nid[gen]![col]!;
      if (personIdx < 0) continue;
      const rawX = layout.pos[gen]![col]! * sx;
      if (rawX < rawMinX) rawMinX = rawX;
    }
  }

  if (Number.isFinite(rawMinX) && rawMinX !== 0) {
    for (const sp of connectors.groupLines) {
      shiftSegment(sp.segment, -rawMinX, 0);
      for (const endpoint of sp.endpointSegments ?? []) {
        shiftSegment(endpoint, -rawMinX, 0);
      }
      if (sp.doubleSegment) shiftSegment(sp.doubleSegment, -rawMinX, 0);
      // The break keeps clear of these, so they move with the line.
      for (const positions of [sp.descentXPositions, sp.auxiliaryXPositions]) {
        for (let k = 0; k < (positions?.length ?? 0); k++) {
          positions![k] = positions![k]! - rawMinX;
        }
      }
    }
    for (const pc of connectors.parentChildLines) {
      for (const ul of pc.uplines) shiftSegment(ul, -rawMinX, 0);
      if (pc.siblingBar) shiftSegment(pc.siblingBar, -rawMinX, 0);
      for (const pl of pc.parentLink) shiftSegment(pl, -rawMinX, 0);
      for (const segment of runSegments(pc)) shiftSegment(segment, -rawMinX, 0);
    }
    for (const ti of connectors.twinIndicators) {
      if (ti.segment) shiftSegment(ti.segment, -rawMinX, 0);
      if (ti.label) ti.label.x += -rawMinX;
    }
    for (const aux of connectors.auxiliaryLines) {
      for (const pt of [...aux.points, ...(aux.hops ?? [])]) pt.x += -rawMinX;
    }
    for (const da of connectors.duplicateArcs) {
      for (const pt of da.path.points) pt.x += -rawMinX;
    }
  }

  // Find first generation with data to compute rawMinY
  let rawMinY = 0;
  for (let gen = 0; gen < layout.nid.length; gen++) {
    const genN = layout.n[gen] ?? 0;
    if (genN > 0) {
      rawMinY = gen * sy;
      break;
    }
  }

  if (rawMinY !== 0) {
    for (const sp of connectors.groupLines) {
      shiftSegment(sp.segment, 0, -rawMinY);
      for (const endpoint of sp.endpointSegments ?? []) {
        shiftSegment(endpoint, 0, -rawMinY);
      }
      if (sp.doubleSegment) shiftSegment(sp.doubleSegment, 0, -rawMinY);
    }
    for (const pc of connectors.parentChildLines) {
      for (const ul of pc.uplines) shiftSegment(ul, 0, -rawMinY);
      if (pc.siblingBar) shiftSegment(pc.siblingBar, 0, -rawMinY);
      for (const pl of pc.parentLink) shiftSegment(pl, 0, -rawMinY);
      for (const segment of runSegments(pc)) shiftSegment(segment, 0, -rawMinY);
    }
    for (const ti of connectors.twinIndicators) {
      if (ti.segment) shiftSegment(ti.segment, 0, -rawMinY);
      if (ti.label) ti.label.y += -rawMinY;
    }
    for (const aux of connectors.auxiliaryLines) {
      for (const pt of [...aux.points, ...(aux.hops ?? [])]) pt.y += -rawMinY;
    }
    for (const da of connectors.duplicateArcs) {
      for (const pt of da.path.points) pt.y += -rawMinY;
    }
  }

  return { connectors };
}

/** The stems and sub-bars of a sibship's runs. */
const runSegments = (pc: ParentChildConnector): LineSegment[] =>
  (pc.runs ?? []).flatMap((run) => [run.stem, ...(run.bar ? [run.bar] : [])]);

function transformSegment(
  seg: { x1: number; y1: number; x2: number; y2: number },
  sx: number,
  sy: number,
  xOffset: number,
) {
  seg.x1 = seg.x1 * sx + xOffset;
  seg.y1 = seg.y1 * sy;
  seg.x2 = seg.x2 * sx + xOffset;
  seg.y2 = seg.y2 * sy;
}

function shiftSegment(
  seg: { x1: number; y1: number; x2: number; y2: number },
  dx: number,
  dy: number,
) {
  seg.x1 += dx;
  seg.x2 += dx;
  seg.y1 += dy;
  seg.y2 += dy;
}

/**
 * A family laid out and its connectors routed, exactly as `PedigreeLayout`
 * draws it: each person's top-left corner, by node id, and the connectors.
 */
export function drawPedigree({
  nodeIds,
  links,
  dimensions,
  nodeNames,
  nodeShapes,
}: {
  nodeIds: readonly string[];
  links: readonly PedigreeLink[];
  dimensions: LayoutDimensions;
  nodeNames?: ReadonlyMap<string, string>;
  nodeShapes?: ReadonlyMap<string, PedigreeSymbolShape>;
}): {
  positions: Map<string, { x: number; y: number }>;
  connectorData: ConnectorRenderData;
} {
  const { input, indexToId, idToIndex } = toPedigreeInput(nodeIds, links);
  const names = nodeNames
    ? indexToId.map((id) => nodeNames.get(id) ?? '')
    : undefined;
  // Each seating weighed is drawn, and chosen by what its drawing costs.
  const routed = new Map<PedigreeLayout, PedigreeConnectors>();
  const layout = alignPedigree(input, {
    drawingCost: (candidate, search) => {
      const { connectors, cost } = routeLayout(
        candidate,
        links,
        dimensions,
        input.parents,
        idToIndex,
        names,
        indexToId,
        nodeShapes,
        search,
      );
      routed.set(candidate, connectors);
      return cost;
    },
  });
  const positions = pedigreeLayoutToPositions(layout, indexToId, dimensions);
  const connectorData = buildConnectorData(
    layout,
    links,
    dimensions,
    input.parents,
    idToIndex,
    names,
    indexToId,
    nodeShapes,
    routed.get(layout),
  );
  return { positions, connectorData };
}
