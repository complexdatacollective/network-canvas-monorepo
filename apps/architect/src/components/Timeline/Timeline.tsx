import { Plus } from 'lucide-react';
import { motion, Reorder, useReducedMotion, type Variants } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'wouter';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { useAppDispatch } from '~/ducks/hooks';
import {
  actionCreators as stageActions,
  getFamilyPedigreeDependentStages,
} from '~/ducks/modules/protocol/stages';
import { useRunOnce } from '~/hooks/useRunOnce';
import filterIcon from '~/images/timeline/filter-icon.svg';
import skipLogicIcon from '~/images/timeline/skip-logic-icon.svg';
import { getStageList } from '~/selectors/protocol';
import { cx } from '~/utils/cva';

import NewStageScreen from '../Screens/NewStageScreen';
import StageTypeImage from '../StageTypeImage';
import InsertButton from './InsertButton';

const timelineContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.6,
      staggerChildren: 0.08,
    },
  },
};

const timelineStageVariants: Variants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { type: 'spring' },
  },
};

const timelineInsertVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.3 },
  },
};

const Timeline = () => {
  const stages = useSelector(getStageList);
  const dispatch = useAppDispatch();
  const { confirm, openDialog } = useDialog();
  const pointerStart = useRef({ x: 0, y: 0 });
  const didDrag = useRef(false);
  const shouldReduceMotion = useReducedMotion();
  const isFirstMount = useRunOnce('timeline-entrance');
  const animate = !shouldReduceMotion && isFirstMount;

  // Local order the Reorder list renders from. motion's onReorder fires per
  // row-crossing during a drag; we track the visual order here and only commit a
  // single moveStage on drag end, so one drag == one undo entry. Kept in sync
  // with redux (the source of truth) whenever the committed stage list changes.
  const [orderedStages, setOrderedStages] = useState(stages);

  useEffect(() => {
    setOrderedStages(stages);
  }, [stages]);

  const deleteStage = useCallback(
    (stageId: string) => {
      dispatch(stageActions.deleteStage(stageId));
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
      const stage = stages.find((candidate) => candidate.id === stageId);
      if (stage?.type === 'FamilyPedigree') {
        const dependents = getFamilyPedigreeDependentStages(stages, stageId);
        if (dependents.length > 0) {
          const names = dependents
            .map((dependent) => `"${dependent.label || 'Untitled'}"`)
            .join(', ');
          void openDialog({
            type: 'acknowledge',
            intent: 'warning',
            title: 'Cannot delete stage',
            description: `This Family Pedigree stage is used by the following Narrative Pedigree stage(s): ${names}. Remove or repoint those stage(s) before deleting it.`,
            actions: { primary: { label: 'OK', value: true } },
          });
          return;
        }
      }

      void confirm({
        title: 'Delete stage',
        description:
          'Are you sure you want to delete this stage from your protocol? This action cannot be undone!',
        confirmLabel: 'Delete stage',
        cancelLabel: 'Cancel',
        intent: 'destructive',
        onConfirm: () => deleteStage(stageId),
      });
    },
    [confirm, deleteStage, openDialog, stages],
  );

  const handleEditStage = useCallback(
    (id: string) => {
      setLocation(`/protocol/stage/${id}`);
    },
    [setLocation],
  );

  // Visual-only during the drag: no dispatch, so the timeline isn't fragmented
  // into one undo entry per crossing.
  const handleReorder = useCallback((newOrder: typeof stages) => {
    setOrderedStages(newOrder);
  }, []);

  // Commit the whole reorder as a single moveStage once the drag ends, using the
  // dragged stage's final position relative to the committed list.
  const handleReorderCommit = useCallback(
    (stageId: string) => {
      const oldIndex = stages.findIndex((s) => s.id === stageId);
      const newIndex = orderedStages.findIndex((s) => s.id === stageId);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        dispatch(stageActions.moveStage(oldIndex, newIndex));
      }
    },
    [stages, orderedStages, dispatch],
  );

  const itemClasses = cx(
    'group relative grid w-2xl cursor-pointer grid-cols-[1fr_auto_1fr] items-center gap-10 p-4',
    'hover:bg-selected/20 focus-visible:bg-selected/20 transition-colors duration-300 ease-in-out',
    // Focus state for accessibility
    'focus:ring-selected focus:ring-2 focus:ring-offset-2 focus:outline-none',
  );

  return (
    <>
      {/* Wrapper with timeline line. Top padding leaves a stretch of line below
			    the protocol overview card so the timeline visually connects to it. */}
      <div className="relative pt-10">
        {/* Line — clipped from below on initial mount so it reveals top-to-bottom.
            clip-path doesn't share the transform property with Tailwind's
            -translate-x-1/2, so there's no positioning conflict. */}
        <motion.div
          className="bg-timeline pointer-events-none absolute top-0 left-1/2 h-[calc(100%-1.25rem)] w-1 -translate-x-1/2"
          initial={animate ? { clipPath: 'inset(0 0 100% 0)' } : false}
          animate={{ clipPath: 'inset(0 0 0% 0)' }}
          transition={{ delay: 0.5, duration: 1.4, ease: 'easeOut' }}
        />

        <Reorder.Group
          axis="y"
          onReorder={handleReorder}
          className="relative grid grid-cols-1 justify-items-center gap-1"
          values={orderedStages}
          initial={animate ? 'hidden' : false}
          animate="visible"
          variants={timelineContainerVariants}
        >
          {orderedStages.flatMap((stage, index) => {
            return [
              <InsertButton
                key={`insert_${stage.id}`}
                onClick={() => handleInsertStage(index)}
                variants={timelineInsertVariants}
              />,
              <Reorder.Item
                tabIndex={0}
                key={stage.id}
                value={stage}
                layoutId={`timeline-stage-${stage.id}`}
                className={itemClasses}
                variants={timelineStageVariants}
                onPointerDown={(e) => {
                  pointerStart.current = { x: e.clientX, y: e.clientY };
                  didDrag.current = false;
                }}
                onDragStart={() => {
                  didDrag.current = true;
                }}
                onDragEnd={() => {
                  handleReorderCommit(stage.id);
                }}
                onClick={(e) => {
                  // A drag that returns to its origin ends near the pointer's
                  // start, so the distance check alone can't tell it from a
                  // click — the drag flag suppresses opening the editor.
                  if (didDrag.current) {
                    return;
                  }
                  const dx = e.clientX - pointerStart.current.x;
                  const dy = e.clientY - pointerStart.current.y;
                  if (dx * dx + dy * dy < 25) {
                    handleEditStage(stage.id);
                  }
                }}
              >
                <div className="justify-self-end">
                  <StageTypeImage
                    type={stage.type}
                    ratio="4:3"
                    sizes="14rem"
                    className="pointer-events-none w-56 rounded-xs shadow transition-transform duration-300 ease-in-out select-none group-hover:scale-105"
                  />
                </div>
                <div className="bg-timeline text-timeline-contrast flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-300 ease-in-out group-hover:scale-110">
                  {index + 1}
                </div>
                <div className="justify-self-start">
                  <Heading
                    level="h4"
                    margin="none"
                    className="my-2 transition-all group-hover:font-bold"
                  >
                    {stage.label || '\u00A0'}
                  </Heading>
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
                    color="destructive"
                  >
                    Delete stage
                  </Button>
                </div>
              </Reorder.Item>,
            ];
          })}

          <motion.div
            className="group mt-3 grid w-2xl cursor-pointer grid-cols-[1fr_auto_1fr] items-center gap-10 p-4"
            onClick={() => handleInsertStage(stages.length)}
            variants={timelineInsertVariants}
          >
            <div />
            <div className="bg-action text-primary-contrast flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-300 ease-in-out group-hover:scale-110">
              <Plus className="h-6 w-6" strokeWidth={2.5} />
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
