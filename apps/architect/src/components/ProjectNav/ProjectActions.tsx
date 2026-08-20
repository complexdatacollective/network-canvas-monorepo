import { ArrowLeftToLine, Check, Download, Save } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useLocation } from 'wouter';

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

import { useActionToolbar } from './ActionToolbar';
import { HistoryToolbarControls } from './historyToolbarItems';

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
    ? 'Return to Stages'
    : 'Return to Start Screen';
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
      title: 'Save protocol source?',
      description: `"${protocol.name}" will overwrite the canonical protocol source files in this repository.`,
      actions: {
        primary: { label: 'Save to source', value: true },
        cancel: { label: 'Cancel', value: false },
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
          title: 'Source save failed',
          description: `"${protocol.name}" could not be saved to source. ${detail}`,
          actions: { primary: { label: 'OK', value: true } },
        });
        return;
      }

      setSourceSaveSuccess(true);
      void openDialog({
        type: 'acknowledge',
        intent: 'success',
        title: 'Protocol source saved',
        description: `"${protocol.name}" was saved to ${result.writtenProtocolPath}. ${result.writtenAssets.length} assets were written and ${result.removedAssets.length} stale assets were removed.`,
        actions: { primary: { label: 'OK', value: true } },
      });
    } catch (error) {
      const { message } = reportError(error);
      void openDialog({
        type: 'acknowledge',
        intent: 'destructive',
        title: 'Source save failed',
        description: `"${protocol.name}" could not be saved to source. ${message}`,
        actions: { primary: { label: 'OK', value: true } },
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
        <ToolbarGroup key="project-navigation" aria-label="Navigation actions">
          <ToolbarButton icon={<ArrowLeftToLine />} onClick={handleReturn}>
            {returnLabel}
          </ToolbarButton>
        </ToolbarGroup>,
        <ToolbarSeparator key="project-navigation-separator" />,
        additionalActions ? (
          <ToolbarGroup key="additional" aria-label="Additional actions">
            {additionalActions}
          </ToolbarGroup>
        ) : null,
        additionalActions ? (
          <ToolbarSeparator key="additional-separator" />
        ) : null,
        <ToolbarGroup key="download" aria-label="Download actions">
          <ToolbarButton
            icon={downloadSuccess ? <Check /> : <Download />}
            variant="default"
            className="bg-sea-green text-white"
            disabled={isExporting}
            onClick={handleDownload}
          >
            {downloadSuccess
              ? 'Downloaded'
              : isExporting
                ? 'Downloading...'
                : 'Download'}
          </ToolbarButton>
        </ToolbarGroup>,
        canSaveToSource ? <ToolbarSeparator key="source-separator" /> : null,
        canSaveToSource ? (
          <ToolbarGroup key="source" aria-label="Source actions">
            <ToolbarButton
              icon={sourceSaveSuccess ? <Check /> : <Save />}
              disabled={isSavingSource}
              onClick={handleSaveSource}
            >
              {sourceSaveSuccess
                ? 'Saved'
                : isSavingSource
                  ? 'Saving...'
                  : 'Save to source'}
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
    ],
  );

  useActionToolbar(toolbarProps);

  return null;
};

export default ProjectActions;
