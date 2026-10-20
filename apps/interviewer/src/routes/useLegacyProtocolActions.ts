import { useCallback, useMemo, useState } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import {
  chooseImportRoute,
  confirmProtocolUpgrade,
  showLegacyProtocolInfo,
} from '~/components/legacyProtocolDialogs';
import type { Schema8CardActions } from '~/components/ProtocolCarousel/DeckSlotCard';
import { useAnalytics } from '~/lib/analytics/AnalyticsProvider';
import type { ProtocolWithCounts } from '~/lib/db/types';
import { getBundledLegacyInterviewer } from '~/lib/legacyInterviewer';
import type {
  ImportRequest,
  MigrationChoiceRequest,
} from '~/lib/protocol/useProtocolImport';
import { useLegacyInterviewerOffline } from '~/lib/pwa/legacyInterviewerOffline';

type UseLegacyProtocolActionsOptions = {
  /** The normal import; the choice dialog uses it to keep or upgrade a file. */
  startImport: (request: ImportRequest) => void;
};

// What Home does with schema 8 protocols beyond what it does with any
// protocol, and with protocol files made for an older schema: show a stored
// one's details, and the choice an older file gets when it is imported (keep
// it on schema 8, or upgrade it, always confirmed with the migration's notes).
// A stored schema 8 protocol is never upgraded in place or copied: upgrading
// is offered only as a file is imported, as in Fresco. Starting, resuming and
// deleting are the same as for any protocol.
export function useLegacyProtocolActions({
  startImport,
}: UseLegacyProtocolActionsOptions) {
  const { openDialog } = useDialog();
  const analytics = useAnalytics();
  // Read once: the define is an object literal, new on every read.
  const [interviewer] = useState(getBundledLegacyInterviewer);
  const offline = useLegacyInterviewerOffline();

  const onShowInfo = useCallback(
    (protocol: ProtocolWithCounts) => {
      void showLegacyProtocolInfo(openDialog, protocol);
    },
    [openDialog],
  );

  // A file below this app's schema, from the picker, a drop or the OS, that
  // the import refused to take without the researcher's choice.
  const onMigrationRequired = useCallback(
    (request: MigrationChoiceRequest) => {
      void (async () => {
        const importAs = (olderSchema: ImportRequest['olderSchema']) =>
          startImport({
            source: 'file',
            file: request.file,
            label: request.label,
            olderSchema,
          });
        const upgradeFile = async () => {
          const confirmed = await confirmProtocolUpgrade(openDialog, {
            fromVersion: request.schemaVersion,
            legacyInterviewerBundled: interviewer !== null,
          });
          if (confirmed) importAs('upgrade');
        };

        // Without Interviewer 8 a schema 8 protocol runs no interview here:
        // the choice is only whether to upgrade.
        if (!interviewer) {
          await upgradeFile();
          return;
        }
        const choice = await chooseImportRoute(openDialog, {
          schemaVersion: request.schemaVersion,
        });
        if (choice === 'upgrade') {
          await upgradeFile();
        } else if (choice === 'keep') {
          analytics.track('protocol_kept_on_legacy', {
            schema_version: request.schemaVersion,
          });
          importAs('keep');
        }
      })();
    },
    [analytics, interviewer, openDialog, startImport],
  );

  const schema8 = useMemo<Schema8CardActions>(
    () => ({
      interviewer,
      offline,
      onShowInfo,
    }),
    [interviewer, offline, onShowInfo],
  );

  return { schema8, onMigrationRequired };
}
