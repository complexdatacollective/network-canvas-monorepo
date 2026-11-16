// mapbox-gl's self-contained declarations (3.26+) type features against the
// global `GeoJSON` namespace without importing it, so the program has to load
// @types/geojson itself; without it `GeoJSONFeature` has no members. It lives
// here rather than in `useMapbox.ts`, whose `'use client'` directive must stay
// the first line and which imports this module.
/// <reference types="geojson" />
import type { Map, MapOptions } from 'mapbox-gl/esm';

/** Only the native controls mounted by this interface; its zoom/search UI is React. */
export function getMapboxLocale(): NonNullable<MapOptions['locale']> {
  return {
    'Map.Title': 'Map',
    'LogoControl.Title': 'Mapbox homepage',
    'AttributionControl.ToggleAttribution': 'Toggle attribution',
  };
}

/**
 * Marks the native controls' English names as English, and removes the hover
 * tooltip Mapbox copies the attribution control's name into: that name is for
 * screen readers only, so no one should see it. Run once the map is
 * constructed, which is when Mapbox creates these controls.
 */
export function markMapboxControlNames(
  map: Pick<Map, 'getCanvas' | 'getContainer'>,
) {
  const container = map.getContainer();
  map.getCanvas().setAttribute('lang', 'en');
  container.querySelector('.mapboxgl-ctrl-logo')?.setAttribute('lang', 'en');
  const attributionButton = container.querySelector(
    '.mapboxgl-ctrl-attrib-button',
  );
  attributionButton?.setAttribute('lang', 'en');
  attributionButton?.removeAttribute('title');
  attributionButton
    ?.querySelector('.mapboxgl-ctrl-icon')
    ?.removeAttribute('title');
}
