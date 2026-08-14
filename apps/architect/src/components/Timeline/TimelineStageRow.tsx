import { Trash2 } from 'lucide-react';
import { Reorder, useDragControls, type Variants } from 'motion/react';
import { useCallback, useRef, type MouseEvent, type PointerEvent } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import { ArrayFieldDragHandle } from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import Heading from '@codaco/fresco-ui/typography/Heading';
import filterIcon from '~/images/timeline/filter-icon.svg';
import skipLogicIcon from '~/images/timeline/skip-logic-icon.svg';
import { cx } from '~/utils/cva';

import { INTERFACE_TYPES } from '../Screens/NewStageScreen/interfaceOptions';
import StageTypeImage from '../StageTypeImage';
import { timelineRowGrid } from './rowLayout';

// The researcher-facing name of each interface, keyed by the stage `type` that
// appears in the protocol. The row's thumbnail is what tells a sighted
// researcher which interface a stage uses; naming the open control after it too
// keeps a screen-reader researcher level with them.
const INTERFACE_TITLES = new Map(
  INTERFACE_TYPES.map((option) => [option.type as string, option.title]),
);

// Reveals on hover as before, and now on focus too: these controls are always
// in the tab order, so without the focus-within branch a keyboard researcher
// would be operating an invisible Delete. Kept `opacity-0` rather than
// unmounted so the row never changes size. Carried by each control rather than
// a wrapper so "is it visible?" can be asked of the control itself.
const revealOnRowInterest =
  'opacity-0 transition-opacity duration-300 ease-in-out group-focus-within:opacity-100 group-hover:opacity-100';

export type TimelineRowStage = {
  id: string;
  type: string;
  label: string;
  hasFilter: boolean;
  hasSkipLogic: boolean;
};

type TimelineStageRowProps = {
  stage: TimelineRowStage;
  index: number;
  stageCount: number;
  onOpen: (stageId: string) => void;
  /**
   * Commit a keyboard reorder of this stage to `targetIndex`. Returns whether
   * the move was accepted — a refusal has to reach the drag handle, or it goes
   * on waiting to reclaim focus for a move that never happened.
   */
  onMove: (stageId: string, targetIndex: number) => boolean;
  onDelete: (stageId: string) => void;
  /** Commit a pointer drag that has just finished on this row. */
  onDragCommit: (stageId: string) => void;
  /**
   * Hands the row's "open" control to the timeline, which needs to be able to
   * name it as a focus-return target after a neighbouring row is deleted.
   */
  registerOpenControl: (
    stageId: string,
    element: HTMLButtonElement | null,
  ) => void;
  variants?: Variants;
};

/**
 * One stage on the timeline.
 *
 * The row itself stays a pointer drag surface that opens the stage editor when
 * clicked — that affordance predates this component and researchers rely on it.
 * What it grows is a keyboard path for each of those three actions, because the
 * row element has no activation behaviour of its own — it was an `<li>` then
 * and is a `<div>` now — and previously carried nothing but `tabIndex={0}` and
 * an `onClick`:
 *
 * - the thumbnail is a real `<button>`, so Enter and Space open the editor;
 * - a grip handle moves the stage with ArrowUp/ArrowDown (and still starts a
 *   pointer drag), reusing `ArrayFieldDragHandle` so the app has one reorder
 *   vocabulary rather than two;
 * - the delete control sits in the row's own grid instead of 10rem outside it.
 *
 * The stage label stays a real `<h4>` SIBLING of the open button rather than
 * its content. Nesting it would be invalid HTML (`<h4>` is flow content) and
 * ARIA marks a button's children presentational, which would delete
 * heading-by-heading navigation over the stage list — the only structural way
 * to skim a long protocol.
 */
const TimelineStageRow = ({
  stage,
  index,
  stageCount,
  onOpen,
  onMove,
  onDelete,
  onDragCommit,
  registerOpenControl,
  variants,
}: TimelineStageRowProps) => {
  const pointerStart = useRef({ x: 0, y: 0 });
  const didDrag = useRef(false);
  const dragControls = useDragControls();

  const stageName = stage.label || 'Untitled stage';
  const position = index + 1;
  const interfaceTitle = INTERFACE_TITLES.get(stage.type);
  const openControlLabel = interfaceTitle
    ? `Edit stage ${position}: ${stageName}, ${interfaceTitle}`
    : `Edit stage ${position}: ${stageName}`;

  // Deliberately stable. An inline `ref={(el) => register(...)}` is a new
  // function on every render, so React unregisters it (calling it with `null`)
  // and registers it again around EVERY commit — including the many that have
  // nothing to do with this row. The registry would still hold the right
  // element by the time focus is returned (Base UI returns it after the
  // dialog's exit animation, well after any commit has settled — see
  // `Modal`'s comment on why its isolation is released on the `open` flip
  // rather than on unmount), so this is not what makes the focus return
  // correct. It keeps the registry from churning every keystroke, which is
  // reason enough on its own.
  const setOpenControl = useCallback(
    (element: HTMLButtonElement | null) => {
      registerOpenControl(stage.id, element);
    },
    [registerOpenControl, stage.id],
  );

  const handleRowPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerStart.current = { x: event.clientX, y: event.clientY };
    didDrag.current = false;
  };

  const handleOpenFromButton = (event: MouseEvent<HTMLButtonElement>) => {
    // The row is also a click target; without this the editor would be opened
    // twice for one press.
    event.stopPropagation();
    // Keyboard activation reports `detail === 0`. It must never be suppressed
    // by `didDrag`, which holds its value from the last POINTER interaction —
    // after a drag that flag stays true until the next pointer press, so a
    // researcher who dragged a card and then tabbed here would find Enter
    // silently dead.
    if (event.detail !== 0 && didDrag.current) return;
    onOpen(stage.id);
  };

  return (
    <Reorder.Item
      // A `<div>`, not the `<li>` this defaults to. The row is not the list
      // item — `Timeline` renders one `<li>` per stage that holds this row and
      // the insertion point above it, so that the list's children are its
      // stages and nothing else. Reorder.Item reaches its group through React
      // context and registers its own measured box, so it neither needs nor
      // notices being one element further down the DOM.
      as="div"
      key={stage.id}
      value={stage}
      layoutId={`timeline-stage-${stage.id}`}
      dragControls={dragControls}
      className={cx(timelineRowGrid, 'group relative cursor-pointer p-4')}
      variants={variants}
      onPointerDown={handleRowPointerDown}
      onDragStart={() => {
        didDrag.current = true;
      }}
      onDragEnd={() => {
        onDragCommit(stage.id);
      }}
      onClick={(event) => {
        // A drag that returns to its origin ends near the pointer's start, so
        // the distance check alone can't tell it from a click — the drag flag
        // suppresses opening the editor.
        if (didDrag.current) {
          return;
        }
        const dx = event.clientX - pointerStart.current.x;
        const dy = event.clientY - pointerStart.current.y;
        if (dx * dx + dy * dy < 25) {
          onOpen(stage.id);
        }
      }}
    >
      <button
        type="button"
        ref={setOpenControl}
        aria-label={openControlLabel}
        onClick={handleOpenFromButton}
        className="focusable block w-full max-w-56 justify-self-end rounded-xs"
      >
        <StageTypeImage
          type={stage.type}
          alt=""
          ratio="4:3"
          sizes="14rem"
          className="pointer-events-none w-full rounded-xs shadow transition-transform duration-300 ease-in-out select-none group-hover:scale-105"
        />
      </button>
      <div className="bg-timeline text-timeline-contrast flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-300 ease-in-out group-hover:scale-110">
        {position}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-40">
          <Heading
            level="h4"
            margin="none"
            className="my-2 wrap-break-word transition-all group-hover:font-bold"
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
        <div className="flex shrink-0 items-center gap-1">
          <ArrayFieldDragHandle
            dragControls={dragControls}
            index={index}
            itemCount={stageCount}
            onMove={(targetIndex) => onMove(stage.id, targetIndex)}
            label={`Reorder stage ${position} of ${stageCount}: ${stageName}`}
            className={revealOnRowInterest}
          />
          <IconButton
            icon={<Trash2 />}
            aria-label={`Delete stage ${position}: ${stageName}`}
            color="destructive"
            variant="text"
            className={revealOnRowInterest}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(stage.id);
            }}
          />
        </div>
      </div>
    </Reorder.Item>
  );
};

export default TimelineStageRow;
