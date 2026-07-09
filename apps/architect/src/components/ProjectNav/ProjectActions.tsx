import {
  ArrowLeftToLine,
  Check,
  Download,
  Redo,
  Save,
  Undo,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';

import Tooltip from '~/components/NewComponents/Tooltip';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { getActiveProtocolId } from '~/ducks/modules/app';
import { actionCreators as dialogActions } from '~/ducks/modules/dialogs';
import { exportNetcanvas } from '~/ducks/modules/userActions/userActions';
import { useScopedUndoRedo } from '~/hooks/useScopedUndoRedo';
import Button, { IconButton } from '~/lib/legacy-ui/components/Button';
import { getProtocol } from '~/selectors/protocol';
import type { ProtocolSourceRef } from '~/templates';
import {
  isProtocolSourceAuthoringEnabled,
  saveProtocolSource,
} from '~/templates/source-authoring';
import { getStoredProtocol } from '~/utils/protocolLibrary';
import { reportError } from '~/utils/reportError';

import ActionToolbar from './ActionToolbar';

type ProjectActionsProps = {
  additionalActions?: React.ReactNode;
  readOnly?: boolean;
};

const ProjectActions = ({
  additionalActions,
  readOnly = false,
}: ProjectActionsProps) => {
  const dispatch = useAppDispatch();
  const activeProtocolId = useAppSelector(getActiveProtocolId);
  const protocol = useAppSelector(getProtocol);
  const {
    canUndo,
    canRedo,
    undo: scopedUndo,
    redo: scopedRedo,
  } = useScopedUndoRedo();
  const [, setLocation] = useLocation();
  const handleReturnToStart = useCallback(
    () => setLocation('/'),
    [setLocation],
  );

  const [isExporting, setIsExporting] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [sourceRef, setSourceRef] = useState<ProtocolSourceRef | null>(null);
  const [isSavingSource, setIsSavingSource] = useState(false);
  const [sourceSaveSuccess, setSourceSaveSuccess] = useState(false);

  const handleUndo = useCallback(() => scopedUndo(), [scopedUndo]);
  const handleRedo = useCallback(() => scopedRedo(), [scopedRedo]);

  const handleDownload = useCallback(async () => {
    try {
      setIsExporting(true);
      await dispatch(exportNetcanvas()).unwrap();
      setDownloadSuccess(true);
    } catch (error) {
      const { message } = reportError(error);
      dispatch(
        dialogActions.openDialog({
          type: 'Error',
          title: 'Failed to export protocol',
          message,
        }),
      );
    } finally {
      setIsExporting(false);
    }
  }, [dispatch]);

  const handleSaveSource = useCallback(async () => {
    if (!activeProtocolId || !sourceRef || !protocol) {
      return;
    }

    const confirmed = await dispatch(
      dialogActions.openDialog({
        type: 'Warning',
        title: 'Save protocol source?',
        message: `"${protocol.name}" will overwrite the canonical protocol source files in this repository.`,
        confirmLabel: 'Save to source',
        cancelLabel: 'Cancel',
        canCancel: true,
      }),
    ).unwrap();

    if (!confirmed) {
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
        void dispatch(
          dialogActions.openDialog({
            type: 'Error',
            title: 'Source save failed',
            message: `"${protocol.name}" could not be saved to source.`,
            error: [result.error, ...(result.issues ?? [])].join('\n'),
          }),
        );
        return;
      }

      setSourceSaveSuccess(true);
      void dispatch(
        dialogActions.openDialog({
          type: 'Notice',
          title: 'Protocol source saved',
          message: `"${protocol.name}" was saved to ${result.writtenProtocolPath}. ${result.writtenAssets.length} assets were written and ${result.removedAssets.length} stale assets were removed.`,
        }),
      );
    } catch (error) {
      const { message } = reportError(error);
      void dispatch(
        dialogActions.openDialog({
          type: 'Error',
          title: 'Source save failed',
          message: `"${protocol.name}" could not be saved to source.`,
          error: message,
        }),
      );
    } finally {
      setIsSavingSource(false);
    }
  }, [activeProtocolId, dispatch, protocol, sourceRef]);

  useEffect(() => {
    let cancelled = false;

    setSourceRef(null);
    if (!isProtocolSourceAuthoringEnabled || !activeProtocolId) {
      return () => {
        cancelled = true;
      };
    }

    void getStoredProtocol(activeProtocolId)
      .then((row) => {
        if (!cancelled) {
          setSourceRef(row?.sourceRef ?? null);
        }
      })
      .catch((error: unknown) => {
        reportError(error);
      });

    return () => {
      cancelled = true;
    };
  }, [activeProtocolId]);

  useEffect(() => {
    if (!downloadSuccess) return;
    const timer = setTimeout(() => setDownloadSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [downloadSuccess]);

  useEffect(() => {
    if (!sourceSaveSuccess) return;
    const timer = setTimeout(() => setSourceSaveSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [sourceSaveSuccess]);

  const canSaveToSource =
    !readOnly &&
    isProtocolSourceAuthoringEnabled &&
    activeProtocolId !== null &&
    protocol !== null &&
    sourceRef !== null;

  return (
    <ActionToolbar>
      <Button
        onClick={handleReturnToStart}
        color="platinum"
        icon={<ArrowLeftToLine />}
      >
        Return to Start Screen
      </Button>
      {additionalActions}
      {!readOnly && (
        <>
          <IconButton
            variant="text"
            icon={<Undo />}
            onClick={handleUndo}
            disabled={!canUndo}
            aria-label="Undo"
          />
          <IconButton
            variant="text"
            icon={<Redo />}
            onClick={handleRedo}
            disabled={!canRedo}
            aria-label="Redo"
          />
        </>
      )}
      <Tooltip content="Download .netcanvas protocol">
        <Button
          onClick={handleDownload}
          color="sea-green"
          content={
            downloadSuccess
              ? 'Downloaded'
              : isExporting
                ? 'Downloading...'
                : 'Download'
          }
          disabled={isExporting}
          icon={downloadSuccess ? <Check /> : <Download />}
        />
      </Tooltip>
      {canSaveToSource && (
        <Tooltip content="Save this protocol back to its canonical source files">
          <Button
            onClick={handleSaveSource}
            color="platinum"
            content={
              sourceSaveSuccess
                ? 'Saved'
                : isSavingSource
                  ? 'Saving...'
                  : 'Save to source'
            }
            disabled={isSavingSource}
            icon={sourceSaveSuccess ? <Check /> : <Save />}
          />
        </Tooltip>
      )}
    </ActionToolbar>
  );
};

export default ProjectActions;
