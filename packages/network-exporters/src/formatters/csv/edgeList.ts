import type { Codebook } from '@codaco/protocol-validation';
import {
  edgeExportIDProperty,
  edgeSourceProperty,
  edgeTargetProperty,
  egoProperty,
  entityPrimaryKeyProperty,
  ncSourceUUID,
  ncTargetUUID,
  ncUUIDProperty,
  protocolName,
} from '@codaco/shared-consts';

import type { SessionWithResequencedIDs } from '../../input';
import type { ExportOptions } from '../../options';
import type { ExportWarning } from '../../output';
import { getEntityAttributes } from '../../utils/general';
import { planTypedColumns } from './columns';
import {
  csvEOL,
  csvHeaderCell,
  sanitizeCellValue,
  toAsyncBytes,
} from './csvShared';

const BUILT_IN_HEADERS = [
  edgeExportIDProperty,
  edgeSourceProperty,
  edgeTargetProperty,
  egoProperty,
  ncUUIDProperty,
  ncSourceUUID,
  ncTargetUUID,
];

export function* edgeListRows(
  network: SessionWithResequencedIDs,
  codebook: Codebook,
  exportOptions: ExportOptions,
  reportWarning: (warning: ExportWarning) => void,
): Generator<string, void, void> {
  const columns = planTypedColumns(
    'edge',
    codebook.edge,
    network.edges.map((edge) => ({
      type: edge.type,
      attributes: getEntityAttributes(edge),
    })),
    {
      exportOptions,
      protocolName: network.sessionVariables[protocolName],
      reportWarning,
    },
  );

  yield (
    [...BUILT_IN_HEADERS, ...columns.map(({ header }) => header)]
      .map(csvHeaderCell)
      .join(',') + csvEOL
  );

  for (const edge of network.edges) {
    const attributes = getEntityAttributes(edge);
    yield (
      [
        edge[edgeExportIDProperty],
        edge[edgeSourceProperty],
        edge[edgeTargetProperty],
        edge[egoProperty],
        edge[entityPrimaryKeyProperty],
        edge[ncSourceUUID],
        edge[ncTargetUUID],
        ...columns.map(({ cells }) => cells.get(edge.type)?.(attributes)),
      ]
        .map((value) => String(sanitizeCellValue(value) ?? ''))
        .join(',') + csvEOL
    );
  }
}

export function edgeListBytes(
  network: SessionWithResequencedIDs,
  codebook: Codebook,
  exportOptions: ExportOptions,
  reportWarning: (warning: ExportWarning) => void,
): AsyncIterable<Uint8Array> {
  return toAsyncBytes(
    edgeListRows(network, codebook, exportOptions, reportWarning),
  );
}
