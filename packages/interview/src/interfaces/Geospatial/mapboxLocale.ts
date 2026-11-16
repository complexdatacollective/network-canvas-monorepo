// mapbox-gl's self-contained declarations (3.26+) type features against the
// global `GeoJSON` namespace without importing it, so the program has to load
// @types/geojson itself; without it `GeoJSONFeature` has no members. It lives
// here rather than in `useMapbox.ts`, whose `'use client'` directive must stay
// the first line and which imports this module.
/// <reference types="geojson" />
import type { MapOptions } from 'mapbox-gl/esm';

/** Only the native controls mounted by this interface; its zoom/search UI is React. */
export function getMapboxLocale(): NonNullable<MapOptions['locale']> {
  return {
    'Map.Title': 'Map',
    'LogoControl.Title': 'Mapbox homepage',
    'AttributionControl.ToggleAttribution': 'Toggle attribution',
  };
}
