import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';

import type { ExportEvent } from './events';
import type { ExportWarning } from './output';

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

export const exportWarningMessages = defineMessages({
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
});

/**
 * One line per interview that lost characters in its GraphML file, naming the
 * interview and everything in it that changed. Falls back to the session ID
 * for an interview with no case ID.
 */
export const formatXmlCharacterWarnings = (
  intl: IntlShape,
  warnings: readonly ExportWarning[],
): string[] =>
  warnings.map((warning) =>
    intl.formatMessage(exportWarningMessages.xmlCharactersInterview, {
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
    }),
  );
