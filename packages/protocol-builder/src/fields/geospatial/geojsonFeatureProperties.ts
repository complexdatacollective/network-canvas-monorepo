/**
 * The feature properties a GeoJSON layer carries.
 *
 * A geospatial stage records the participant's selection as the value of ONE
 * property of the selected feature, so the researcher has to be shown which
 * properties the layer actually has. The gateway reports content facts only
 * for network resources, so the layer is parsed here from the bytes the
 * gateway hands over.
 */

/** Reported when the bytes are not a GeoJSON document this can read. */
export type GeoJsonReadFailure = Readonly<{ unreadable: true }>;

export type GeoJsonFeatureProperties =
  | Readonly<{ unreadable: false; names: readonly string[] }>
  | GeoJsonReadFailure;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const propertyNamesOfFeature = (feature: unknown, into: Set<string>): void => {
  if (!isRecord(feature)) return;
  const properties = feature.properties;
  if (!isRecord(properties)) return;
  for (const name of Object.keys(properties)) into.add(name);
};

/**
 * Every property name any feature in the document carries, in the order they
 * are first met.
 *
 * A union rather than an intersection: a layer whose features are not uniform
 * is a layer the researcher needs to see the whole of, and a property missing
 * from some features is a problem they can only notice if it is offered.
 */
export function geoJsonFeatureProperties(
  bytes: Uint8Array,
): GeoJsonFeatureProperties {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return Object.freeze({ unreadable: true as const });
  }

  if (!isRecord(parsed)) return Object.freeze({ unreadable: true as const });

  const names = new Set<string>();
  if (parsed.type === 'FeatureCollection') {
    if (!Array.isArray(parsed.features)) {
      return Object.freeze({ unreadable: true as const });
    }
    for (const feature of parsed.features)
      propertyNamesOfFeature(feature, names);
    return Object.freeze({
      unreadable: false as const,
      names: Object.freeze([...names]),
    });
  }

  if (parsed.type === 'Feature') {
    propertyNamesOfFeature(parsed, names);
    return Object.freeze({
      unreadable: false as const,
      names: Object.freeze([...names]),
    });
  }

  return Object.freeze({ unreadable: true as const });
}
