import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';

export const assetMetadataMessages = defineMessages({
  image: {
    id: 'architect.assetMetadata.image',
    defaultMessage: 'Image',
    description:
      'Researcher-facing resource metadata label; resource names and stable file/type identifiers are kept unchanged.',
  },
  video: {
    id: 'architect.assetMetadata.video',
    defaultMessage: 'Video',
    description:
      'Researcher-facing resource metadata label; resource names and stable file/type identifiers are kept unchanged.',
  },
  audio: {
    id: 'architect.assetMetadata.audio',
    defaultMessage: 'Audio',
    description:
      'Researcher-facing resource metadata label; resource names and stable file/type identifiers are kept unchanged.',
  },
  network: {
    id: 'architect.assetMetadata.network',
    defaultMessage: 'Network',
    description:
      'Researcher-facing resource metadata label; resource names and stable file/type identifiers are kept unchanged.',
  },
  apikey: {
    id: 'architect.assetMetadata.apikey',
    defaultMessage: 'API key',
    description:
      'Researcher-facing resource metadata label; resource names and stable file/type identifiers are kept unchanged.',
  },
  geojson: {
    id: 'architect.assetMetadata.geojson',
    defaultMessage: 'GeoJSON',
    description:
      'Researcher-facing resource metadata label; resource names and stable file/type identifiers are kept unchanged.',
  },
  interviewNetwork: {
    id: 'architect.assetMetadata.interviewNetwork',
    defaultMessage: 'Interview network',
    description:
      'Researcher-facing resource metadata label; resource names and stable file/type identifiers are kept unchanged.',
  },
});

/** Format a stable resource type while preserving unknown imported identifiers. */
export function formatAssetType(type: string | undefined, intl: IntlShape) {
  const descriptor = Object.entries(assetMetadataMessages).find(
    ([value]) => value === type,
  )?.[1];
  return descriptor ? intl.formatMessage(descriptor) : type;
}
