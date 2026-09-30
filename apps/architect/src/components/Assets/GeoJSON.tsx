import { useEffect, useMemo, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { getAssetById } from '~/utils/assetUtils';

import Table, { type TableColumn } from './Table';
import withAssetPath from './withAssetPath';
const messages = defineMessages({
  showingOfFeatures: {
    id: 'architect.assets.geoJSON.showingOfFeatures',
    defaultMessage: 'Showing {ROW_LIMIT} of {value2} features',
    description: 'Visible text in components / Assets / GeoJSON.',
  },
});

const ROW_LIMIT = 100;
type GeoJSONFeature = {
  properties: Record<string, unknown>;
};
type GeoJSON = {
  features: GeoJSONFeature[];
};
const EMPTY_GEOJSON: GeoJSON = { features: [] };
const getGeoJSON = async (assetId: string): Promise<GeoJSON> => {
  const asset = await getAssetById(assetId);
  if (!asset) {
    return { features: [] };
  }
  const text =
    typeof asset.data === 'string' ? asset.data : await asset.data.text();
  return JSON.parse(text) as GeoJSON;
};
const getRows = (geojson: GeoJSON): Record<string, unknown>[] =>
  (geojson.features ?? []).map(({ properties }: GeoJSONFeature) => properties);
const getColumns = (geojson: GeoJSON): TableColumn[] => {
  const properties = (geojson.features ?? []).map(
    (feature: GeoJSONFeature) => feature.properties,
  );
  const columnNames = Array.from(new Set(properties.flatMap(Object.keys)));
  return columnNames.map((col) => ({
    Header: col,
    accessor: col,
  }));
};
type GeoJSONTableProps = {
  assetPath: string;
  assetId: string;
};
const GeoJSONTable = ({ assetId }: GeoJSONTableProps) => {
  const intl = useAppIntl();
  // Held against the asset it was read for. Rendering derives from that match,
  // so the table is empty for an asset that has not been read yet instead of
  // showing the previous asset's features, and no clearing setState has to
  // race the read that replaces them.
  const [loaded, setLoaded] = useState<{
    assetId: string;
    geoJSON: GeoJSON;
  } | null>(null);
  useEffect(() => {
    if (!assetId) {
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const geoJSON = await getGeoJSON(assetId);
      if (!cancelled) {
        setLoaded({ assetId, geoJSON });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assetId]);
  const content = loaded?.assetId === assetId ? loaded.geoJSON : EMPTY_GEOJSON;
  const allRows = useMemo(() => getRows(content), [content]);
  const columns = useMemo(() => getColumns(content), [content]);
  const data = useMemo(() => allRows.slice(0, ROW_LIMIT), [allRows]);
  const totalRows = allRows.length;
  const isTruncated = totalRows > ROW_LIMIT;
  return (
    <>
      {isTruncated && (
        <Paragraph intent="smallText" emphasis="muted" className="mb-2">
          {intl.formatMessage(messages.showingOfFeatures, {
            ROW_LIMIT: intl.formatNumber(ROW_LIMIT),
            value2: intl.formatNumber(totalRows),
          })}
        </Paragraph>
      )}
      <Table data={data} columns={columns} />
    </>
  );
};
export default withAssetPath(GeoJSONTable as React.ComponentType<unknown>);
