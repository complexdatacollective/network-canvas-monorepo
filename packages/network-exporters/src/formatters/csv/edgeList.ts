import type { Codebook, Variable } from '@codaco/protocol-validation';
import {
  edgeExportIDProperty,
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
import { csvEOL, sanitizeCellValue, toAsyncBytes } from './csvShared';
import processEntityVariables from './processEntityVariables';

const printableAttribute = (attribute: string) =>
  attribute === entityPrimaryKeyProperty ? ncUUIDProperty : attribute;

type ProcessedEdge = EdgeWithResequencedID & {
  [entityAttributesProperty]: Record<string, unknown>;
};

const addVariableHeaders = (
  headers: Set<string>,
  variables: Record<string, Variable> | undefined,
  exportOptions: ExportOptions,
) => {
  for (const variable of Object.values(variables ?? {})) {
    if (variable.type === 'categorical') {
      for (const option of variable.options) {
        headers.add(`${variable.name}_${option.value}`);
      }
    } else if (variable.type === 'layout') {
      headers.add(`${variable.name}_x`);
      headers.add(`${variable.name}_y`);
      if (exportOptions.globalOptions.useScreenLayoutCoordinates) {
        headers.add(`${variable.name}_screenSpaceX`);
        headers.add(`${variable.name}_screenSpaceY`);
      }
    } else {
      headers.add(variable.name);
    }
  }
};

function collectHeaders(
  edges: ProcessedEdge[],
  codebook: Codebook,
  exportOptions: ExportOptions,
): string[] {
  const headers = new Set<string>([
    edgeExportIDProperty,
    'from',
    'to',
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
          const definition = codebook.edge?.[type];
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
    case 'from':
      return edge.from;
    case 'to':
      return edge.to;
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
