import type { Map, MapOptions } from 'mapbox-gl/esm';

import type { IntlShape } from '@codaco/app-i18n/messages';

import { interfaceMessages } from '../messages';

/** Only the native controls mounted by this interface; its zoom/search UI is React. */
export function getMapboxLocale(
  intl: IntlShape,
): NonNullable<MapOptions['locale']> {
  return {
    'Map.Title': intl.formatMessage(interfaceMessages.mapTitle),
    'LogoControl.Title': intl.formatMessage(interfaceMessages.mapboxHomepage),
    'AttributionControl.ToggleAttribution': intl.formatMessage(
      interfaceMessages.toggleAttribution,
    ),
  };
}

/**
 * Mapbox accepts locale only on construction. Its public setLanguage changes
 * basemap data, while these three native DOM labels remain at their initial
 * locale. Update the controls we mount through the public element accessors,
 * preserving the map instance, camera, selected feature, and source credits.
 */
export function updateMapboxControlLocale(
  map: Pick<Map, 'getCanvas' | 'getContainer'>,
  intl: IntlShape,
) {
  const container = map.getContainer();
  map
    .getCanvas()
    .setAttribute('aria-label', intl.formatMessage(interfaceMessages.mapTitle));
  container
    .querySelector('.mapboxgl-ctrl-logo')
    ?.setAttribute(
      'aria-label',
      intl.formatMessage(interfaceMessages.mapboxHomepage),
    );
  const attributionLabel = intl.formatMessage(
    interfaceMessages.toggleAttribution,
  );
  container
    .querySelector('.mapboxgl-ctrl-attrib-button')
    ?.setAttribute('aria-label', attributionLabel);
  container
    .querySelector('.mapboxgl-ctrl-attrib-button .mapboxgl-ctrl-icon')
    ?.setAttribute('title', attributionLabel);
}
