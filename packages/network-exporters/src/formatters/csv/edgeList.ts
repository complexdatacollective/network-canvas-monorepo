import type { Codebook } from '@codaco/protocol-validation';
import {
  edgeExportIDProperty,
  edgeSourceProperty,
  edgeTargetProperty,
  egoProperty,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  ncSourceUUID,
  ncTargetUUID,
  ncUUIDProperty,
} from '@codaco/shared-consts';

import type {
  EdgeWithResequencedID,
  SessionWithResequencedIDs,
} from '../../input';
import type { ExportOptions } from '../../options';
import { getOwn } from '../../utils/general';
import { csvEOL, sanitizeCellValue, toAsyncBytes } from './csvShared';
import processEntityVariables from './processEntityVariables';
import { addVariableHeaders } from './variableHeaders';

const printableAttribute = (attribute: string) =>
  attribute === entityPrimaryKeyProperty ? ncUUIDProperty : attribute;

type ProcessedEdge = EdgeWithResequencedID & {
  [entityAttributesProperty]: Record<string, unknown>;
};

function collectHeaders(
  edges: ProcessedEdge[],
  codebook: Codebook,
  exportOptions: ExportOptions,
): string[] {
  const headers = new Set<string>([
    edgeExportIDProperty,
    edgeSourceProperty,
    edgeTargetProperty,
    egoProperty,
    entityPrimaryKeyProperty,
    ncSourceUUID,
    ncTargetUUID,
  ]);

  const edgeTypes = new Set(edges.map((edge) => edge.type));
  const definitions =
    edgeTypes.size === 0
      ? Object.values(codebook.edge ?? {})
      : [...edgeTypes].flatMap((type) => {
          const definition = getOwn(codebook.edge, type);
          return definition ? [definition] : [];
        });
  for (const definition of definitions) {
    addVariableHeaders(headers, definition.variables, exportOptions);
  }

  for (const edge of edges) {
    for (const key of Object.keys(edge[entityAttributesProperty])) {
      headers.add(key);
    }
  }
  return [...headers];
}

const getValue = (edge: ProcessedEdge, header: string) => {
  switch (header) {
    case entityPrimaryKeyProperty:
      return edge[entityPrimaryKeyProperty];
    case edgeExportIDProperty:
      return edge[edgeExportIDProperty];
    case egoProperty:
      return edge[egoProperty];
    case edgeSourceProperty:
      return edge[edgeSourceProperty];
    case edgeTargetProperty:
      return edge[edgeTargetProperty];
    case ncSourceUUID:
      return edge[ncSourceUUID];
    case ncTargetUUID:
      return edge[ncTargetUUID];
    default:
      return edge[entityAttributesProperty][header];
  }
};

export function* edgeListRows(
  network: SessionWithResequencedIDs,
  codebook: Codebook,
  exportOptions: ExportOptions,
): Generator<string, void, void> {
  const edges: ProcessedEdge[] = network.edges.map((edge) =>
    processEntityVariables(edge, 'edge', codebook, exportOptions),
  );

  const headers = collectHeaders(edges, codebook, exportOptions);

  yield (
    headers
      .map((h) => String(sanitizeCellValue(printableAttribute(h)) ?? ''))
      .join(',') + csvEOL
  );

  for (const edge of edges) {
    const cells = headers.map((header) => {
      const value = getValue(edge, header);
      return String(sanitizeCellValue(value) ?? '');
    });
    yield cells.join(',') + csvEOL;
  }
}

export function edgeListBytes(
  network: SessionWithResequencedIDs,
  codebook: Codebook,
  exportOptions: ExportOptions,
): AsyncIterable<Uint8Array> {
  return toAsyncBytes(edgeListRows(network, codebook, exportOptions));
}
