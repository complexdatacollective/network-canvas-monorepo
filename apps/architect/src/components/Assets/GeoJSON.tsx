import { useEffect, useMemo, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { getAssetById } from '~/utils/assetUtils';
import { readGeoJsonFeatureProperties } from '~/utils/protocols/assetTools';

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
type GeoJSONRows = Record<string, unknown>[];
const EMPTY_ROWS: GeoJSONRows = [];
const getRows = async (assetId: string): Promise<GeoJSONRows> => {
  const asset = await getAssetById(assetId);
  if (!asset) {
    return [];
  }
  const text =
    typeof asset.data === 'string' ? asset.data : await asset.data.text();
  return readGeoJsonFeatureProperties(text);
};
const getColumns = (rows: GeoJSONRows): TableColumn[] => {
  const columnNames = Array.from(new Set(rows.flatMap(Object.keys)));
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
    rows: GeoJSONRows;
  } | null>(null);
  useEffect(() => {
    if (!assetId) {
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const rows = await getRows(assetId);
      if (!cancelled) {
        setLoaded({ assetId, rows });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assetId]);
  const allRows = loaded?.assetId === assetId ? loaded.rows : EMPTY_ROWS;
  const columns = useMemo(() => getColumns(allRows), [allRows]);
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
export default withAssetPath(GeoJSONTable);
