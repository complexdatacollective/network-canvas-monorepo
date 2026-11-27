import {
  egoProperty,
  entityPrimaryKeyProperty,
  ncUUIDProperty,
  nodeExportIDProperty,
  protocolName,
} from '@codaco/shared-consts';

import type { ExportCodebook, SessionWithResequencedIDs } from '../../input';
import type { ExportOptions } from '../../options';
import type { ExportWarning } from '../../output';
import { layoutsOfNodeType } from '../../utils/layouts';
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
  codebook: ExportCodebook,
  exportOptions: ExportOptions,
  reportWarning: (warning: ExportWarning) => void,
): Generator<string, void, void> {
  const columns = planTypedColumns(
    'node',
    codebook.node,
    network.nodes,
    {
      exportOptions,
      protocolName: network.sessionVariables[protocolName],
      reportWarning,
    },
    (type, rows) => layoutsOfNodeType(codebook, type, rows),
  );

  yield (
    [...BUILT_IN_HEADERS, ...columns.map(({ header }) => header)]
      .map(csvHeaderCell)
      .join(',') + csvEOL
  );

  for (const node of network.nodes) {
    yield (
      [
        node[nodeExportIDProperty],
        node[egoProperty],
        node[entityPrimaryKeyProperty],
        ...columns.map(({ cells }) => cells.get(node.type)?.(node)),
      ]
        .map((value) => String(sanitizeCellValue(value) ?? ''))
        .join(',') + csvEOL
    );
  }
}

export function attributeListBytes(
  network: SessionWithResequencedIDs,
  codebook: ExportCodebook,
  exportOptions: ExportOptions,
  reportWarning: (warning: ExportWarning) => void,
): AsyncIterable<Uint8Array> {
  return toAsyncBytes(
    attributeListRows(network, codebook, exportOptions, reportWarning),
  );
}
