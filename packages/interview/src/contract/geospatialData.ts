import type { Stage } from '@codaco/protocol-validation';

import type { ResolveRosterAsset } from './rosterData';

/**
 * Host-agnostic Geospatial collection for synthetic generation: the values a
 * participant's map tap can store, per stage, keyed by stage id.
 *
 * The sibling of `collectRosterExternalData`, and deliberately built the same
 * way — same host hook, same three-way key contract, same React-free module —
 * because both answer the same question for the same caller: what did the
 * researcher's asset actually contain? A Geospatial stage stores the value its
 * map's `targetFeatureProperty` carries on the feature that was tapped
 * (`interfaces/Geospatial/useMapbox.ts`), so the set of those values IS the set
 * of answers the stage can produce.
 *
 * `ResolveRosterAsset` is reused rather than copied: a host has one way of
 * turning a protocol asset id into something fetchable, and two names for it
 * would be two things to keep in step. Only `url` is read here — a GeoJSON
 * asset is always JSON, so the filename never decides how it is parsed.
 *
 * Node-safe: `fetch` and `JSON` only, no DOM and no React, so a server host
 * (Fresco's generate-test-interviews route) can call it exactly as a browser
 * host does.
 */

type GeospatialSource = {
  stageId: string;
  assetId: string;
  property: string;
};

/**
 * The map configuration a Geospatial stage carries, or `null` for a stage this
 * cannot read.
 *
 * Every field is re-checked at runtime and the stage skipped on a mismatch
 * rather than throwing — the same widening-without-assertion posture as the
 * roster sibling, and for the same reason: hosts pass draft protocols
 * (Architect previews the one being edited), where a schema-required field can
 * still be missing.
 */
function getGeospatialSource(stage: Stage): GeospatialSource | null {
  if (stage.type !== 'Geospatial') return null;

  const mapOptions:
    | { dataSourceAssetId?: string; targetFeatureProperty?: string }
    | undefined = stage.mapOptions;
  const assetId = mapOptions?.dataSourceAssetId;
  const property = mapOptions?.targetFeatureProperty;

  if (typeof assetId !== 'string' || typeof property !== 'string') return null;
  if (assetId.length === 0 || property.length === 0) return null;

  return { stageId: stage.id, assetId, property };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Every distinct value the named property takes across a GeoJSON document's
 * features, in the order the document lists them.
 *
 * Strings AND finite numbers are collected, because both are answers the live
 * interface records: `useMapbox`'s click handler forwards the tapped feature's
 * property value unchanged (its `as string` is a compile-time assertion only),
 * so a map keyed by numeric identifiers stores those numbers verbatim. What
 * is still excluded is anything a tap cannot store as an answer — objects,
 * arrays, booleans, NaN — since inventing a value for those would put
 * something in the session no tap produced.
 *
 * Order is the document's and duplicates are dropped, so the same asset always
 * yields the same pool and a seeded draw over it is reproducible.
 */
function featurePropertyValues(
  document: unknown,
  property: string,
): (string | number)[] {
  if (!isRecord(document)) {
    throw new TypeError('GeoJSON data must be an object.');
  }

  const features = document.features;
  if (features === null || features === undefined) return [];
  if (!Array.isArray(features)) {
    throw new TypeError('GeoJSON features must be an array.');
  }

  const values = new Map<string, string | number>();
  for (const feature of features) {
    if (!isRecord(feature)) continue;
    const properties = feature.properties;
    if (!isRecord(properties)) continue;
    const value = properties[property];
    if (typeof value === 'string' && value.length > 0) {
      values.set(`s:${value}`, value);
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      values.set(`n:${String(value)}`, value);
    }
  }

  return [...values.values()];
}

async function readGeospatialSource(
  assetId: string,
  property: string,
  resolveAsset: ResolveRosterAsset,
): Promise<(string | number)[] | null> {
  const resolved = await resolveAsset(assetId);
  if (!resolved) {
    return null;
  }

  try {
    const response = await fetch(resolved.url);
    const document: unknown = await response.json();
    return featurePropertyValues(document, property);
  } finally {
    resolved.cleanup?.();
  }
}

/**
 * Per-stage Geospatial answer pools, built from each `Geospatial` stage's
 * `mapOptions.dataSourceAssetId`.
 *
 * A stage's key is emitted (with an array that may be empty) when its asset
 * resolved and parsed — an empty array means "the map has no selectable areas",
 * which is distinct from an absent key. A stage whose asset is missing or
 * unreadable is omitted, so generation can tell an empty map from one it never
 * saw.
 */
export async function collectGeospatialPropertyValues({
  stages,
  resolveAsset,
}: {
  stages: Stage[];
  resolveAsset: ResolveRosterAsset;
}): Promise<Record<string, (string | number)[]>> {
  const sources = stages
    .map(getGeospatialSource)
    .filter((source): source is GeospatialSource => source !== null);

  if (sources.length === 0) {
    return {};
  }

  // Cache parses per invocation so one map shared by several stages is fetched
  // once, keyed by the property each stage reads off it.
  const parseCache = new Map<string, Promise<(string | number)[] | null>>();
  const result: Record<string, (string | number)[]> = {};

  for (const { stageId, assetId, property } of sources) {
    const cacheKey = `${assetId}::${property}`;
    let parsed = parseCache.get(cacheKey);
    if (!parsed) {
      parsed = readGeospatialSource(assetId, property, resolveAsset).catch(
        (error: unknown): null => {
          // eslint-disable-next-line no-console
          console.error(`Could not read GeoJSON asset "${assetId}"`, error);
          return null;
        },
      );
      parseCache.set(cacheKey, parsed);
    }

    const values = await parsed;
    if (values !== null) result[stageId] = values;
  }

  return result;
}
