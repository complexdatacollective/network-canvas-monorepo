import { Plus } from 'lucide-react';
import { motion, Reorder, useReducedMotion, type Variants } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'wouter';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useAccessibilityAnnouncements } from '@codaco/fresco-ui/dnd/useAccessibilityAnnouncements';
import { useAppDispatch } from '~/ducks/hooks';
import {
  actionCreators as stageActions,
  getFamilyPedigreeDependentStages,
} from '~/ducks/modules/protocol/stages';
import { useRunOnce } from '~/hooks/useRunOnce';
import { getProtocol, getStageList } from '~/selectors/protocol';
import { cx } from '~/utils/cva';

import NewStageScreen from '../Screens/NewStageScreen';
import {
  getStageDeletedAnnouncement,
  getStageMovedAnnouncement,
} from './announcements';
import InsertButton from './InsertButton';
import { timelineRowGrid } from './rowLayout';
import {
  getSkipDestinationDeleteWarning,
  getSkipDestinationReorderGuard,
} from './skipDestinationGuards';
import TimelineStageRow from './TimelineStageRow';

// The entrance orchestration, as two named numbers rather than two literals
// buried in a variant: the trailing "Add new stage" control sits outside the
// list now (see the render), so it has to work out for itself the step the
// stagger would have handed it.
const TIMELINE_ENTRANCE_DELAY = 0.6;
const TIMELINE_ENTRANCE_STAGGER = 0.08;

const timelineContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: TIMELINE_ENTRANCE_DELAY,
      staggerChildren: TIMELINE_ENTRANCE_STAGGER,
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
  // `getStageList` maps each stage down to `{id, type, label, hasFilter,
  // hasSkipLogic, skipLogic: {destination}}` for cheap render diffing — the
  // skip destination is on it because the reorder and delete guards below read
  // it — while dropping stage-type-specific fields like NarrativePedigree's
  // `sourceStageId`. The FamilyPedigree delete guard needs that one to find
  // dependents, so it reads the full protocol separately (mirroring
  // `deleteStageAsync`'s own dependents check in
  // ducks/modules/protocol/stages.ts, which already does this correctly)
  // rather than off the pruned list.
  const protocol = useSelector(getProtocol);
  const dispatch = useAppDispatch();
  const { confirm, openDialog } = useDialog();
  const shouldReduceMotion = useReducedMotion();
  const isFirstMount = useRunOnce('timeline-entrance');
  const animate = !shouldReduceMotion && isFirstMount;
  const { announce } = useAccessibilityAnnouncements();

  // Local order the Reorder list renders from. motion's onReorder fires per
  // row-crossing during a drag; we track the visual order here and only commit a
  // single moveStage on drag end, so one drag == one undo entry. Kept in sync
  // with redux (the source of truth) whenever the committed stage list changes.
  const [orderedStages, setOrderedStages] = useState(stages);

  useEffect(() => {
    setOrderedStages(stages);
  }, [stages]);

  // Every row's "open" control, so a deleted row can hand focus to a surviving
  // neighbour. Resolved lazily, when focus is actually returned, because WHICH
  // neighbour survives is not known until the deletion has been applied — and
  // on the last stage there is no neighbour at all and focus has to go to the
  // add control instead.
  const openControlsRef = useRef(new Map<string, HTMLButtonElement>());
  const addStageRef = useRef<HTMLButtonElement>(null);

  const registerOpenControl = useCallback(
    (stageId: string, element: HTMLButtonElement | null) => {
      if (element) {
        openControlsRef.current.set(stageId, element);
      } else {
        openControlsRef.current.delete(stageId);
      }
    },
    [],
  );

  const deleteStage = useCallback(
    (stageId: string) => {
      void dispatch(stageActions.deleteStage(stageId));
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

  // The add control used to be the Reorder.Group's last staggered child. It is
  // not in the list any more, so it carries the delay the orchestration would
  // have given it: `delayChildren`, then one stagger step for each of the
  // group's children — an insertion point and a row per stage.
  const addStageVariants = useMemo<Variants>(
    () => ({
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          duration: 0.3,
          delay:
            TIMELINE_ENTRANCE_DELAY +
            TIMELINE_ENTRANCE_STAGGER * orderedStages.length * 2,
        },
      },
    }),
    [orderedStages.length],
  );

  const handleDeleteStage = useCallback(
    (stageId: string) => {
      const stageIndex = stages.findIndex(
        (candidate) => candidate.id === stageId,
      );
      const stage = stages[stageIndex];
      const skipDestinationWarning = getSkipDestinationDeleteWarning(
        stages,
        stageId,
      );
      if (skipDestinationWarning) {
        void openDialog({
          type: 'acknowledge',
          intent: 'warning',
          ...skipDestinationWarning,
          actions: { primary: { label: 'OK', value: true } },
        });
        return;
      }

      if (stage?.type === 'FamilyPedigree') {
        const dependents = getFamilyPedigreeDependentStages(
          protocol?.stages ?? [],
          stageId,
        );
        if (dependents.length > 0) {
          const names = dependents
            .map((dependent) => `"${dependent.label || 'Untitled stage'}"`)
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

      // The row that will occupy this position once the stage is gone — the
      // next stage, or the previous one when deleting the last row.
      const successor = stages[stageIndex + 1] ?? stages[stageIndex - 1];
      const remaining = stages.length - 1;

      void confirm({
        title: 'Delete stage',
        // `stages/deleteStage` is inside the protocol timeline
        // (`ducks/modules/root.ts`), so Undo restores the stage — the old
        // "cannot be undone!" was simply false (#1400). Same sentence as the
        // resource delete shipped in #1396 (`AssetBrowser.tsx`): four adjacent
        // destructive dialogs stating one fact must state it one way.
        description:
          'Are you sure you want to delete this stage from your protocol? You can restore it with Undo while this protocol remains open.',
        confirmLabel: 'Delete stage',
        cancelLabel: 'Cancel',
        intent: 'destructive',
        onConfirm: () => {
          deleteStage(stageId);
          announce(getStageDeletedAnnouncement(stageIndex + 1, remaining));
        },
        // Cancel returns to the row's own Delete control, which survives.
        // Confirm destroys it, and without an answer here focus would land on
        // `<body>` — silently, in the middle of a destructive action.
        finalFocus: () =>
          (successor ? openControlsRef.current.get(successor.id) : undefined) ??
          addStageRef.current,
      });
    },
    [announce, confirm, deleteStage, openDialog, stages, protocol],
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

  // Returns whether the move was committed. The keyboard path passes that
  // answer back to the drag handle, which is otherwise left waiting to reclaim
  // focus for a move that never happened.
  const commitReorder = useCallback(
    (stageId: string, proposedStages: typeof stages) => {
      const oldIndex = stages.findIndex((s) => s.id === stageId);
      const newIndex = proposedStages.findIndex((s) => s.id === stageId);

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        return false;
      }

      const reorderGuard = getSkipDestinationReorderGuard(
        stages,
        proposedStages,
      );

      if (!reorderGuard.allowed) {
        setOrderedStages(reorderGuard.restoredStages);
        void openDialog({
          type: 'acknowledge',
          intent: 'warning',
          ...reorderGuard.warning,
          actions: { primary: { label: 'OK', value: true } },
        });
        return false;
      }

      setOrderedStages(proposedStages);
      dispatch(stageActions.moveStage(oldIndex, newIndex));
      announce(
        getStageMovedAnnouncement(oldIndex + 1, newIndex + 1, stages.length),
      );
      return true;
    },
    [announce, dispatch, openDialog, stages],
  );

  // Commit the whole reorder as a single moveStage once the drag ends, using the
  // dragged stage's final position relative to the committed list.
  const handleReorderCommit = useCallback(
    (stageId: string) => {
      commitReorder(stageId, orderedStages);
    },
    [commitReorder, orderedStages],
  );

  // One arrow press is one moveStage, matching the drag contract's one-drag-one-
  // undo-entry. Runs the proposed order through the same skip-destination guard
  // the drag path uses, so the keyboard cannot reach an order the pointer can't.
  const handleKeyboardMove = useCallback(
    (stageId: string, targetIndex: number) => {
      const currentIndex = stages.findIndex((s) => s.id === stageId);
      if (currentIndex === -1) return false;
      if (targetIndex < 0 || targetIndex > stages.length - 1) return false;

      const proposedStages = [...stages];
      const [moved] = proposedStages.splice(currentIndex, 1);
      if (!moved) return false;
      proposedStages.splice(targetIndex, 0, moved);

      return commitReorder(stageId, proposedStages);
    },
    [commitReorder, stages],
  );

  return (
    <>
      {/* Wrapper with timeline line. Top padding leaves a stretch of line below
                the protocol overview card so the timeline visually connects to it.
                `w-full` (the wrapper used to shrink-wrap the old fixed-width rows)
                so rows can be fluid, and an `@container` so each row sizes itself
                from the timeline's own width rather than the viewport's. */}
      <div className="@container relative flex w-full flex-col items-center gap-1 pt-10">
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
          aria-label="Protocol stages"
          className="relative grid w-full grid-cols-1 justify-items-center gap-1"
          values={orderedStages}
          initial={animate ? 'hidden' : false}
          animate="visible"
          variants={timelineContainerVariants}
        >
          {/* One `<li>` per stage and nothing else in the list. A `<ul>` whose
              children are anything but `<li>` is invalid content, and every
              insertion point and the trailing add control used to be direct
              children of this one — so a 32-stage protocol reached assistive
              technology as a list of 65 things, only half of which were stages.

              The insertion point stays INSIDE the item it sits above rather
              than beside it. It is the affordance for adding a stage before
              this one — its accessible name already says exactly that — so it
              reads as part of that stage's entry, and keeping it here leaves
              DOM order, and therefore the tab order a researcher has learned,
              exactly as it was. It stays a sibling of the row rather than a
              child of it because the row is a drag surface with its own hover
              group and click-to-open: inside it, pressing the insertion point
              would start a stage drag and hovering it would light up the stage
              below. */}
          {orderedStages.map((stage, index) => (
            <li
              key={stage.id}
              className="grid w-full grid-cols-1 justify-items-center gap-1"
            >
              <InsertButton
                position={index + 1}
                nextStageName={stage.label || 'Untitled stage'}
                onClick={() => handleInsertStage(index)}
                variants={timelineInsertVariants}
              />
              <TimelineStageRow
                stage={stage}
                index={index}
                stageCount={orderedStages.length}
                onOpen={handleEditStage}
                onMove={handleKeyboardMove}
                onDelete={handleDeleteStage}
                onDragCommit={handleReorderCommit}
                registerOpenControl={registerOpenControl}
                variants={timelineStageVariants}
              />
            </li>
          ))}
        </Reorder.Group>

        {/* Outside the list. Appending a stage is an action ON the timeline, not
            one of its stages; inside the `<ul>` it would have to be an `<li>` to
            be valid content, which would only trade invalid markup for a list
            that claims one stage more than the protocol has. */}
        <motion.button
          type="button"
          ref={addStageRef}
          className={cx(
            timelineRowGrid,
            'focusable group mt-3 cursor-pointer p-4',
          )}
          onClick={() => handleInsertStage(stages.length)}
          initial={animate ? 'hidden' : false}
          animate="visible"
          variants={addStageVariants}
        >
          <div />
          <div className="bg-action text-primary-contrast flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-300 ease-in-out group-hover:scale-110">
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </div>
          <span className="justify-self-start text-lg font-semibold transition-all group-hover:font-bold">
            Add new stage
          </span>
        </motion.button>
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
