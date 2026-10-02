import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import { stripXmlIllegalCharacters } from '@codaco/shared-consts';

import type { ExportEvent } from './events';
import {
  type ExportWarning,
  exportWarningKey,
  uniqueExportWarnings,
} from './output';

/**
 * UI presentation of stable export stages. Import this optional subpath only
 * in a localized host; the worker pipeline keeps its existing plain diagnostic
 * messages and does not depend on React or a mutable application locale.
 */
export const exportStageMessages = defineMessages({
  fetching: {
    id: 'networkExporters.stage.fetching',
    defaultMessage: 'Fetching interview data...',
    description: 'Export progress while retrieving stored interviews.',
  },
  formatting: {
    id: 'networkExporters.stage.formatting',
    defaultMessage: 'Formatting sessions...',
    description: 'Export progress while preparing session data for export.',
  },
  generating: {
    id: 'networkExporters.stage.generating',
    defaultMessage: 'Generating files...',
    description: 'Export progress while creating CSV or GraphML files.',
  },
  outputting: {
    id: 'networkExporters.stage.outputting',
    defaultMessage: 'Writing output...',
    description: 'Export progress while writing the completed export files.',
  },
}) satisfies Record<ExportEvent['stage'], MessageDescriptor>;

const exportWarningMessages = defineMessages({
  xmlCharactersTitle: {
    id: 'networkExporters.warning.xmlCharacters.title',
    defaultMessage: 'Some characters were removed from the GraphML files',
    description:
      'Heading of the warning shown after an export when some answers held characters that GraphML files cannot store.',
  },
  xmlCharactersDescription: {
    id: 'networkExporters.warning.xmlCharacters.description',
    defaultMessage:
      'Some answers contained characters that GraphML cannot store, so they were removed from the GraphML files only. The CSV files keep every answer unchanged. The affected interviews and variables are:',
    description:
      'Explanation in the warning shown after an export, followed by a list of the interviews and the variables whose answers lost characters in the GraphML files. GraphML is a network file format. CSV is a spreadsheet file format.',
  },
  xmlCharactersInterview: {
    id: 'networkExporters.warning.xmlCharacters.interview',
    defaultMessage: 'Interview {caseId}: {variables}',
    description:
      'One entry in the list of interviews affected by removed characters. {caseId} is the interview’s case ID. {variables} is a list of the names of the variables, joined into a sentence, whose answers lost characters.',
  },
  caseId: {
    id: 'networkExporters.warning.xmlCharacters.caseId',
    defaultMessage: 'Case ID',
    description:
      'Name of an interview’s case ID, the identifier the researcher gave the interview, shown in a list of the variables whose answers lost characters.',
  },
  protocolTextTitle: {
    id: 'networkExporters.warning.protocolText.title',
    defaultMessage:
      'Some characters were removed from protocol text in the GraphML files',
    description:
      'Heading of the warning shown after an export when text written in the protocol itself, such as its name or the name of a type, held characters that GraphML files cannot store. GraphML is a network file format.',
  },
  protocolTextDescription: {
    id: 'networkExporters.warning.protocolText.description',
    defaultMessage:
      'Some of the protocol’s own text contained characters that GraphML cannot store, so they were removed in the GraphML files. These characters are usually invisible, so each one is named by its Unicode code point, such as U+0007. The affected text is:',
    description:
      'Explanation in the warning shown after an export, followed by a list of the protocol’s names that lost characters in the GraphML files. A protocol is the study design a researcher builds. GraphML is a network file format. A Unicode code point, written like U+0007, is the standard number that identifies a character; keep “U+0007” as it is.',
  },
  protocolTextItem: {
    id: 'networkExporters.warning.protocolText.item',
    defaultMessage:
      '{text, select, protocolName {The protocol name “{name}”, with {characters} removed} nodeTypeName {The node type name “{name}” in {protocolName}, with {characters} removed} edgeTypeName {The edge type name “{name}” in {protocolName}, with {characters} removed} other {The column name “{name}” in {protocolName}, with {characters} removed}}',
    description:
      'One entry in the list of protocol text that lost characters in the GraphML files. {text} says which text it is: the protocol’s name, the name of a node type (a kind of person, place or thing in the network), the name of an edge type (a kind of relationship), or the name of a column. {name} is that text as the GraphML files now hold it, without the removed characters. {characters} is a list, joined into a sentence, of the removed characters, each written as its Unicode code point, such as U+0007. {protocolName} is the name of the protocol.',
  },
  columnRenamedTitle: {
    id: 'networkExporters.warning.columnRenamed.title',
    defaultMessage: 'Some columns were given new names',
    description:
      'Heading of the warning shown after an export when some columns in the exported files were renamed because another column in the same file already had their name.',
  },
  columnRenamedDescription: {
    id: 'networkExporters.warning.columnRenamed.description',
    defaultMessage:
      'Some columns would have had the same name as another column in the same file. So that no answers are lost, each was written under a numbered name instead. The renamed columns are:',
    description:
      'Explanation in the warning shown after an export, followed by a list of the columns that were renamed. A column is one field of the exported data, such as a variable’s answers.',
  },
  columnRenamedItem: {
    id: 'networkExporters.warning.columnRenamed.item',
    defaultMessage:
      'In the {format, select, csv {CSV} other {GraphML}} files of {protocolName}, the {entity, select, ego {ego} other {{entityTypeName}}} column “{column}” was written as “{renamedTo}”.',
    description:
      'One entry in the list of renamed columns. {format} is the file format: CSV, a spreadsheet format, or GraphML, a network format. {protocolName} is the name of the protocol, the study design a researcher builds. {entity} is “ego” for the column of the interview’s participant, and otherwise the column belongs to {entityTypeName}, the name the researcher gave a kind of person, place, thing or relationship. {column} is the name the column would have had, and {renamedTo} the numbered name it was written under.',
  },
  columnRenamedFromVariableItem: {
    id: 'networkExporters.warning.columnRenamed.fromVariableItem',
    defaultMessage:
      'In the {format, select, csv {CSV} other {GraphML}} files of {protocolName}, the {entity, select, ego {ego} other {{entityTypeName}}} column “{column}”, from the variable {variable}, was written as “{renamedTo}”.',
    description:
      'One entry in the list of renamed columns, for a column that holds one part of a variable, such as one option of a multiple-choice question. {format} is the file format: CSV, a spreadsheet format, or GraphML, a network format. {protocolName} is the name of the protocol, the study design a researcher builds. {entity} is “ego” for the column of the interview’s participant, and otherwise the column belongs to {entityTypeName}, the name the researcher gave a kind of person, place, thing or relationship. {column} is the name the column would have had, {variable} the name of the variable it comes from, and {renamedTo} the numbered name it was written under.',
  },
});

type ExportWarningKind = ExportWarning['kind'];

// Groups are shown in `order`: the interviews' own answers first.
const groupMessages = {
  'xml-illegal-characters': {
    order: 0,
    title: exportWarningMessages.xmlCharactersTitle,
    description: exportWarningMessages.xmlCharactersDescription,
  },
  'xml-illegal-characters-in-protocol': {
    order: 1,
    title: exportWarningMessages.protocolTextTitle,
    description: exportWarningMessages.protocolTextDescription,
  },
  'column-renamed': {
    order: 2,
    title: exportWarningMessages.columnRenamedTitle,
    description: exportWarningMessages.columnRenamedDescription,
  },
} as const satisfies Record<
  ExportWarningKind,
  { order: number; title: MessageDescriptor; description: MessageDescriptor }
>;

const PROTOCOL_TEXT_SELECTORS = {
  'protocol-name': 'protocolName',
  'node-type-name': 'nodeTypeName',
  'edge-type-name': 'edgeTypeName',
  'column-name': 'columnName',
} as const;

const formatWarningItem = (intl: IntlShape, warning: ExportWarning): string => {
  switch (warning.kind) {
    case 'xml-illegal-characters':
      // Falls back to the session ID for an interview with no case ID.
      return intl.formatMessage(exportWarningMessages.xmlCharactersInterview, {
        caseId: warning.caseId || warning.sessionId,
        variables: intl.formatList(
          [
            ...(warning.caseIdChanged
              ? [intl.formatMessage(exportWarningMessages.caseId)]
              : []),
            ...warning.variables,
          ],
          { type: 'conjunction' },
        ),
      });
    case 'xml-illegal-characters-in-protocol':
      return intl.formatMessage(exportWarningMessages.protocolTextItem, {
        text: PROTOCOL_TEXT_SELECTORS[warning.text],
        name: warning.name,
        characters: intl.formatList(warning.removed, { type: 'conjunction' }),
        protocolName: stripXmlIllegalCharacters(warning.protocolName),
      });
    case 'column-renamed':
      return intl.formatMessage(
        warning.column === warning.variable
          ? exportWarningMessages.columnRenamedItem
          : exportWarningMessages.columnRenamedFromVariableItem,
        {
          format: warning.format,
          protocolName: stripXmlIllegalCharacters(warning.protocolName),
          entity: warning.entity,
          entityTypeName: warning.entityTypeName ?? '',
          column: warning.column,
          variable: warning.variable,
          renamedTo: warning.renamedTo,
        },
      );
  }
};

/** The warnings of one kind, as a heading, an explanation, and a list. */
export type ExportWarningGroup = {
  readonly kind: ExportWarningKind;
  readonly title: string;
  readonly description: string;
  readonly items: readonly { readonly key: string; readonly text: string }[];
};

/**
 * Every warning an export gave, in one group per kind, in a fixed order. Each
 * item's `key` is stable for its warning, for use as a React key.
 */
export const formatExportWarnings = (
  intl: IntlShape,
  warnings: readonly ExportWarning[],
): ExportWarningGroup[] => {
  const byKind = new Map<ExportWarningKind, ExportWarning[]>();
  for (const warning of uniqueExportWarnings(warnings)) {
    byKind.set(warning.kind, [...(byKind.get(warning.kind) ?? []), warning]);
  }
  return [...byKind]
    .toSorted(([a], [b]) => groupMessages[a].order - groupMessages[b].order)
    .map(([kind, ofKind]) => ({
      kind,
      title: intl.formatMessage(groupMessages[kind].title),
      description: intl.formatMessage(groupMessages[kind].description),
      items: ofKind.map((warning) => ({
        key: exportWarningKey(warning),
        text: formatWarningItem(intl, warning),
      })),
    }));
};
