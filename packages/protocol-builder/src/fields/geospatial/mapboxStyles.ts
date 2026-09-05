/**
 * The basemaps a geospatial stage may be drawn on.
 *
 * The values are the protocol schema's own enum, spelled out here because a
 * researcher chooses between them by name and the schema carries no labels.
 * Adding one here without adding it to `mapOptions.style` in
 * `@codaco/protocol-validation` produces a stage that cannot be saved, so the
 * two lists are checked against each other by this package's own tests.
 */
export type MapStyleOption = Readonly<{ label: string; value: string }>;

export const MAP_STYLE_OPTIONS: readonly MapStyleOption[] = Object.freeze([
  Object.freeze({
    label: 'Standard',
    value: 'mapbox://styles/mapbox/standard',
  }),
  Object.freeze({
    label: 'Standard satellite',
    value: 'mapbox://styles/mapbox/standard-satellite',
  }),
  Object.freeze({
    label: 'Streets',
    value: 'mapbox://styles/mapbox/streets-v12',
  }),
  Object.freeze({
    label: 'Outdoors',
    value: 'mapbox://styles/mapbox/outdoors-v12',
  }),
  Object.freeze({ label: 'Light', value: 'mapbox://styles/mapbox/light-v11' }),
  Object.freeze({ label: 'Dark', value: 'mapbox://styles/mapbox/dark-v11' }),
  Object.freeze({
    label: 'Satellite',
    value: 'mapbox://styles/mapbox/satellite-v9',
  }),
  Object.freeze({
    label: 'Satellite streets',
    value: 'mapbox://styles/mapbox/satellite-streets-v12',
  }),
  Object.freeze({
    label: 'Navigation day',
    value: 'mapbox://styles/mapbox/navigation-day-v1',
  }),
  Object.freeze({
    label: 'Navigation night',
    value: 'mapbox://styles/mapbox/navigation-night-v1',
  }),
]);
