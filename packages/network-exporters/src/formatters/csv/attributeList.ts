import type { Codebook } from '@codaco/protocol-validation';
import {
  egoProperty,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  ncUUIDProperty,
  nodeExportIDProperty,
} from '@codaco/shared-consts';

import type {
  NodeWithResequencedID,
  SessionWithResequencedIDs,
} from '../../input';
import type { ExportOptions } from '../../options';
import { getOwn } from '../../utils/general';
import { csvEOL, sanitizeCellValue, toAsyncBytes } from './csvShared';
import processEntityVariables from './processEntityVariables';
import { addVariableHeaders } from './variableHeaders';

const printableAttribute = (attribute: string) =>
  attribute === entityPrimaryKeyProperty ? ncUUIDProperty : attribute;

type ProcessedNode = NodeWithResequencedID & {
  [entityAttributesProperty]: Record<string, unknown>;
};

function collectHeaders(
  nodes: ProcessedNode[],
  codebook: Codebook,
  exportOptions: ExportOptions,
): string[] {
  const headers = new Set<string>([
    nodeExportIDProperty,
    egoProperty,
    entityPrimaryKeyProperty,
  ]);

  const nodeTypes = new Set(nodes.map((node) => node.type));
  const definitions =
    nodeTypes.size === 0
      ? Object.values(codebook.node ?? {})
      : [...nodeTypes].flatMap((type) => {
          const definition = getOwn(codebook.node, type);
          return definition ? [definition] : [];
        });
  for (const definition of definitions) {
    addVariableHeaders(headers, definition.variables, exportOptions);
  }

  for (const node of nodes) {
    for (const key of Object.keys(node[entityAttributesProperty])) {
      headers.add(key);
    }
  }
  return [...headers];
}

export function* attributeListRows(
  network: SessionWithResequencedIDs,
  codebook: Codebook,
  exportOptions: ExportOptions,
): Generator<string, void, void> {
  const nodes: ProcessedNode[] = network.nodes.map((node) =>
    processEntityVariables(node, 'node', codebook, exportOptions),
  );

  const headers = collectHeaders(nodes, codebook, exportOptions);

  yield (
    headers
      .map((h) => String(sanitizeCellValue(printableAttribute(h)) ?? ''))
      .join(',') + csvEOL
  );

  for (const node of nodes) {
    const cells = headers.map((header) => {
      let value: unknown;
      if (header === entityPrimaryKeyProperty) {
        value = node[entityPrimaryKeyProperty];
      } else if (header === egoProperty) {
        value = node[egoProperty];
      } else if (header === nodeExportIDProperty) {
        value = node[nodeExportIDProperty];
      } else {
        value = node[entityAttributesProperty][header];
      }
      return String(sanitizeCellValue(value) ?? '');
    });
    yield cells.join(',') + csvEOL;
  }
}

export function attributeListBytes(
  network: SessionWithResequencedIDs,
  codebook: Codebook,
  exportOptions: ExportOptions,
): AsyncIterable<Uint8Array> {
  return toAsyncBytes(attributeListRows(network, codebook, exportOptions));
}
