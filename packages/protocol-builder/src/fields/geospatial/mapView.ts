import { createMessageError } from '@codaco/app-i18n/messages';

import { geospatialMessages } from './geospatialMessages.ts';

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
 * The same meridian, named inside the world the stage can hold.
 *
 * A map drawing copies of the world — Mapbox's default, and the preview's —
 * counts longitude as the researcher keeps panning: `Transform._constrain`
 * neither wraps nor clamps `lng` while `renderWorldCopies` is on and no
 * `maxBounds` is set, so a pan east across the antimeridian leaves
 * `getCenter()` answering 286.0251 for the place -73.9749 names. Written
 * through as it came, that view is one `centerIssue` and the protocol schema
 * both refuse, so the dialog would hand the researcher a starting view their
 * stage cannot save.
 *
 * `LngLat#wrap`'s own arithmetic, spelled here rather than called through the
 * map: a value this package writes is checked by this package's own tests, and
 * asking the SDK object to wrap it would leave the assertion resting on
 * whatever the test's stand-in map happened to implement.
 *
 * A longitude that is already a place is handed back UNTOUCHED, which the
 * arithmetic alone does not do: `((-0.12 + 180) % 360 + 360) % 360 - 180` is
 * -0.12000000000000455, so wrapping unconditionally would write a fraction of
 * a millimetre of drift into every ordinary view a researcher accepts. Only a
 * longitude that has left the world is recomputed — including the one case
 * where the wrap lands exactly on the antimeridian, which is one meridian with
 * two names and is answered, as the SDK answers it, as 180.
 */
export function wrapLongitude(longitude: number): number {
  if (Math.abs(longitude) <= LONGITUDE_RANGE) return longitude;
  const span = LONGITUDE_RANGE * 2;
  const wrapped =
    ((((longitude + LONGITUDE_RANGE) % span) + span) % span) - LONGITUDE_RANGE;
  return wrapped === -LONGITUDE_RANGE ? LONGITUDE_RANGE : wrapped;
}

/**
 * What is wrong with a stored starting zoom, in the researcher's words.
 *
 * The schema enforces the same range, but it does so against a path after the
 * save has been attempted: `initialZoom` reported as "Zoom must be less than
 * or equal to 22" beside the document is not a sentence under the control the
 * researcher typed into. Absence is left to the field's own `required`, for
 * the reason `centerIssue` gives.
 */
export function zoomIssue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && value >= MIN_ZOOM && value <= MAX_ZOOM) {
    return undefined;
  }
  return createMessageError(geospatialMessages.zoomOutOfRange, {
    min: MIN_ZOOM,
    max: MAX_ZOOM,
  });
}

/**
 * What is wrong with a stored map centre, in the researcher's words.
 *
 * Absence is deliberately not reported here: a field says whether it is
 * required, and saying it twice would show two messages for one empty control.
 *
 * Encoded rather than formatted: this is a `messageRuleValidation` rule, which
 * hands the form a plain string, and `FieldErrors` decodes it where the
 * researcher reads it. A formatter cannot reach here — the rule is built once,
 * outside any component — so a sentence written in place would be the one
 * refusal on the stage that stayed English.
 */
export function centerIssue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isMapCenter(value)) {
    return createMessageError(geospatialMessages.centerIncomplete);
  }
  if (Math.abs(value[0]) > LONGITUDE_RANGE) {
    return createMessageError(geospatialMessages.longitudeOutOfRange, {
      min: -LONGITUDE_RANGE,
      max: LONGITUDE_RANGE,
    });
  }
  if (Math.abs(value[1]) > LATITUDE_RANGE) {
    return createMessageError(geospatialMessages.latitudeOutOfRange, {
      min: -LATITUDE_RANGE,
      max: LATITUDE_RANGE,
    });
  }
  return undefined;
}
