import { ArrowLeftToLine, Check, Download, Save } from 'lucide-react';
import {
  createElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useLocation } from 'wouter';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import {
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from '@codaco/fresco-ui/SegmentedToolbar';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { getActiveProtocolId } from '~/ducks/modules/app';
import { useProtocolUndoRedo } from '~/hooks/useProtocolUndoRedo';
import { useSingleFlight } from '~/hooks/useSingleFlight';
import { getCanonicalProtocol } from '~/selectors/protocol';
import type { ProtocolSourceRef } from '~/templates';
import {
  isProtocolSourceAuthoringEnabled,
  saveProtocolSource,
} from '~/templates/source-authoring';
import { downloadActiveProtocol } from '~/utils/downloadActiveProtocol';
import { getStoredProtocol } from '~/utils/protocolLibrary';
import { reportError } from '~/utils/reportError';

import { ProtocolFailureDetails } from '../protocolOpenDialogs';
import { useActionToolbar } from './ActionToolbar';
import { HistoryToolbarControls } from './historyToolbarItems';
const chromeMessages = defineMessages({
  returnToStages: {
    id: 'architect.chrome.projectNav.projectActions.returnToStages',
    defaultMessage: 'Return to Stages',
    description:
      'Researcher-facing explanatory text in components / ProjectNav / ProjectActions.',
  },
  returnToStartScreen: {
    id: 'architect.chrome.projectNav.projectActions.returnToStartScreen',
    defaultMessage: 'Return to Start Screen',
    description:
      'Researcher-facing explanatory text in components / ProjectNav / ProjectActions.',
  },
});
const messages = defineMessages({
  saveProtocolSource: {
    id: 'architect.projectNav.projectActions.saveProtocolSource',
    defaultMessage: 'Save protocol source?',
    description: 'The title text in components / ProjectNav / ProjectActions.',
  },
  willOverwriteTheCanonical: {
    id: 'architect.projectNav.projectActions.willOverwriteTheCanonical',
    defaultMessage:
      '"{value1}" will overwrite the canonical protocol source files in this repository.',
    description:
      'The description text in components / ProjectNav / ProjectActions.',
  },
  saveToSource: {
    id: 'architect.projectNav.projectActions.saveToSource',
    defaultMessage: 'Save to source',
    description: 'The label text in components / ProjectNav / ProjectActions.',
  },
  sourceSaveFailed: {
    id: 'architect.projectNav.projectActions.sourceSaveFailed',
    defaultMessage: 'Source save failed',
    description: 'The title text in components / ProjectNav / ProjectActions.',
  },
  couldNotBeSaved: {
    id: 'architect.projectNav.projectActions.couldNotBeSaved',
    defaultMessage:
      '"{protocolName}" could not be saved to source. Check the source files and your write permissions, then try again.',
    description:
      'The description text in components / ProjectNav / ProjectActions.',
  },
  oK: {
    id: 'architect.projectNav.projectActions.oK',
    defaultMessage: 'OK',
    description: 'The label text in components / ProjectNav / ProjectActions.',
  },
  protocolSourceSaved: {
    id: 'architect.projectNav.projectActions.protocolSourceSaved',
    defaultMessage: 'Protocol source saved',
    description: 'The title text in components / ProjectNav / ProjectActions.',
  },
  wasSavedTo: {
    id: 'architect.projectNav.projectActions.wasSavedTo',
    defaultMessage:
      '"{protocolName}" was saved to {path}. {writtenCount, plural, one {# asset was written} other {# assets were written}} and {removedCount, plural, one {# stale asset was removed} other {# stale assets were removed}}.',
    description:
      'The description text in components / ProjectNav / ProjectActions.',
  },
  navigationActions: {
    id: 'architect.projectNav.projectActions.navigationActions',
    defaultMessage: 'Navigation actions',
    description:
      'The aria-label text in components / ProjectNav / ProjectActions.',
  },
  additionalActions: {
    id: 'architect.projectNav.projectActions.additionalActions',
    defaultMessage: 'Additional actions',
    description:
      'The aria-label text in components / ProjectNav / ProjectActions.',
  },
  downloadActions: {
    id: 'architect.projectNav.projectActions.downloadActions',
    defaultMessage: 'Download actions',
    description:
      'The aria-label text in components / ProjectNav / ProjectActions.',
  },
  downloaded: {
    id: 'architect.projectNav.projectActions.downloaded',
    defaultMessage: 'Downloaded',
    description: 'Visible text in components / ProjectNav / ProjectActions.',
  },
  downloading: {
    id: 'architect.projectNav.projectActions.downloading',
    defaultMessage: 'Downloading...',
    description: 'Visible text in components / ProjectNav / ProjectActions.',
  },
  download: {
    id: 'architect.projectNav.projectActions.download',
    defaultMessage: 'Download',
    description: 'Visible text in components / ProjectNav / ProjectActions.',
  },
  sourceActions: {
    id: 'architect.projectNav.projectActions.sourceActions',
    defaultMessage: 'Source actions',
    description:
      'The aria-label text in components / ProjectNav / ProjectActions.',
  },
  saved: {
    id: 'architect.projectNav.projectActions.saved',
    defaultMessage: 'Saved',
    description: 'Visible text in components / ProjectNav / ProjectActions.',
  },
  saving: {
    id: 'architect.projectNav.projectActions.saving',
    defaultMessage: 'Saving...',
    description: 'Visible text in components / ProjectNav / ProjectActions.',
  },
});

/**
 * What this page is doing with the protocol, which decides which actions are
 * honest to offer. There are two unrelated reasons a page can be read-only, and
 * they call for opposite answers on history recovery — so they are named
 * separately rather than sharing one `readOnly` flag that the next change would
 * conflate again.
 *
 * - `authoring`: the ordinary editor pages. Everything is offered.
 * - `report`: the page presents the protocol rather than authoring it (the
 *   Summary report). Save-to-source is hidden — it overwrites the canonical
 *   protocol source files and exists only in source-authoring dev builds — but
 *   undo and redo stay: this tab still owns the saved copy, so history recovery
 *   reaches disk exactly as it does anywhere else (#1389).
 * - `locked`: another tab owns the saved copy, so autosave is refused and the
 *   library write behind any change here is dropped. Undo and redo go too: they
 *   mutate the protocol, so offering them would rewind what is on screen and
 *   never reach disk. Only actions that read the protocol are left.
 */
export type ProjectActionsMode = 'authoring' | 'report' | 'locked';

type ProjectActionsProps = {
  additionalActions?: ReactNode;
  mode?: ProjectActionsMode;
};

const ProjectActions = ({
  additionalActions,
  mode = 'authoring',
}: ProjectActionsProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const activeProtocolId = useAppSelector(getActiveProtocolId);
  const protocol = useAppSelector(getCanonicalProtocol);
  const { openDialog } = useDialog();
  const {
    canUndo,
    canRedo,
    undo: scopedUndo,
    redo: scopedRedo,
  } = useProtocolUndoRedo();
  const [location, setLocation] = useLocation();
  const returnsToTimeline = [
    '/protocol/assets',
    '/protocol/codebook',
    '/protocol/summary',
  ].includes(location);
  const returnDestination = returnsToTimeline ? '/protocol' : '/';
  const returnLabel = returnsToTimeline
    ? intl.formatMessage(chromeMessages.returnToStages)
    : intl.formatMessage(chromeMessages.returnToStartScreen);
  const handleReturn = useCallback(
    () => setLocation(returnDestination),
    [returnDestination, setLocation],
  );

  const [isExporting, setIsExporting] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [sourceRef, setSourceRef] = useState<ProtocolSourceRef | null>(null);
  const [isSavingSource, setIsSavingSource] = useState(false);
  const [sourceSaveSuccess, setSourceSaveSuccess] = useState(false);

  const handleUndo = useCallback(() => scopedUndo(), [scopedUndo]);
  const handleRedo = useCallback(() => scopedRedo(), [scopedRedo]);

  /*
    Both of these run once at a time because `useSingleFlight` says so, not
    because their button is disabled while they run. `disabled` is a rendering
    of state the second click in a tick has not seen yet, it covers only the
    one control, and each call's own `finally` would clear it while the other
    was still going. Save-to-source overwrites the canonical protocol source
    files in the repository; a download builds and writes a file. Neither is
    something to run twice by accident.
  */
  const runDownload = useCallback(async () => {
    setIsExporting(true);
    try {
      const downloaded = await downloadActiveProtocol(dispatch, openDialog);
      if (!downloaded) return;
      setDownloadSuccess(true);
    } finally {
      setIsExporting(false);
    }
  }, [dispatch, openDialog]);
  const handleDownload = useSingleFlight(runDownload);

  const runSaveSource = useCallback(async () => {
    if (!activeProtocolId || !sourceRef || !protocol) {
      return;
    }

    const confirmed = await openDialog({
      type: 'choice',
      intent: 'warning',
      title: createElement(AppMessage, {
        message: messages.saveProtocolSource,
      }),
      description: createElement(AppMessage, {
        message: messages.willOverwriteTheCanonical,
        values: {
          value1: protocol.name,
        },
      }),
      actions: {
        primary: {
          label: createElement(AppMessage, { message: messages.saveToSource }),
          value: true,
        },
        cancel: {
          label: createElement(AppMessage, { message: commonMessages.cancel }),
          value: false,
        },
      },
    });

    if (confirmed !== true) {
      return;
    }

    try {
      setIsSavingSource(true);
      const result = await saveProtocolSource({
        sourceRef,
        protocol,
        protocolId: activeProtocolId,
      });

      if (!result.ok) {
        const detail = [result.error, ...(result.issues ?? [])]
          .filter(Boolean)
          .join('\n');
        void openDialog({
          type: 'acknowledge',
          intent: 'destructive',
          title: createElement(AppMessage, {
            message: messages.sourceSaveFailed,
          }),
          description: (
            <AppMessage
              message={messages.couldNotBeSaved}
              values={{ protocolName: protocol.name }}
            />
          ),
          children: <ProtocolFailureDetails detail={detail} />,
          actions: {
            primary: {
              label: createElement(AppMessage, { message: messages.oK }),
              value: true,
            },
          },
        });
        return;
      }

      setSourceSaveSuccess(true);
      void openDialog({
        type: 'acknowledge',
        intent: 'success',
        title: createElement(AppMessage, {
          message: messages.protocolSourceSaved,
        }),
        description: createElement(AppMessage, {
          message: messages.wasSavedTo,
          values: {
            protocolName: protocol.name,
            path: result.writtenProtocolPath,
            writtenCount: result.writtenAssets.length,
            removedCount: result.removedAssets.length,
          },
        }),
        actions: {
          primary: {
            label: createElement(AppMessage, { message: messages.oK }),
            value: true,
          },
        },
      });
    } catch (error) {
      const { message } = reportError(error);
      void openDialog({
        type: 'acknowledge',
        intent: 'destructive',
        title: createElement(AppMessage, {
          message: messages.sourceSaveFailed,
        }),
        description: (
          <AppMessage
            message={messages.couldNotBeSaved}
            values={{ protocolName: protocol.name }}
          />
        ),
        children: <ProtocolFailureDetails detail={message} />,
        actions: {
          primary: {
            label: createElement(AppMessage, { message: messages.oK }),
            value: true,
          },
        },
      });
    } finally {
      setIsSavingSource(false);
    }
  }, [activeProtocolId, openDialog, protocol, sourceRef]);
  const handleSaveSource = useSingleFlight(runSaveSource);

  useEffect(() => {
    let cancelled = false;

    setSourceRef(null);
    if (!isProtocolSourceAuthoringEnabled || !activeProtocolId) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const row = await getStoredProtocol(activeProtocolId);
        if (!cancelled) {
          setSourceRef(row?.sourceRef ?? null);
        }
      } catch (error) {
        reportError(error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeProtocolId]);

  useEffect(() => {
    if (!downloadSuccess) return undefined;
    const timer = setTimeout(() => setDownloadSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [downloadSuccess]);

  useEffect(() => {
    if (!sourceSaveSuccess) return undefined;
    const timer = setTimeout(() => setSourceSaveSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [sourceSaveSuccess]);

  const canSaveToSource =
    mode === 'authoring' &&
    isProtocolSourceAuthoringEnabled &&
    activeProtocolId !== null &&
    protocol !== null &&
    sourceRef !== null;

  // A history operation is a protocol mutation, so it belongs to the tab that
  // owns the saved copy — and only to it. See `ProjectActionsMode`.
  const canRecoverHistory = mode !== 'locked';
  const showHistoryActions = canRecoverHistory && (canUndo || canRedo);

  const toolbarProps = useMemo(
    () => ({
      leadingActions: showHistoryActions ? (
        <HistoryToolbarControls
          key="history-controls"
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
        />
      ) : undefined,
      children: [
        <ToolbarGroup
          key="project-navigation"
          aria-label={intl.formatMessage(messages.navigationActions)}
        >
          <ToolbarButton icon={<ArrowLeftToLine />} onClick={handleReturn}>
            {returnLabel}
          </ToolbarButton>
        </ToolbarGroup>,
        <ToolbarSeparator key="project-navigation-separator" />,
        additionalActions ? (
          <ToolbarGroup
            key="additional"
            aria-label={intl.formatMessage(messages.additionalActions)}
          >
            {additionalActions}
          </ToolbarGroup>
        ) : null,
        additionalActions ? (
          <ToolbarSeparator key="additional-separator" />
        ) : null,
        <ToolbarGroup
          key="download"
          aria-label={intl.formatMessage(messages.downloadActions)}
        >
          <ToolbarButton
            icon={downloadSuccess ? <Check /> : <Download />}
            variant="default"
            className="bg-sea-green text-white"
            disabled={isExporting}
            onClick={handleDownload}
          >
            {downloadSuccess
              ? intl.formatMessage(messages.downloaded)
              : isExporting
                ? intl.formatMessage(messages.downloading)
                : intl.formatMessage(messages.download)}
          </ToolbarButton>
        </ToolbarGroup>,
        canSaveToSource ? <ToolbarSeparator key="source-separator" /> : null,
        canSaveToSource ? (
          <ToolbarGroup
            key="source"
            aria-label={intl.formatMessage(messages.sourceActions)}
          >
            <ToolbarButton
              icon={sourceSaveSuccess ? <Check /> : <Save />}
              disabled={isSavingSource}
              onClick={handleSaveSource}
            >
              {sourceSaveSuccess
                ? intl.formatMessage(messages.saved)
                : isSavingSource
                  ? intl.formatMessage(messages.saving)
                  : intl.formatMessage(messages.saveToSource)}
            </ToolbarButton>
          </ToolbarGroup>
        ) : null,
      ],
    }),
    [
      additionalActions,
      canRedo,
      canSaveToSource,
      canUndo,
      downloadSuccess,
      handleDownload,
      handleRedo,
      handleReturn,
      handleSaveSource,
      handleUndo,
      isExporting,
      isSavingSource,
      returnLabel,
      showHistoryActions,
      sourceSaveSuccess,
      intl,
    ],
  );

  useActionToolbar(toolbarProps);

  return null;
};

export default ProjectActions;
