import { get } from 'es-toolkit/compat';
import { motion, Reorder } from 'motion/react';
import { useCallback, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'wouter';

import { useAppDispatch } from '~/ducks/hooks';
import {
  type DialogConfig,
  actionCreators as dialogsActions,
} from '~/ducks/modules/dialogs';
import { actionCreators as stageActions } from '~/ducks/modules/protocol/stages';
import timelineImages from '~/images/timeline';
import filterIcon from '~/images/timeline/filter-icon.svg';
import skipLogicIcon from '~/images/timeline/skip-logic-icon.svg';
import { Button } from '~/lib/legacy-ui/components';
import { getStageList } from '~/selectors/protocol';
import { cx } from '~/utils/cva';

import NewStageScreen from '../Screens/NewStageScreen';
import InsertButton from './InsertButton';

const getTimelineImage = (type: string) =>
  get(timelineImages, type, timelineImages.Default);

const Timeline = () => {
  const stages = useSelector(getStageList);
  const dispatch = useAppDispatch();
  const pointerStart = useRef({ x: 0, y: 0 });

  const deleteStage = useCallback(
    (stageId: string) => {
      dispatch(stageActions.deleteStage(stageId));
    },
    [dispatch],
  );

  const openDialog = useCallback(
    (config: DialogConfig) => {
      dispatch(dialogsActions.openDialog(config));
    },
    [dispatch],
  );

  const [, setLocation] = useLocation();
  const [showNewStageDialog, setShowNewStageDialog] = useState(false);
  const [insertAtIndex, setInsertAtIndex] = useState<number | undefined>(
    undefined,
  );

  const handleInsertStage = useCallback((index: number) => {
    setInsertAtIndex(index);
    setShowNewStageDialog(true);
  }, []);

  const handleDeleteStage = useCallback(
    (stageId: string) => {
      openDialog({
        type: 'Warning',
        title: 'Delete stage',
        message:
          'Are you sure you want to delete this stage from your protocol? This action cannot be undone!',
        onConfirm: () => deleteStage(stageId),
        confirmLabel: 'Delete stage',
      });
    },
    [openDialog, deleteStage],
  );

  const handleEditStage = useCallback(
    (id: string) => {
      setLocation(`/protocol/stage/${id}`);
    },
    [setLocation],
  );

  const handleReorder = useCallback(
    (newOrder: typeof stages) => {
      // Find which stage moved
      for (let i = 0; i < newOrder.length; i++) {
        if (newOrder[i]?.id !== stages[i]?.id) {
          // Move to new index
          const stageId = newOrder[i]?.id;
          if (!stageId) continue;

          const oldIndex = stages.findIndex((s) => s.id === stageId);
          const newIndex = i;

          if (oldIndex !== -1 && oldIndex !== newIndex) {
            dispatch(stageActions.moveStage(oldIndex, newIndex));
          }
          break;
        }
      }
    },
    [stages, dispatch],
  );

  const itemClasses = cx(
    'group relative grid w-2xl cursor-pointer grid-cols-[1fr_auto_1fr] items-center gap-10 p-4',
    'hover:bg-timeline-hover transition-colors duration-300 ease-in-out',
    // Focus state for accessibility
    'focus:ring-timeline focus:ring-2 focus:ring-offset-2 focus:outline-none',
  );

  return (
    <>
      {/* Wrapper with timeline line. Top padding leaves a stretch of line below
			    the protocol overview card so the timeline visually connects to it. */}
      <div className="relative pt-(--space-xl)">
        {/* Timeline line via CSS - height is 100% minus small offset to stop at add button center */}
        <div className="bg-timeline pointer-events-none absolute top-0 left-1/2 h-[calc(100%-1.25rem)] w-1.25 -translate-x-1/2" />

        <Reorder.Group
          axis="y"
          onReorder={handleReorder}
          className="relative grid grid-cols-1 justify-items-center gap-6"
          values={stages}
        >
          {stages.flatMap((stage, index) => [
            <InsertButton
              key={`insert_${stage.id}`}
              onClick={() => handleInsertStage(index)}
            />,
            <Reorder.Item
              tabIndex={0}
              key={stage.id}
              value={stage}
              layoutId={`timeline-stage-${stage.id}`}
              className={itemClasses}
              onPointerDown={(e) => {
                pointerStart.current = { x: e.clientX, y: e.clientY };
              }}
              onClick={(e) => {
                const dx = e.clientX - pointerStart.current.x;
                const dy = e.clientY - pointerStart.current.y;
                if (dx * dx + dy * dy < 25) {
                  handleEditStage(stage.id);
                }
              }}
            >
              <img
                className="pointer-events-none w-40 justify-self-end rounded shadow transition-transform duration-300 ease-in-out select-none group-hover:scale-105"
                src={getTimelineImage(stage.type)}
                alt={`${stage.type} interface`}
                title={`${stage.type} interface`}
              />
              <div className="bg-timeline text-timeline-foreground flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-300 ease-in-out group-hover:scale-110">
                {index + 1}
              </div>
              <div className="justify-self-start">
                <h4 className="transition-all group-hover:font-bold">
                  {stage.label || '\u00A0'}
                </h4>
                {(stage.hasFilter || stage.hasSkipLogic) && (
                  <div className="mt-1 flex items-center gap-1">
                    {stage.hasFilter && (
                      <img
                        src={filterIcon}
                        alt="Has filter"
                        title="Has filter"
                        className="h-5 w-5"
                      />
                    )}
                    {stage.hasSkipLogic && (
                      <img
                        src={skipLogicIcon}
                        alt="Has skip logic"
                        title="Has skip logic"
                        className="h-5 w-5"
                      />
                    )}
                  </div>
                )}
              </div>
              <div className="absolute top-1/2 -right-40 -translate-y-1/2 opacity-0 transition-opacity duration-300 ease-in-out group-hover:opacity-100">
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteStage(stage.id);
                  }}
                  color="neon-coral"
                >
                  Delete stage
                </Button>
              </div>
            </Reorder.Item>,
          ])}

          <motion.div
            className="group mt-3 grid w-2xl cursor-pointer grid-cols-[1fr_auto_1fr] items-center gap-10 p-4"
            onClick={() => handleInsertStage(stages.length)}
          >
            <div />
            <div className="bg-action text-primary-foreground flex h-10 w-10 items-center justify-center rounded-full text-4xl font-medium transition-transform duration-300 ease-in-out group-hover:scale-110">
              +
            </div>
            <span className="justify-self-start text-lg font-semibold transition-all group-hover:font-bold">
              Add new stage
            </span>
          </motion.div>
        </Reorder.Group>
      </div>
      <NewStageScreen
        open={showNewStageDialog}
        insertAtIndex={insertAtIndex}
        onOpenChange={setShowNewStageDialog}
      />
    </>
  );
};

export default Timeline;
