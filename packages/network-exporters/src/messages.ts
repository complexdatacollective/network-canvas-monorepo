import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';

import type { ExportEvent } from './events';

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
