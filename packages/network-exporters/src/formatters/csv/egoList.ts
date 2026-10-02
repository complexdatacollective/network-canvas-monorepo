import type { Codebook } from '@codaco/protocol-validation';
import {
  appVersionProperty,
  caseProperty,
  commitHashProperty,
  egoProperty,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  ncCaseProperty,
  ncProtocolNameProperty,
  ncSessionProperty,
  protocolName,
  sessionExportTimeProperty,
  sessionFinishTimeProperty,
  sessionProperty,
  sessionStartTimeProperty,
} from '@codaco/shared-consts';

import type { SessionWithResequencedIDs } from '../../input';
import type { ExportOptions } from '../../options';
import { csvEOL, sanitizeCellValue, toAsyncBytes } from './csvShared';
import processEntityVariables from './processEntityVariables';
import { addVariableHeaders } from './variableHeaders';

const TOP_LEVEL_COLUMNS = [
  entityPrimaryKeyProperty,
  caseProperty,
  sessionProperty,
  protocolName,
  sessionStartTimeProperty,
  sessionFinishTimeProperty,
  sessionExportTimeProperty,
  appVersionProperty,
  commitHashProperty,
];

const TOP_LEVEL_KEYS = new Set<string>(TOP_LEVEL_COLUMNS);

const printableAttribute = (attribute: string) => {
  switch (attribute) {
    case caseProperty:
      return ncCaseProperty;
    case sessionProperty:
      return ncSessionProperty;
    case protocolName:
      return ncProtocolNameProperty;
    case entityPrimaryKeyProperty:
      return egoProperty;
    default:
      return attribute;
  }
};

const isUnknownRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function collectHeaders(
  ego: Record<string, unknown>,
  codebook: Codebook,
  exportOptions: ExportOptions,
): string[] {
  const headers = new Set<string>(TOP_LEVEL_COLUMNS);

  addVariableHeaders(headers, codebook.ego?.variables, exportOptions);

  const attrs = ego[entityAttributesProperty];
  if (!isUnknownRecord(attrs)) {
    return [...headers];
  }
  for (const key of Object.keys(attrs)) {
    headers.add(key);
  }

  return [...headers];
}

export function* egoListRows(
  network: SessionWithResequencedIDs,
  codebook: Codebook,
  exportOptions: ExportOptions,
): Generator<string, void, void> {
  const ego: Record<string, unknown> = {
    ...processEntityVariables(network.ego, 'ego', codebook, exportOptions),
    ...network.sessionVariables,
  };

  const headers = collectHeaders(ego, codebook, exportOptions);

  yield (
    headers
      .map((h) => String(sanitizeCellValue(printableAttribute(h)) ?? ''))
      .join(',') + csvEOL
  );

  const attrs = ego[entityAttributesProperty];
  const cells = headers.map((header) => {
    const value = TOP_LEVEL_KEYS.has(header)
      ? ego[header]
      : isUnknownRecord(attrs)
        ? attrs[header]
        : undefined;
    return String(sanitizeCellValue(value) ?? '');
  });

  yield cells.join(',') + csvEOL;
}

export function egoListBytes(
  network: SessionWithResequencedIDs,
  codebook: Codebook,
  exportOptions: ExportOptions,
): AsyncIterable<Uint8Array> {
  return toAsyncBytes(egoListRows(network, codebook, exportOptions));
}
