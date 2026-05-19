import { ArrowLeftToLine, Check, Download, Redo, Undo } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'wouter';

import Tooltip from '~/components/NewComponents/Tooltip';
import { useAppDispatch } from '~/ducks/hooks';
import { redo, undo } from '~/ducks/modules/activeProtocol';
import { actionCreators as dialogActions } from '~/ducks/modules/dialogs';
import { exportNetcanvas } from '~/ducks/modules/userActions/userActions';
import Button, { IconButton } from '~/lib/legacy-ui/components/Button';
import { getCanRedo, getCanUndo } from '~/selectors/protocol';

import ActionToolbar from './ActionToolbar';

type ProjectActionsProps = {
  additionalActions?: React.ReactNode;
  readOnly?: boolean;
  showReturnToStart?: boolean;
};

const ProjectActions = ({
  additionalActions,
  readOnly = false,
  showReturnToStart = false,
}: ProjectActionsProps) => {
  const dispatch = useAppDispatch();
  const canUndo = useSelector(getCanUndo);
  const canRedo = useSelector(getCanRedo);
  const [, setLocation] = useLocation();
  const handleReturnToStart = useCallback(
    () => setLocation('/'),
    [setLocation],
  );
  const shouldReduceMotion = useReducedMotion();
  const layout = shouldReduceMotion ? false : true;

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
      <AnimatePresence initial={false}>
        {showReturnToStart && (
          <motion.div
            key="return-to-start"
            layout={layout}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.18 }}
          >
            <Button
              onClick={handleReturnToStart}
              color="platinum"
              icon={<ArrowLeftToLine />}
            >
              Return to Start Screen
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
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
