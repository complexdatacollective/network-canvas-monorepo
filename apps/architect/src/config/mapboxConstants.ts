import { defineMessages } from '@codaco/app-i18n/messages';
const configMessages = defineMessages({
  standard: {
    id: 'architect.config.mapboxConstants.config.standard',
    defaultMessage: 'Standard',
    description:
      'Name of the Mapbox map style "Standard", one of the base map styles a Geospatial interface stage can use; shown in the Protocol Summary. Follow the Mapbox naming for the style.',
  },
  standardSatellite: {
    id: 'architect.config.mapboxConstants.config.standardSatellite',
    defaultMessage: 'Standard Satellite',
    description:
      'Name of the Mapbox map style "Standard Satellite", one of the base map styles a Geospatial interface stage can use; shown in the Protocol Summary. Follow the Mapbox naming for the style.',
  },
  streets: {
    id: 'architect.config.mapboxConstants.config.streets',
    defaultMessage: 'Streets',
    description:
      'Name of the Mapbox map style "Streets", one of the base map styles a Geospatial interface stage can use; shown in the Protocol Summary. Follow the Mapbox naming for the style.',
  },
  outdoors: {
    id: 'architect.config.mapboxConstants.config.outdoors',
    defaultMessage: 'Outdoors',
    description:
      'Name of the Mapbox map style "Outdoors", one of the base map styles a Geospatial interface stage can use; shown in the Protocol Summary. Follow the Mapbox naming for the style.',
  },
  light: {
    id: 'architect.config.mapboxConstants.config.light',
    defaultMessage: 'Light',
    description:
      'Name of the Mapbox map style "Light", one of the base map styles a Geospatial interface stage can use; shown in the Protocol Summary. Follow the Mapbox naming for the style.',
  },
  dark: {
    id: 'architect.config.mapboxConstants.config.dark',
    defaultMessage: 'Dark',
    description:
      'Name of the Mapbox map style "Dark", one of the base map styles a Geospatial interface stage can use; shown in the Protocol Summary. Follow the Mapbox naming for the style.',
  },
  satellite: {
    id: 'architect.config.mapboxConstants.config.satellite',
    defaultMessage: 'Satellite',
    description:
      'Name of the Mapbox map style "Satellite", one of the base map styles a Geospatial interface stage can use; shown in the Protocol Summary. Follow the Mapbox naming for the style.',
  },
  satelliteStreets: {
    id: 'architect.config.mapboxConstants.config.satelliteStreets',
    defaultMessage: 'Satellite Streets',
    description:
      'Name of the Mapbox map style "Satellite Streets", one of the base map styles a Geospatial interface stage can use; shown in the Protocol Summary. Follow the Mapbox naming for the style.',
  },
  navigationDay: {
    id: 'architect.config.mapboxConstants.config.navigationDay',
    defaultMessage: 'Navigation Day',
    description:
      'Name of the Mapbox map style "Navigation Day", one of the base map styles a Geospatial interface stage can use; shown in the Protocol Summary. Follow the Mapbox naming for the style.',
  },
  navigationNight: {
    id: 'architect.config.mapboxConstants.config.navigationNight',
    defaultMessage: 'Navigation Night',
    description:
      'Name of the Mapbox map style "Navigation Night", one of the base map styles a Geospatial interface stage can use; shown in the Protocol Summary. Follow the Mapbox naming for the style.',
  },
});

export const mapboxStyleOptions = [
  { label: configMessages.standard, value: 'mapbox://styles/mapbox/standard' },
  {
    label: configMessages.standardSatellite,
    value: 'mapbox://styles/mapbox/standard-satellite',
  },
  {
    label: configMessages.streets,
    value: 'mapbox://styles/mapbox/streets-v12',
  },
  {
    label: configMessages.outdoors,
    value: 'mapbox://styles/mapbox/outdoors-v12',
  },
  { label: configMessages.light, value: 'mapbox://styles/mapbox/light-v11' },
  { label: configMessages.dark, value: 'mapbox://styles/mapbox/dark-v11' },
  {
    label: configMessages.satellite,
    value: 'mapbox://styles/mapbox/satellite-v9',
  },
  {
    label: configMessages.satelliteStreets,
    value: 'mapbox://styles/mapbox/satellite-streets-v12',
  },
  {
    label: configMessages.navigationDay,
    value: 'mapbox://styles/mapbox/navigation-day-v1',
  },
  {
    label: configMessages.navigationNight,
    value: 'mapbox://styles/mapbox/navigation-night-v1',
  },
];
