import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';

import { geospatialMessages } from '../../sections/geospatial/geospatialMessages.ts';

/**
 * The basemaps a geospatial stage may be drawn on.
 *
 * The values are the protocol schema's own enum, paired here with a name a
 * researcher can choose between, because the schema carries no labels. Adding
 * one here without adding it to `mapOptions.style` in
 * `@codaco/protocol-validation` produces a stage that cannot be saved, so the
 * two lists are checked against each other by this package's own tests.
 *
 * A style URL is DATA and is never translated; only the name beside it is
 * copy. The names are therefore descriptors and the option list is built
 * rather than declared: this module produces copy without rendering any, so it
 * takes the reader's own formatter rather than reaching for one, which is what
 * keeps the basemap names from being the one control on the stage that stays
 * English.
 */
export type MapStyleOption = Readonly<{ label: string; value: string }>;

type MapStyle = Readonly<{ name: MessageDescriptor; value: string }>;

const MAP_STYLES: readonly MapStyle[] = Object.freeze([
  Object.freeze({
    name: geospatialMessages.styleStandard,
    value: 'mapbox://styles/mapbox/standard',
  }),
  Object.freeze({
    name: geospatialMessages.styleStandardSatellite,
    value: 'mapbox://styles/mapbox/standard-satellite',
  }),
  Object.freeze({
    name: geospatialMessages.styleStreets,
    value: 'mapbox://styles/mapbox/streets-v12',
  }),
  Object.freeze({
    name: geospatialMessages.styleOutdoors,
    value: 'mapbox://styles/mapbox/outdoors-v12',
  }),
  Object.freeze({
    name: geospatialMessages.styleLight,
    value: 'mapbox://styles/mapbox/light-v11',
  }),
  Object.freeze({
    name: geospatialMessages.styleDark,
    value: 'mapbox://styles/mapbox/dark-v11',
  }),
  Object.freeze({
    name: geospatialMessages.styleSatellite,
    value: 'mapbox://styles/mapbox/satellite-v9',
  }),
  Object.freeze({
    name: geospatialMessages.styleSatelliteStreets,
    value: 'mapbox://styles/mapbox/satellite-streets-v12',
  }),
  Object.freeze({
    name: geospatialMessages.styleNavigationDay,
    value: 'mapbox://styles/mapbox/navigation-day-v1',
  }),
  Object.freeze({
    name: geospatialMessages.styleNavigationNight,
    value: 'mapbox://styles/mapbox/navigation-night-v1',
  }),
]);

export const mapStyleOptions = (intl: IntlShape): MapStyleOption[] =>
  MAP_STYLES.map(({ name, value }) => ({
    label: intl.formatMessage(name),
    value,
  }));
