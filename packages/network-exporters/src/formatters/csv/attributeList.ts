import type { Codebook } from '@codaco/protocol-validation';
import {
  egoProperty,
  entityPrimaryKeyProperty,
  ncUUIDProperty,
  nodeExportIDProperty,
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

const BUILT_IN_HEADERS = [nodeExportIDProperty, egoProperty, ncUUIDProperty];

export function* attributeListRows(
  network: SessionWithResequencedIDs,
  codebook: Codebook,
  exportOptions: ExportOptions,
  reportWarning: (warning: ExportWarning) => void,
): Generator<string, void, void> {
  const columns = planTypedColumns(
    'node',
    codebook.node,
    network.nodes.map((node) => ({
      type: node.type,
      attributes: getEntityAttributes(node),
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

  for (const node of network.nodes) {
    const attributes = getEntityAttributes(node);
    yield (
      [
        node[nodeExportIDProperty],
        node[egoProperty],
        node[entityPrimaryKeyProperty],
        ...columns.map(({ cells }) => cells.get(node.type)?.(attributes)),
      ]
        .map((value) => String(sanitizeCellValue(value) ?? ''))
        .join(',') + csvEOL
    );
  }
}

export function attributeListBytes(
  network: SessionWithResequencedIDs,
  codebook: Codebook,
  exportOptions: ExportOptions,
  reportWarning: (warning: ExportWarning) => void,
): AsyncIterable<Uint8Array> {
  return toAsyncBytes(
    attributeListRows(network, codebook, exportOptions, reportWarning),
  );
}
