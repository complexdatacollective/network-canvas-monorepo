import type { Codebook } from '@codaco/protocol-validation';

import { adjacencyMatrixBytes } from '../formatters/csv/adjacencyMatrix';
import { attributeListBytes } from '../formatters/csv/attributeList';
import { edgeListBytes } from '../formatters/csv/edgeList';
import { egoListBytes } from '../formatters/csv/egoList';
import { graphmlBytes } from '../formatters/graphml/graphmlReadable';
import type { ExportFormat, ExportOptions } from '../options';
import type { ExportFileNetwork } from '../session/exportFile';

type FormatterBytes = (
  network: ExportFileNetwork,
  codebook: Codebook,
  options: ExportOptions,
) => AsyncIterable<Uint8Array>;

export function getFormatter(format: ExportFormat): FormatterBytes {
  switch (format) {
    case 'graphml':
      return graphmlBytes;
    case 'attributeList':
      return attributeListBytes;
    case 'edgeList':
      return edgeListBytes;
    case 'ego':
      return egoListBytes;
    case 'adjacencyMatrix':
      return adjacencyMatrixBytes;
  }
}
