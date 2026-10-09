import type { PedigreeTwinKind } from '@codaco/protocol-validation';

import { computeConnectors } from './connectors';
import {
  computeLayoutMetrics,
  type LayoutDimensions,
} from './layoutDimensions';
import type {
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
import { relativeRaisers } from './utils';

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

      parents[childIdx]!.push({
        parentIndex: parentIdx,
        edgeType: relationshipType,
        isGestationalCarrier,
        // Kept as recorded: the drawn type may change below.
        isGenetic:
          relationshipType === 'biological' || relationshipType === 'donor',
      });
    }
  }

  // A birth parent of an adopted child who is outside the adoptive family is
  // drawn as a donor: their edge becomes auxiliary, so the child is placed
  // under the adoptive parents, as standard pedigree nomenclature has it. A
  // birth parent who is the partner of one of the child's adoptive parents (a
  // step-parent adoption) raises the child in that family, so their edge stays
  // biological and the child descends from them within the couple. A child
  // adopted by a relative (see `relativeRaisers`) stays in their birth
  // family, so their birth parents stay parents too; the layout draws the
  // relatives' adoptive lines beside the birth family.
  const partnersOf = new Map<number, Set<number>>();
  for (const { partnerIndex1: a, partnerIndex2: b } of partnerConnections) {
    partnersOf.set(a, new Set([...(partnersOf.get(a) ?? []), b]));
    partnersOf.set(b, new Set([...(partnersOf.get(b) ?? []), a]));
  }
  const raisedByRelatives = relativeRaisers(parents, partnerConnections);
  for (let i = 0; i < n; i++) {
    const adoptiveParents = parents[i]!.filter(
      (p) => p.edgeType === 'adoptive',
    ).map((p) => p.parentIndex);
    if (adoptiveParents.length === 0) continue;
    if (raisedByRelatives[i]!.size > 0) continue;
    for (const p of parents[i]!) {
      if (p.edgeType !== 'biological') continue;
      const raisesChild = adoptiveParents.some(
        (adoptive) => partnersOf.get(p.parentIndex)?.has(adoptive) ?? false,
      );
      if (!raisesChild) p.edgeType = 'donor';
    }
  }

  // A child with no primary (biological/social/adoptive) parent — e.g. a
  // donor-conceived child carried by a gestational carrier ("single parent, two
  // donors") — descends from the carrier. Promote the carrier's edge to
  // 'biological', the primary type for the parent who gave birth, so it
  // anchors the line of descent and is drawn solid, as the carrier's line of
  // descent is in standard pedigree nomenclature (never 'social', which is
  // drawn dashed). The gamete donors remain auxiliary. Without this the child
  // has only auxiliary parents, forms no family unit, and renders no line of
  // descent at all. The carrier's link stays non-genetic (`isGenetic`), so
  // the line drawn never makes the child a blood relative of the carrier's
  // own children.
  for (let i = 0; i < n; i++) {
    const hasPrimaryParent = parents[i]!.some(
      (p) =>
        p.edgeType === 'biological' ||
        p.edgeType === 'social' ||
        p.edgeType === 'adoptive',
    );
    if (hasPrimaryParent) continue;
    const carrier = parents[i]!.find((p) => p.isGestationalCarrier);
    if (carrier) carrier.edgeType = 'biological';
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
): ConnectorRenderData {
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

  const connectors = computeConnectors(
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
  );

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
    if (sp.descentXPositions) {
      for (let k = 0; k < sp.descentXPositions.length; k++) {
        sp.descentXPositions[k] = sp.descentXPositions[k]! * sx + xOffset;
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
    for (const pt of aux.points) {
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
    }
    for (const pc of connectors.parentChildLines) {
      for (const ul of pc.uplines) shiftSegment(ul, -rawMinX, 0);
      if (pc.siblingBar) shiftSegment(pc.siblingBar, -rawMinX, 0);
      for (const pl of pc.parentLink) shiftSegment(pl, -rawMinX, 0);
    }
    for (const ti of connectors.twinIndicators) {
      if (ti.segment) shiftSegment(ti.segment, -rawMinX, 0);
      if (ti.label) ti.label.x += -rawMinX;
    }
    for (const aux of connectors.auxiliaryLines) {
      for (const pt of aux.points) pt.x += -rawMinX;
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
    }
    for (const ti of connectors.twinIndicators) {
      if (ti.segment) shiftSegment(ti.segment, 0, -rawMinY);
      if (ti.label) ti.label.y += -rawMinY;
    }
    for (const aux of connectors.auxiliaryLines) {
      for (const pt of aux.points) pt.y += -rawMinY;
    }
    for (const da of connectors.duplicateArcs) {
      for (const pt of da.path.points) pt.y += -rawMinY;
    }
  }

  return { connectors };
}

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
