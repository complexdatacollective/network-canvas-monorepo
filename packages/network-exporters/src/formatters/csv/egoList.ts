import type { Codebook } from '@codaco/protocol-validation';
import {
  appVersionProperty,
  caseProperty,
  commitHashProperty,
  egoProperty,
  entityPrimaryKeyProperty,
  interviewLocaleProperty,
  ncCaseProperty,
  ncInterviewLocaleProperty,
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
import type { ExportWarning } from '../../output';
import { getEntityAttributes } from '../../utils/general';
import { planEgoColumns } from './columns';
import {
  csvEOL,
  csvHeaderCell,
  sanitizeCellValue,
  toAsyncBytes,
} from './csvShared';

const printableAttribute = (attribute: string) => {
  switch (attribute) {
    case caseProperty:
      return ncCaseProperty;
    case sessionProperty:
      return ncSessionProperty;
    case protocolName:
      return ncProtocolNameProperty;
    case interviewLocaleProperty:
      return ncInterviewLocaleProperty;
    case entityPrimaryKeyProperty:
      return egoProperty;
    default:
      return attribute;
  }
};

export function* egoListRows(
  network: SessionWithResequencedIDs,
  codebook: Codebook,
  exportOptions: ExportOptions,
  reportWarning: (warning: ExportWarning) => void,
): Generator<string, void, void> {
  const { sessionVariables } = network;
  const topLevel = {
    [entityPrimaryKeyProperty]: network.ego[entityPrimaryKeyProperty],
    [caseProperty]: sessionVariables[caseProperty],
    [sessionProperty]: sessionVariables[sessionProperty],
    [protocolName]: sessionVariables[protocolName],
    [sessionStartTimeProperty]: sessionVariables[sessionStartTimeProperty],
    [sessionFinishTimeProperty]: sessionVariables[sessionFinishTimeProperty],
    [sessionExportTimeProperty]: sessionVariables[sessionExportTimeProperty],
    [appVersionProperty]: sessionVariables[appVersionProperty],
    [commitHashProperty]: sessionVariables[commitHashProperty],
    [interviewLocaleProperty]: sessionVariables[interviewLocaleProperty],
  };
  const attributes = getEntityAttributes(network.ego);
  const columns = planEgoColumns(codebook.ego?.variables, attributes, {
    exportOptions,
    protocolName: sessionVariables[protocolName],
    reportWarning,
  });

  yield (
    [
      ...Object.keys(topLevel).map(printableAttribute),
      ...columns.map(({ header }) => header),
    ]
      .map(csvHeaderCell)
      .join(',') + csvEOL
  );

  yield (
    [...Object.values(topLevel), ...columns.map(({ cell }) => cell(attributes))]
      .map((value) => String(sanitizeCellValue(value) ?? ''))
      .join(',') + csvEOL
  );
}

export function egoListBytes(
  network: SessionWithResequencedIDs,
  codebook: Codebook,
  exportOptions: ExportOptions,
  reportWarning: (warning: ExportWarning) => void,
): AsyncIterable<Uint8Array> {
  return toAsyncBytes(
    egoListRows(network, codebook, exportOptions, reportWarning),
  );
}
