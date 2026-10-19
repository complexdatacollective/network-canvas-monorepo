import { createElement, useCallback, useMemo, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useToast } from '@codaco/fresco-ui/Toast';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import {
  chooseImportRoute,
  confirmProtocolUpgrade,
  showHandoffFailed,
  showLegacyProtocolInfo,
} from '~/components/legacyProtocolDialogs';
import type { LegacyCardActions } from '~/components/ProtocolCarousel/DeckSlotCard';
import { useSettleLockForInterviewer8 } from '~/components/useSettleLockForInterviewer8';
import { useAnalytics } from '~/lib/analytics/AnalyticsProvider';
import type { LegacyProtocolSummary } from '~/lib/db/legacyLibrary';
import {
  getBundledLegacyInterviewer,
  goToLegacyInterviewer,
  LEGACY_INTERVIEWER_MAJOR,
  legacyDataUrl,
  legacyStartUrl,
} from '~/lib/legacyInterviewer';
import { importFailureMessages } from '~/lib/protocol/importProtocol';
import { keepOnInterviewer8 } from '~/lib/protocol/importRouting';
import {
  type LegacyUpgradeFailureReason,
  upgradeLegacyProtocol,
} from '~/lib/protocol/upgradeLegacyProtocol';
import type {
  ImportRequest,
  MigrationChoiceRequest,
} from '~/lib/protocol/useProtocolImport';
import { useLegacyInterviewerOffline } from '~/lib/pwa/legacyInterviewerOffline';

const messages = defineMessages({
  upgradedTitle: {
    id: 'interviewer.legacyProtocolActions.upgradedTitle',
    defaultMessage: 'Upgraded copy created',
    description:
      'Title of the notification shown after a researcher upgraded an older protocol: a new copy of it at the current schema version was made in this version of Interviewer.',
  },
  upgradedDescription: {
    id: 'interviewer.legacyProtocolActions.upgradedDescription',
    defaultMessage: '{name} is ready to use with schema {version}.',
    description:
      'Notification text after an older protocol was upgraded. {name} is the researcher-authored protocol name; {version} is the current schema version number (for example 9).',
  },
  alreadyUpgradedTitle: {
    id: 'interviewer.legacyProtocolActions.alreadyUpgradedTitle',
    defaultMessage: 'Already upgraded',
    description:
      'Title of the notification shown when a researcher asks to upgrade an older protocol that already has an upgraded copy in this version of Interviewer; no new copy is made.',
  },
  alreadyUpgradedDescription: {
    id: 'interviewer.legacyProtocolActions.alreadyUpgradedDescription',
    defaultMessage:
      'This protocol was upgraded before, so the copy made then is shown.',
    description:
      'Notification text when an older protocol already had an upgraded copy: the app brings that existing copy into view instead of making another.',
  },
  upgradeFailedTitle: {
    id: 'interviewer.legacyProtocolActions.upgradeFailedTitle',
    defaultMessage: 'Could not upgrade',
    description:
      'Title of the error notification shown when upgrading an older protocol failed. Nothing was changed.',
  },
  couldNotRead: {
    id: 'interviewer.legacyProtocolActions.couldNotRead',
    defaultMessage:
      'This protocol could not be read from Interviewer {version}. Please try again.',
    description:
      'Error text when an older protocol could not be read from the previous version of Interviewer, which stores it, so it could not be upgraded. {version} is that version’s number (for example 8).',
  },
  noLongerThere: {
    id: 'interviewer.legacyProtocolActions.noLongerThere',
    defaultMessage: 'This protocol is no longer in Interviewer {version}.',
    description:
      'Error text when an older protocol could not be upgraded because it has been deleted from the previous version of Interviewer in the meantime. {version} is that version’s number (for example 8).',
  },
});

const failureMessage = (reason: LegacyUpgradeFailureReason) => {
  switch (reason) {
    case 'read-failed':
      return messages.couldNotRead;
    case 'migration-failed':
    case 'validation-failed':
      return importFailureMessages.cannotUpgrade;
    case 'save-failed':
      return importFailureMessages.cannotSave;
  }
};

type UseLegacyProtocolActionsOptions = {
  /** Refresh Home's data after an upgrade. */
  reload: () => Promise<void>;
  /** The normal import; the choice dialog uses it to upgrade a file. */
  startImport: (request: ImportRequest) => void;
};

// What Home does with Interviewer 8's protocols and with protocol files made
// for an older schema: start or open them in Interviewer 8, upgrade them (an
// explicit choice, always confirmed with the migration's notes), show their
// details, and the choice an older file gets when it is imported.
export function useLegacyProtocolActions({
  reload,
  startImport,
}: UseLegacyProtocolActionsOptions) {
  const { openDialog } = useDialog();
  const toast = useToast();
  const analytics = useAnalytics();
  // Read once: the define is an object literal, new on every read.
  const [interviewer] = useState(getBundledLegacyInterviewer);
  const offline = useLegacyInterviewerOffline();
  const { settled, settleLock } = useSettleLockForInterviewer8();
  const [focusRequest, setFocusRequest] = useState<{
    protocolHash: string;
  } | null>(null);
  // One upgrade at a time: a second press while one runs would only race it
  // to the same copy.
  const upgrading = useRef(false);

  // Interviewer 8 cannot set the shared lock up, so it is settled here first.
  const onStart = useCallback(
    async (protocol: LegacyProtocolSummary) => {
      if (!interviewer || !(await settleLock())) return;
      goToLegacyInterviewer(legacyStartUrl(interviewer, protocol.hash));
    },
    [interviewer, settleLock],
  );

  const onOpenInInterviewer = useCallback(async () => {
    if (!interviewer || !(await settleLock())) return;
    goToLegacyInterviewer(interviewer.path);
  }, [interviewer, settleLock]);

  const openLegacyData = useCallback(async () => {
    if (!interviewer || !(await settleLock())) return;
    goToLegacyInterviewer(legacyDataUrl(interviewer));
  }, [interviewer, settleLock]);
  // Null without an Interviewer 8 to open, so nothing offers it.
  const onOpenLegacyData = useMemo(
    () => (interviewer ? () => void openLegacyData() : null),
    [interviewer, openLegacyData],
  );

  const onShowInfo = useCallback(
    (protocol: LegacyProtocolSummary) => {
      void showLegacyProtocolInfo(openDialog, protocol);
    },
    [openDialog],
  );

  const onUpgrade = useCallback(
    async (protocol: LegacyProtocolSummary) => {
      if (upgrading.current) return;
      const confirmed = await confirmProtocolUpgrade(openDialog, {
        fromVersion: protocol.schemaVersion,
        source: 'legacy-library',
      });
      if (!confirmed) return;
      upgrading.current = true;
      try {
        const result = await upgradeLegacyProtocol(protocol.hash);
        if (result.status === 'upgraded' || result.status === 'existing') {
          // Level 1 only: that an upgrade happened, between which schemas.
          analytics.track('legacy_protocol_upgraded', {
            from_schema: protocol.schemaVersion,
            to_schema: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
            existing: result.status === 'existing',
          });
          await reload();
          setFocusRequest({ protocolHash: result.hash });
          toast.add(
            result.status === 'upgraded'
              ? {
                  title: createElement(AppMessage, {
                    message: messages.upgradedTitle,
                  }),
                  description: createElement(AppMessage, {
                    message: messages.upgradedDescription,
                    values: {
                      name: result.protocol.name,
                      version: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
                    },
                  }),
                  variant: 'success',
                }
              : {
                  title: createElement(AppMessage, {
                    message: messages.alreadyUpgradedTitle,
                  }),
                  description: createElement(AppMessage, {
                    message: messages.alreadyUpgradedDescription,
                  }),
                  variant: 'info',
                },
          );
          return;
        }
        const reason =
          result.status === 'not-found' ? 'not-found' : result.reason;
        analytics.track('legacy_protocol_upgrade_failed', { reason });
        if (result.status === 'failed' && result.cause !== undefined) {
          analytics.captureException(result.cause, {
            feature: 'legacy-protocol-upgrade',
          });
        }
        if (result.status === 'not-found') await reload();
        toast.add({
          title: createElement(AppMessage, {
            message: messages.upgradeFailedTitle,
          }),
          description: createElement(AppMessage, {
            message:
              result.status === 'not-found'
                ? messages.noLongerThere
                : failureMessage(result.reason),
            values: { version: LEGACY_INTERVIEWER_MAJOR },
          }),
          variant: 'destructive',
        });
      } finally {
        upgrading.current = false;
      }
    },
    [analytics, openDialog, reload, toast],
  );

  // A file below this app's schema, from the picker, a drop, the OS or
  // Interviewer 8 (`/?import=`), that the import refused to migrate on its own.
  const onMigrationRequired = useCallback(
    (request: MigrationChoiceRequest) => {
      void (async () => {
        const upgradeFile = async () => {
          const confirmed = await confirmProtocolUpgrade(openDialog, {
            fromVersion: request.schemaVersion,
            source: 'file',
          });
          if (!confirmed) return;
          startImport({
            source: 'file',
            file: request.file,
            label: request.label,
            allowMigration: true,
          });
        };

        // Without Interviewer 8 there is no keeping it as it is: the choice
        // is only whether to upgrade.
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
          // Before staging: a file staged for an Interviewer 8 that sends the
          // researcher straight back would be lost.
          if (!(await settleLock())) return;
          analytics.track('protocol_kept_on_legacy', {
            schema_version: request.schemaVersion,
          });
          const kept = await keepOnInterviewer8(request.file, interviewer);
          if (!kept.ok) {
            analytics.captureException(kept.error, {
              feature: 'legacy-protocol-handoff',
            });
            await showHandoffFailed(openDialog);
          }
        }
      })();
    },
    [analytics, interviewer, openDialog, settleLock, startImport],
  );

  const legacy = useMemo<LegacyCardActions>(
    () => ({
      interviewer,
      offline,
      // A plain link cannot settle the lock first, so there is none until a
      // lock is in place; the count then shows as text.
      sessionsHref: interviewer && settled ? legacyDataUrl(interviewer) : null,
      onStart: (protocol) => void onStart(protocol),
      onOpenInInterviewer: () => void onOpenInInterviewer(),
      onUpgrade: (protocol) => void onUpgrade(protocol),
      onShowInfo,
    }),
    [
      interviewer,
      offline,
      settled,
      onStart,
      onOpenInInterviewer,
      onUpgrade,
      onShowInfo,
    ],
  );

  return { legacy, focusRequest, onMigrationRequired, onOpenLegacyData };
}
