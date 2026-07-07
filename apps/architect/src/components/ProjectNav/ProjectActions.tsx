import { ArrowLeftToLine, Check, Download, Redo, Undo } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';

import Tooltip from '~/components/NewComponents/Tooltip';
import { useAppDispatch } from '~/ducks/hooks';
import { actionCreators as dialogActions } from '~/ducks/modules/dialogs';
import { exportNetcanvas } from '~/ducks/modules/userActions/userActions';
import { useScopedUndoRedo } from '~/hooks/useScopedUndoRedo';
import Button, { IconButton } from '~/lib/legacy-ui/components/Button';
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

  useEffect(() => {
    if (!downloadSuccess) return;
    const timer = setTimeout(() => setDownloadSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [downloadSuccess]);

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
    </ActionToolbar>
  );
};

export default ProjectActions;
