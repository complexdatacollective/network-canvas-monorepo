/**
 * Where a geospatial stage's map opens, as the protocol schema holds it: a
 * `[longitude, latitude]` pair and a zoom level.
 *
 * Kept apart from every component that shows it because the same two values
 * are read by a numeric control, written by a map the researcher panned, and
 * checked before a save — and each of those would otherwise carry its own idea
 * of what "not set yet" means.
 */
export type MapCenter = readonly [number, number];

/** Mapbox's own zoom range, which the schema also enforces. */
export const MIN_ZOOM = 0;
export const MAX_ZOOM = 22;

/** The middle of the world: what a stage with no chosen view opens on. */
const DEFAULT_CENTER: MapCenter = Object.freeze([0, 0]);

export function isMapCenter(value: unknown): value is MapCenter {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(
      (coordinate) =>
        typeof coordinate === 'number' && Number.isFinite(coordinate),
    )
  );
}

export function resolveCenter(value: unknown): MapCenter {
  return isMapCenter(value) ? [value[0], value[1]] : DEFAULT_CENTER;
}

export function resolveZoom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : MIN_ZOOM;
}

/**
 * Whether the map has been moved away from the view it opened on.
 *
 * A stage that never had a view counts as changed the moment the map is
 * readable, so the researcher can accept where it happens to be rather than
 * having to nudge it first.
 */
export function hasMapViewChanged(
  center: MapCenter,
  zoom: number,
  initialCenter: unknown,
  initialZoom: unknown,
): boolean {
  if (!isMapCenter(initialCenter)) return true;
  return (
    center[0] !== initialCenter[0] ||
    center[1] !== initialCenter[1] ||
    zoom !== resolveZoom(initialZoom)
  );
}

const LONGITUDE_RANGE = 180;
const LATITUDE_RANGE = 90;

/**
 * What is wrong with a stored map centre, in the researcher's words.
 *
 * Absence is deliberately not reported here: a field says whether it is
 * required, and saying it twice would show two messages for one empty control.
 */
export function centerIssue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isMapCenter(value)) {
    return 'Enter both a longitude and a latitude for the starting view.';
  }
  if (Math.abs(value[0]) > LONGITUDE_RANGE) {
    return `Longitude must be between -${LONGITUDE_RANGE} and ${LONGITUDE_RANGE}.`;
  }
  if (Math.abs(value[1]) > LATITUDE_RANGE) {
    return `Latitude must be between -${LATITUDE_RANGE} and ${LATITUDE_RANGE}.`;
  }
  return undefined;
}
