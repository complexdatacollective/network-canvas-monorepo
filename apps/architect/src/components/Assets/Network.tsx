/* eslint-disable react/jsx-props-no-spreading */
import { compose } from '@reduxjs/toolkit';
import { useEffect, useMemo, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  getVariableNamesFromNetwork,
  type Network as NetworkType,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  type VariableValue,
} from '@codaco/shared-consts';

import { networkReader } from '../../utils/protocols/assetTools';
import Table, { type TableColumn } from './Table';
import withAssetPath from './withAssetPath';
const messages = defineMessages({
  showingOfRows: {
    id: 'architect.assets.network.showingOfRows',
    defaultMessage: 'Showing {ROW_LIMIT} of {value2} rows',
    description: 'Visible text in components / Assets / Network.',
  },
});

const ROW_LIMIT = 100;
const initialContent: NetworkType = {
  nodes: [],
  edges: [],
};
type NetworkNode = {
  [entityAttributesProperty]: Record<string, VariableValue>;
};
const getRows = (data: NetworkType): Record<string, VariableValue>[] =>
  (data.nodes ?? []).map(
    ({ [entityAttributesProperty]: attributes }: NetworkNode) => attributes,
  );
const getColumns = (data: NetworkType): TableColumn[] =>
  getVariableNamesFromNetwork(data).map((col) => ({
    Header: col,
    accessor: col,
  }));
type NetworkProps = {
  assetPath: string;
  assetId: string;
  assetName: string;
};
const Network = ({
  assetPath: _assetPath,
  assetId,
  assetName,
}: NetworkProps) => {
  const intl = useAppIntl();
  // Held against the asset it was read for. Rendering derives from that match,
  // so the table is empty for an asset that has not been read yet instead of
  // showing the previous asset's rows, and no clearing setState has to race
  // the read that replaces them.
  const [loaded, setLoaded] = useState<{
    assetId: string;
    assetName: string;
    network: NetworkType;
  } | null>(null);
  useEffect(() => {
    if (!assetId || !assetName) {
      return undefined;
    }
    let cancelled = false;
    const result = networkReader(assetName, assetId);
    if (result) {
      void (async () => {
        const networkData: unknown = await result;
        if (cancelled) {
          return;
        }
        const data = networkData as Partial<NetworkType> | undefined;
        setLoaded({
          assetId,
          assetName,
          network: {
            nodes: data?.nodes ?? [],
            edges: data?.edges ?? [],
          },
        });
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [assetId, assetName]);
  const content =
    loaded?.assetId === assetId && loaded.assetName === assetName
      ? loaded.network
      : initialContent;
  const allRows = useMemo(() => getRows(content), [content]);
  const columns = useMemo(() => getColumns(content), [content]);
  const data = useMemo(() => allRows.slice(0, ROW_LIMIT), [allRows]);
  const totalRows = allRows.length;
  const isTruncated = totalRows > ROW_LIMIT;
  return (
    <>
      {isTruncated && (
        <Paragraph intent="smallText" emphasis="muted" className="mb-2">
          {intl.formatMessage(messages.showingOfRows, {
            ROW_LIMIT: intl.formatNumber(ROW_LIMIT),
            value2: intl.formatNumber(totalRows),
          })}
        </Paragraph>
      )}
      <Table data={data} columns={columns} />
    </>
  );
};
export default compose(withAssetPath)(
  Network as unknown as React.ComponentType<unknown>,
) as unknown as React.ComponentType<{
  id: string;
}>;
