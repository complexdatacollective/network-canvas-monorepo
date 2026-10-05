import { defineMessages } from '@codaco/app-i18n/messages';
const configMessages = defineMessages({
  standard: {
    id: 'architect.config.mapboxConstants.config.standard',
    defaultMessage: 'Standard',
    description:
      'Presentation label or description in config/mapboxConstants.ts. Identifiers are not translated.',
  },
  standardSatellite: {
    id: 'architect.config.mapboxConstants.config.standardSatellite',
    defaultMessage: 'Standard Satellite',
    description:
      'Presentation label or description in config/mapboxConstants.ts. Identifiers are not translated.',
  },
  streets: {
    id: 'architect.config.mapboxConstants.config.streets',
    defaultMessage: 'Streets',
    description:
      'Presentation label or description in config/mapboxConstants.ts. Identifiers are not translated.',
  },
  outdoors: {
    id: 'architect.config.mapboxConstants.config.outdoors',
    defaultMessage: 'Outdoors',
    description:
      'Presentation label or description in config/mapboxConstants.ts. Identifiers are not translated.',
  },
  light: {
    id: 'architect.config.mapboxConstants.config.light',
    defaultMessage: 'Light',
    description:
      'Presentation label or description in config/mapboxConstants.ts. Identifiers are not translated.',
  },
  dark: {
    id: 'architect.config.mapboxConstants.config.dark',
    defaultMessage: 'Dark',
    description:
      'Presentation label or description in config/mapboxConstants.ts. Identifiers are not translated.',
  },
  satellite: {
    id: 'architect.config.mapboxConstants.config.satellite',
    defaultMessage: 'Satellite',
    description:
      'Presentation label or description in config/mapboxConstants.ts. Identifiers are not translated.',
  },
  satelliteStreets: {
    id: 'architect.config.mapboxConstants.config.satelliteStreets',
    defaultMessage: 'Satellite Streets',
    description:
      'Presentation label or description in config/mapboxConstants.ts. Identifiers are not translated.',
  },
  navigationDay: {
    id: 'architect.config.mapboxConstants.config.navigationDay',
    defaultMessage: 'Navigation Day',
    description:
      'Presentation label or description in config/mapboxConstants.ts. Identifiers are not translated.',
  },
  navigationNight: {
    id: 'architect.config.mapboxConstants.config.navigationNight',
    defaultMessage: 'Navigation Night',
    description:
      'Presentation label or description in config/mapboxConstants.ts. Identifiers are not translated.',
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
