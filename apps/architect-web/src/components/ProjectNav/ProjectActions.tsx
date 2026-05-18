import { ArrowLeftToLine, Check, Download, Redo, Undo } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import Tooltip from '~/components/NewComponents/Tooltip';
import { useAppDispatch } from '~/ducks/hooks';
import { redo, undo } from '~/ducks/modules/activeProtocol';
import { actionCreators as dialogActions } from '~/ducks/modules/dialogs';
import { exportNetcanvas } from '~/ducks/modules/userActions/userActions';
import { useReturnToStartDialog } from '~/hooks/useReturnToStartDialog';
import Button, { IconButton } from '~/lib/legacy-ui/components/Button';
import { getCanRedo, getCanUndo } from '~/selectors/protocol';

import ActionToolbar from './ActionToolbar';

type ProjectActionsProps = {
  extras?: React.ReactNode;
  readOnly?: boolean;
  showReturnToStart?: boolean;
};

const ProjectActions = ({
  extras,
  readOnly = false,
  showReturnToStart = false,
}: ProjectActionsProps) => {
  const dispatch = useAppDispatch();
  const canUndo = useSelector(getCanUndo);
  const canRedo = useSelector(getCanRedo);
  const handleReturnToStart = useReturnToStartDialog();

  const [isExporting, setIsExporting] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const handleUndo = useCallback(() => dispatch(undo()), [dispatch]);
  const handleRedo = useCallback(() => dispatch(redo()), [dispatch]);

  const handleDownload = useCallback(async () => {
    try {
      setIsExporting(true);
      await dispatch(exportNetcanvas()).unwrap();
      setDownloadSuccess(true);
    } catch (error) {
      dispatch(
        dialogActions.openDialog({
          type: 'Error',
          title: 'Failed to export protocol',
          message: error instanceof Error ? error.message : String(error),
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
      {showReturnToStart && (
        <Button
          onClick={handleReturnToStart}
          color="platinum"
          icon={<ArrowLeftToLine />}
        >
          Return to Start Screen
        </Button>
      )}
      {extras}
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
