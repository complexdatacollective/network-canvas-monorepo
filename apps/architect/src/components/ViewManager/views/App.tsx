import { createElement, useEffect } from 'react';
import { useLocation } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useToast } from '@codaco/fresco-ui/Toast';
import { AppUpdateProvider } from '~/components/AppUpdate/AppUpdateProvider';
import BackgroundLights from '~/components/BackgroundLights';
import InstallBanner from '~/components/InstallBanner';
import { JsonPreviewOverlay } from '~/components/JsonPreviewOverlay';
import NestedDraftReclaimDialog from '~/components/NestedDraftReclaimDialog';
import ProtocolGuardedRouter from '~/components/ProtocolGuardedRouter';
import ProtocolLockBanner from '~/components/ProtocolLockBanner';
import { showProtocolOpenResultDialog } from '~/components/protocolOpenDialogs';
import ProtocolValidationDialogReporter from '~/components/ProtocolValidationDialogReporter';
import Routes from '~/components/Routes';
import ScrollToTop from '~/components/ScrollToTop';
import { useAppDispatch } from '~/ducks/hooks';
import { openLocalNetcanvas } from '~/ducks/modules/userActions/userActions';
import { useProtocolTabLock } from '~/hooks/useProtocolTabLock';
import { resetRunOnce } from '~/hooks/useRunOnce';
import {
  subscribeAutosaveFailures,
  takeAutosaveFailures,
} from '~/utils/autosaveFailureQueue';
import {
  subscribeLaunchFiles,
  subscribeLaunchReadFailures,
  takeLaunchFiles,
  takeLaunchReadFailures,
} from '~/utils/fileLaunchQueue';
import {
  subscribeProtocolUpgrades,
  takeProtocolUpgrades,
} from '~/utils/protocolUpgradeQueue';
import {
  subscribeStartupProtocolFailures,
  takeStartupProtocolFailures,
} from '~/utils/startupProtocolFailureQueue';
const messages = defineMessages({
  couldNotOpenFile: {
    id: 'architect.viewManager.views.app.couldNotOpenFile',
    defaultMessage: 'Could not open file',
    description: 'The title text in components / ViewManager / views / App.',
  },
  launchedCouldNotBeRead: {
    id: 'architect.viewManager.views.app.launchedCouldNotBeRead',
    defaultMessage:
      '{failedCount, plural, one {The launched file could not be read. It may have been moved, deleted, or become unavailable since it was opened.} other {# launched files could not be read. They may have been moved, deleted, or become unavailable since they were opened.}}',
    description:
      'The description text in components / ViewManager / views / App.',
  },
  oK: {
    id: 'architect.viewManager.views.app.oK',
    defaultMessage: 'OK',
    description: 'The label text in components / ViewManager / views / App.',
  },
  autosaveFailed: {
    id: 'architect.viewManager.views.app.autosaveFailed',
    defaultMessage: 'Autosave failed',
    description: 'The title text in components / ViewManager / views / App.',
  },
  protocolUpdated: {
    id: 'architect.viewManager.views.app.protocolUpdated',
    defaultMessage: 'Protocol updated',
    description: 'The title text in components / ViewManager / views / App.',
  },
  wasMadeWithAn: {
    id: 'architect.viewManager.views.app.wasMadeWithAn',
    defaultMessage:
      '"{name}" was made with an older version of Architect. It has been updated to open here, and the copy in your library has been replaced.',
    description:
      'The description text in components / ViewManager / views / App.',
  },
});
const finalMessages = defineMessages({
  storageFailure: {
    id: 'architect.app.storageFailure',
    defaultMessage:
      'Your recent changes could not be saved to this device, which can happen if local storage is full or unavailable. To avoid losing work, download a copy of your protocol.',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

const FileLaunchFailureReporter = () => {
  const { openDialog } = useDialog();

  useEffect(() => {
    const reportFailures = () => {
      const failures = takeLaunchReadFailures();
      for (const failedCount of failures) {
        void openDialog({
          type: 'acknowledge',
          intent: 'destructive',
          title: createElement(AppMessage, {
            message: messages.couldNotOpenFile,
          }),
          description: createElement(AppMessage, {
            message: messages.launchedCouldNotBeRead,
            values: {
              failedCount: failedCount,
            },
          }),
          actions: {
            primary: {
              label: createElement(AppMessage, { message: messages.oK }),
              value: true,
            },
          },
        });
      }
    };

    reportFailures();
    return subscribeLaunchReadFailures(reportFailures);
  }, [openDialog]);

  return null;
};

const AutosaveFailureReporter = () => {
  const { openDialog } = useDialog();

  useEffect(() => {
    const reportFailures = () => {
      const failureCount = takeAutosaveFailures();
      if (failureCount === 0) return;
      void openDialog({
        type: 'acknowledge',
        intent: 'destructive',
        title: createElement(AppMessage, { message: messages.autosaveFailed }),
        description: createElement(AppMessage, {
          message: finalMessages.storageFailure,
        }),
        actions: {
          primary: {
            label: createElement(AppMessage, { message: messages.oK }),
            value: true,
          },
        },
      });
    };

    reportFailures();
    return subscribeAutosaveFailures(reportFailures);
  }, [openDialog]);

  return null;
};

const StartupProtocolFailureReporter = () => {
  const { openDialog } = useDialog();

  useEffect(() => {
    const reportFailures = () => {
      for (const refusal of takeStartupProtocolFailures()) {
        void showProtocolOpenResultDialog({
          result: refusal,
          openDialog,
        });
      }
    };

    reportFailures();
    return subscribeStartupProtocolFailures(reportFailures);
  }, [openDialog]);

  return null;
};

/**
 * Announces a protocol that was brought up to date while being opened.
 *
 * A toast, not a dialog: nothing went wrong and there is nothing to decide —
 * the protocol opened, and this only explains why the copy in the library is
 * no longer byte-identical to the one the researcher last saved. The other
 * reporters here interrupt because they describe work that did NOT happen.
 */
const ProtocolUpgradeToaster = () => {
  const { toast } = useToast();

  useEffect(() => {
    const announceUpgrades = () => {
      for (const { name } of takeProtocolUpgrades()) {
        toast({
          variant: 'info',
          title: <AppMessage message={messages.protocolUpdated} />,
          description: (
            <AppMessage message={messages.wasMadeWithAn} values={{ name }} />
          ),
        });
      }
    };

    announceUpgrades();
    return subscribeProtocolUpgrades(announceUpgrades);
  }, [toast]);

  return null;
};

const LaunchedProtocolOpener = () => {
  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();

  useEffect(() => {
    const openLaunchedProtocols = () => {
      const [file] = takeLaunchFiles();
      if (!file) return;

      const open = async (migrationApproved = false): Promise<void> => {
        const result = await dispatch(
          openLocalNetcanvas({ file, migrationApproved }),
        ).unwrap();
        await showProtocolOpenResultDialog({
          result,
          openDialog,
          onApproveMigration: migrationApproved ? undefined : () => open(true),
        });
      };
      void open();
    };

    openLaunchedProtocols();
    return subscribeLaunchFiles(openLaunchedProtocols);
  }, [dispatch, openDialog]);

  return null;
};

const AppContents = () => {
  const [location] = useLocation();

  // Hold the cross-tab single-editor lock while this tab is in the protocol
  // editor, releasing it on the start screen.
  useProtocolTabLock();

  // Returning to the start screen ends the current protocol session, so the
  // next /protocol visit gets a fresh entrance animation.
  useEffect(() => {
    if (location === '/') resetRunOnce();
  }, [location]);

  const lightsIntensity =
    location === '/'
      ? 'bold'
      : location.startsWith('/protocol/stage/')
        ? 'dim'
        : 'medium';

  return (
    <>
      <BackgroundLights intensity={lightsIntensity} />
      <FileLaunchFailureReporter />
      <AutosaveFailureReporter />
      <StartupProtocolFailureReporter />
      <ProtocolUpgradeToaster />
      <LaunchedProtocolOpener />
      <ProtocolValidationDialogReporter />
      {/* Mounted app-wide, not inside the stage editor: a nested editor can be
          open over the Codebook or Resources just as easily, and that is
          precisely the case the stage editor's own conflict dialog cannot
          answer. */}
      <NestedDraftReclaimDialog />
      <ScrollToTop />
      {/* Viewport-tall column so the install banner reserves space in normal
          flow (rather than a fixed overlay that covered the sticky nav): the
          banner is a shrink-0 strip at the top and each route fills the rest. */}
      <div className="flex h-dvh flex-col">
        {/* The install banner urges installation when running in a browser tab;
            it self-hides (rendering nothing) when installed or dismissed. */}
        <InstallBanner />
        {/* Sits directly beneath the install banner (both are shrink-0 strips);
            self-hides unless the open protocol is also open in another tab. */}
        <ProtocolLockBanner />
        <div className="min-h-0 flex-1">
          <Routes />
        </div>
      </div>
      <JsonPreviewOverlay />
    </>
  );
};

const AppView = () => (
  <ProtocolGuardedRouter>
    <AppUpdateProvider>
      <AppContents />
    </AppUpdateProvider>
  </ProtocolGuardedRouter>
);

export default AppView;
