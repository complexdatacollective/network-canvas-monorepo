import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { mapboxStyleOptions } from '~/config/mapboxConstants';
import { formatConfig } from '~/i18n/formatConfig';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import AssetBadge from '../AssetBadge';
import MiniTable from '../MiniTable';
import SectionFrame from './SectionFrame';
const chromeMessages = defineMessages({
  message: {
    id: 'architect.chrome.protocolSummary.stage.mapOptions.message',
    defaultMessage: '{value1}, {value2}',
    description:
      'Researcher-facing explanatory text in lib / ProtocolSummary / components / Stage / MapOptions.',
  },
});
const messages = defineMessages({
  mapboxAPIKey: {
    id: 'architect.protocolSummary.stage.mapOptions.mapboxAPIKey',
    defaultMessage: 'Mapbox API Key',
    description:
      'The title text in lib / ProtocolSummary / components / Stage / MapOptions.',
  },
  geoJSONDataSource: {
    id: 'architect.protocolSummary.stage.mapOptions.geoJSONDataSource',
    defaultMessage: 'GeoJSON Data Source',
    description:
      'The title text in lib / ProtocolSummary / components / Stage / MapOptions.',
  },
});

type MapOptionsProps = {
  mapOptions?: {
    tokenAssetId?: string;
    dataSourceAssetId?: string;
    style?: string;
    center?: [number, number];
    initialZoom?: number;
    color?: string;
    targetFeatureProperty?: string;
  } | null;
};

const MapOptions = ({ mapOptions = null }: MapOptionsProps) => {
  const intl = useAppIntl();
  const mapboxStyleLabels = Object.fromEntries(
    formatConfig(mapboxStyleOptions, intl).map(({ value, label }) => [
      value,
      label,
    ]),
  );
  if (!mapOptions) {
    return null;
  }

  const {
    tokenAssetId,
    dataSourceAssetId,
    style,
    center,
    initialZoom,
    color,
    targetFeatureProperty,
  } = mapOptions;

  const styleLabel = style ? (mapboxStyleLabels[style] ?? style) : undefined;
  const centerDisplay = center
    ? intl.formatMessage(chromeMessages.message, {
        value1: center[1].toFixed(4),
        value2: center[0].toFixed(4),
      })
    : undefined;

  const configRows: [string, React.ReactNode][] = [];

  if (styleLabel) {
    configRows.push([intl.formatMessage(summaryMessages.mapStyle), styleLabel]);
  }
  if (centerDisplay) {
    configRows.push([
      intl.formatMessage(summaryMessages.initialCenterLatLng),
      centerDisplay,
    ]);
  }
  if (initialZoom !== undefined) {
    configRows.push([
      intl.formatMessage(summaryMessages.initialZoom),
      String(initialZoom),
    ]);
  }
  if (color) {
    configRows.push([
      intl.formatMessage(summaryMessages.selectionColor),
      color,
    ]);
  }
  if (targetFeatureProperty) {
    configRows.push([
      intl.formatMessage(summaryMessages.targetFeatureProperty),
      targetFeatureProperty,
    ]);
  }

  return (
    <>
      {tokenAssetId && (
        <SectionFrame title={intl.formatMessage(messages.mapboxAPIKey)}>
          <AssetBadge id={tokenAssetId} link />
        </SectionFrame>
      )}
      {dataSourceAssetId && (
        <SectionFrame title={intl.formatMessage(messages.geoJSONDataSource)}>
          <AssetBadge id={dataSourceAssetId} link />
        </SectionFrame>
      )}
      {configRows.length > 0 && <MiniTable rotated rows={configRows} />}
    </>
  );
};

export default MapOptions;
