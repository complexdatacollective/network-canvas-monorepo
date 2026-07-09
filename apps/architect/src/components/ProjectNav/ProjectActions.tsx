import {
  ArrowLeftToLine,
  Check,
  Download,
  Redo,
  Save,
  Undo,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { ToolbarSegment } from '@codaco/fresco-ui/SegmentedToolbar';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { getActiveProtocolId } from '~/ducks/modules/app';
import { exportNetcanvas } from '~/ducks/modules/userActions/userActions';
import { useScopedUndoRedo } from '~/hooks/useScopedUndoRedo';
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
  additionalItems?: ToolbarSegment[];
  readOnly?: boolean;
};

const ProjectActions = ({
  additionalItems = [],
  readOnly = false,
}: ProjectActionsProps) => {
  const dispatch = useAppDispatch();
  const activeProtocolId = useAppSelector(getActiveProtocolId);
  const protocol = useAppSelector(getProtocol);
  const { openDialog } = useDialog();
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
      const { skippedAssets } = await dispatch(exportNetcanvas()).unwrap();
      if (skippedAssets.length > 0) {
        const assetList = skippedAssets.map((asset) => asset.name).join(', ');
        void openDialog({
          type: 'acknowledge',
          intent: 'warning',
          title: 'Some assets could not be exported',
          description:
            'Your protocol was downloaded, but these assets could not be ' +
            `included and are missing from the file: ${assetList}.`,
          actions: { primary: { label: 'OK', value: true } },
        });
      }
      setDownloadSuccess(true);
    } catch (error) {
      const { message } = reportError(error);
      void openDialog({
        type: 'acknowledge',
        intent: 'destructive',
        title: 'Failed to export protocol',
        description: message,
        actions: { primary: { label: 'OK', value: true } },
      });
    } finally {
      setIsExporting(false);
    }
  }, [dispatch, openDialog]);

  const handleSaveSource = useCallback(async () => {
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

  const toolbarItems = useMemo<ToolbarSegment[]>(() => {
    const items: ToolbarSegment[] = [
      {
        type: 'button',
        id: 'return-to-start',
        label: 'Return to Start Screen',
        icon: <ArrowLeftToLine />,
        showLabel: true,
        onClick: handleReturnToStart,
      },
      ...additionalItems,
    ];

    if (!readOnly) {
      items.push(
        { type: 'separator', id: 'project-history-separator' },
        {
          type: 'button',
          id: 'undo',
          label: 'Undo',
          icon: <Undo />,
          disabled: !canUndo,
          onClick: handleUndo,
        },
        {
          type: 'button',
          id: 'redo',
          label: 'Redo',
          icon: <Redo />,
          disabled: !canRedo,
          onClick: handleRedo,
        },
      );
    }

    items.push(
      { type: 'separator', id: 'project-download-separator' },
      {
        type: 'button',
        id: 'download',
        label: downloadSuccess
          ? 'Downloaded'
          : isExporting
            ? 'Downloading...'
            : 'Download',
        icon: downloadSuccess ? <Check /> : <Download />,
        showLabel: true,
        className: 'bg-sea-green text-white',
        disabled: isExporting,
        onClick: handleDownload,
      },
    );

    if (canSaveToSource) {
      items.push(
        { type: 'separator', id: 'project-source-separator' },
        {
          type: 'button',
          id: 'save-to-source',
          label: sourceSaveSuccess
            ? 'Saved'
            : isSavingSource
              ? 'Saving...'
              : 'Save to source',
          icon: sourceSaveSuccess ? <Check /> : <Save />,
          showLabel: true,
          disabled: isSavingSource,
          onClick: handleSaveSource,
        },
      );
    }

    return items;
  }, [
    additionalItems,
    canRedo,
    canSaveToSource,
    canUndo,
    downloadSuccess,
    handleDownload,
    handleRedo,
    handleReturnToStart,
    handleSaveSource,
    handleUndo,
    isExporting,
    isSavingSource,
    readOnly,
    sourceSaveSuccess,
  ]);

  return <ActionToolbar items={toolbarItems} />;
};

export default ProjectActions;
