import type {
  BackgroundDocument,
  EllipseElement,
  Vec,
  ZoneElement,
} from '../model/types';

// The document's zones are its rect/ellipse/polygon elements carrying a
// zoneLabel, returned in paint (document) order so area ties resolve to the
// later element.
export function zonesOf(doc: BackgroundDocument): ZoneElement[] {
  const zones: ZoneElement[] = [];
  for (const element of doc.elements) {
    if (
      (element.kind === 'rect' ||
        element.kind === 'ellipse' ||
        element.kind === 'polygon') &&
      element.zoneLabel !== null
    ) {
      zones.push(element);
    }
  }
  return zones;
}

// Ray-casting parity test, kept byte-for-byte equivalent to
// packages/interview/src/interfaces/NetworkComposer/ComposerCanvas.tsx so the
// editor's hover readout and the generated Python/R scripts agree on polygon
// membership. Boundary points resolve by the parity rule with no epsilon.
function pointInPolygon(p: Vec, points: Vec[]): boolean {
  if (points.length < 3) return false;
  let inside = false;
  const { x, y } = p;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (!a || !b) continue;
    const intersect =
      a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInEllipse(p: Vec, zone: EllipseElement): boolean {
  // A warping ellipse in normalized space. A zero- or negative-radius ellipse
  // (schema-valid) contains nothing; guard before dividing so we never produce
  // NaN/Infinity here or a division error in the generated Python and R.
  if (zone.rx <= 0 || zone.ry <= 0) return false;
  const dx = (p.x - zone.cx) / zone.rx;
  const dy = (p.y - zone.cy) / zone.ry;
  return dx * dx + dy * dy <= 1;
}

export function pointInZone(p: Vec, zone: ZoneElement): boolean {
  if (zone.kind === 'rect') {
    return (
      p.x >= zone.x &&
      p.x <= zone.x + zone.width &&
      p.y >= zone.y &&
      p.y <= zone.y + zone.height
    );
  }
  if (zone.kind === 'ellipse') {
    return pointInEllipse(p, zone);
  }
  return pointInPolygon(p, zone.points);
}

export function zoneArea(zone: ZoneElement): number {
  if (zone.kind === 'rect') {
    return zone.width * zone.height;
  }
  if (zone.kind === 'ellipse') {
    return Math.PI * zone.rx * zone.ry;
  }
  const points = zone.points;
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (!a || !b) continue;
    sum += b.x * a.y - a.x * b.y;
  }
  return Math.abs(sum) / 2;
}

export function assignZone(p: Vec, zones: ZoneElement[]): string | null {
  let bestLabel: string | null = null;
  let bestArea = Infinity;
  for (const zone of zones) {
    if (zone.zoneLabel === null) continue;
    if (!pointInZone(p, zone)) continue;
    const area = zoneArea(zone);
    // Smallest containing zone wins; on an exact area tie the zone later in
    // document order wins, so iterating front-to-back with `<=` lets a later
    // equal-area zone overwrite an earlier one.
    if (area <= bestArea) {
      bestArea = area;
      bestLabel = zone.zoneLabel;
    }
  }
  return bestLabel;
}

export function validateZoneLabels(
  zones: ZoneElement[],
): { ok: true } | { ok: false; problems: string[] } {
  const problems: string[] = [];

  // null-labelled elements are not zones and never reach here (zonesOf filters
  // them); a non-null label that is empty/whitespace is the 'empty label' case.
  const emptyCount = zones.filter(
    (zone) => zone.zoneLabel !== null && zone.zoneLabel.trim() === '',
  ).length;
  if (emptyCount === 1) {
    problems.push(
      'One zone has an empty label. Every zone needs a label because the label becomes the value written to the assigned variable.',
    );
  } else if (emptyCount > 1) {
    problems.push(
      `${emptyCount} zones have empty labels. Every zone needs a label because the label becomes the value written to the assigned variable.`,
    );
  }

  // Case-sensitive comparison of trimmed labels; report each duplicated value
  // once, in first-seen order.
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const zone of zones) {
    const label = zone.zoneLabel;
    if (label === null) continue;
    const trimmed = label.trim();
    if (trimmed === '') continue;
    if (!counts.has(trimmed)) order.push(trimmed);
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }
  for (const label of order) {
    const count = counts.get(label) ?? 0;
    if (count > 1) {
      const subject = count === 2 ? 'Two zones share' : `${count} zones share`;
      problems.push(
        `${subject} the label "${label}". Zone labels become variable values and must be unique.`,
      );
    }
  }

  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}
