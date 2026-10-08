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
  const columns = planTypedColumns('edge', codebook.edge, network.edges, {
    exportOptions,
    protocolName: network.sessionVariables[protocolName],
    reportWarning,
  });

  yield (
    [...BUILT_IN_HEADERS, ...columns.map(({ header }) => header)]
      .map(csvHeaderCell)
      .join(',') + csvEOL
  );

  for (const edge of network.edges) {
    yield (
      [
        edge[edgeExportIDProperty],
        edge[edgeSourceProperty],
        edge[edgeTargetProperty],
        edge[egoProperty],
        edge[entityPrimaryKeyProperty],
        edge[ncSourceUUID],
        edge[ncTargetUUID],
        ...columns.map(({ cells }) => cells.get(edge.type)?.(edge)),
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
