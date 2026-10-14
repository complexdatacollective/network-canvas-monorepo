'use client';

import { ChevronDown } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { useDropTarget } from '@codaco/fresco-ui/dnd/dnd';
import type { DropCallback } from '@codaco/fresco-ui/dnd/types';
import usePrevious from '@codaco/fresco-ui/hooks/usePrevious';
import NodeDropAnimation from '@codaco/fresco-ui/NodeDropAnimation';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { runtimeMessages as messages } from '../i18n/runtimeMessages';
import DrawerNode from '../interfaces/Sociogram/DrawerNode';

type NodeDrawerProps = {
  nodes: NcNode[];
  itemType?: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** When true, drawer is absolutely positioned (for Sociogram canvas overlay). Defaults to false (inline flex). */
  floating?: boolean;
  /**
   * When provided, the drawer registers as a DnD drop target so dragged nodes
   * can be returned to it (e.g. unplacing a placed sociogram node). Also makes
   * the drawer manually expandable while empty, illuminates its tab during a
   * compatible drag, and expands it when that drag reaches the tab.
   */
  dropTarget?: {
    accepts: string[];
    announcedName: string;
    onDrop: DropCallback;
  };
  /**
   * False makes the drawer a queue the participant reads but does not drag
   * from, as a bin stage in select mode is (#1652).
   */
  draggable?: boolean;
  /**
   * False keeps the drawer open whenever it holds people and drops the tab
   * that collapses it, as a bin stage in select mode needs so the person
   * being placed stays in view.
   */
  collapsible?: boolean;
  /** The person shown as the one being placed. */
  selectedNodeId?: string;
  /** Called when a person who cannot be dragged is tapped. */
  onNodeClick?: (node: NcNode) => void;
  /**
   * Changes when the selected person should be brought back into view even
   * if they are still the one selected, as on a new prompt.
   */
  selectionKey?: string;
};

const MotionChevron = motion.create(ChevronDown);
const activeDropTargetBackground =
  'bg-[color-mix(in_oklab,var(--surface)_70%,var(--accent)_30%)]';
const activeDropTargetOverBackground =
  'bg-[color-mix(in_oklab,var(--surface)_20%,var(--accent)_80%)]';

export default function NodeDrawer({
  nodes,
  itemType,
  expanded,
  onExpandedChange,
  floating = false,
  dropTarget,
  draggable = true,
  collapsible = true,
  selectedNodeId,
  onNodeClick,
  selectionKey,
}: NodeDrawerProps) {
  const intl = useAppIntl();
  const unplacedId = useId();
  const toggleLabelId = useId();
  const [internalExpanded, setInternalExpanded] = useState(nodes.length > 0);
  const isExpanded = collapsible
    ? (expanded ?? internalExpanded)
    : nodes.length > 0;
  const setIsExpanded = onExpandedChange ?? setInternalExpanded;

  const hasNodes = nodes.length > 0;
  const isEmpty = !hasNodes;
  const canExpandWhenEmpty = !!dropTarget;

  const { dropProps, isOver, willAccept } = useDropTarget({
    id: 'node-drawer',
    accepts: dropTarget?.accepts ?? [],
    announcedName:
      dropTarget?.announcedName ?? intl.formatMessage(messages.drawer),
    onDrop: dropTarget?.onDrop,
    disabled: !dropTarget,
    focusBehaviorOnDrop: 'none',
  });

  // Hover expansion is temporary, so leaving the drawer restores the canvas
  // without mutating the participant's chosen state.
  const isExpandedEffective = isExpanded || isOver;
  const dropZoneId = dropTarget ? dropProps['data-zone-id'] : undefined;

  // Collapse when emptied, expand when nodes arrive
  const prevHasNodes = usePrevious(hasNodes);
  useEffect(() => {
    if (prevHasNodes === undefined) return;
    if (prevHasNodes && !hasNodes) {
      setIsExpanded(false);
    } else if (!prevHasNodes && hasNodes) {
      setIsExpanded(true);
    }
  }, [hasNodes, prevHasNodes, setIsExpanded]);

  // A newly selected person is the one being placed, so it must be visible:
  // reopen the drawer if the participant had collapsed it, and scroll the row
  // to them if they are out of view. A new prompt counts as a new selection.
  const viewportRef = useRef<HTMLElement>(null);
  const revealSelected = useCallback(() => {
    const viewport = viewportRef.current;
    const selected = viewport?.querySelector('[data-node-selected]');
    if (!viewport || !selected) return;
    // Only the row scrolls: scrollIntoView would also scroll the drawer's
    // clipped, height-animating container.
    const row = viewport.getBoundingClientRect();
    const person = selected.getBoundingClientRect();
    if (person.left < row.left) {
      viewport.scrollLeft -= row.left - person.left;
    } else if (person.right > row.right) {
      viewport.scrollLeft += person.right - row.right;
    }
  }, []);
  const selectionIsInDrawer =
    selectedNodeId !== undefined &&
    nodes.some((node) => node[entityPrimaryKeyProperty] === selectedNodeId);
  const selection =
    selectedNodeId === undefined
      ? undefined
      : `${selectionKey ?? ''}:${selectedNodeId}`;
  const prevSelection = usePrevious(selection);
  useEffect(() => {
    if (selection === prevSelection) return;
    if (!selectionIsInDrawer) return;
    setIsExpanded(true);
    // A frame later, once the selected state has rendered. Not cancelled on
    // re-run: the effect re-runs on the next render, when the previous
    // selection catches up, and the scroll must still happen.
    requestAnimationFrame(revealSelected);
  }, [
    selection,
    prevSelection,
    selectionIsInDrawer,
    setIsExpanded,
    revealSelected,
  ]);

  const [isLayoutAnimating, setIsLayoutAnimating] = useState(false);
  const prevNodeCountRef = usePrevious(nodes.length);

  if (nodes.length !== prevNodeCountRef) {
    if (nodes.length > 0 && !isLayoutAnimating) {
      setIsLayoutAnimating(true);
    }
  }

  // Safety timeout in case onLayoutAnimationComplete doesn't fire
  // (e.g. no nodes actually moved).
  useEffect(() => {
    if (!isLayoutAnimating) return undefined;
    const timeout = setTimeout(() => setIsLayoutAnimating(false), 500);
    return () => clearTimeout(timeout);
  }, [isLayoutAnimating]);

  const [remeasureKey, setRemeasureKey] = useState(0);

  // The drawer can reorder without the selection changing (a sort value
  // decrypting, say), so check the selected person is still in view once the
  // people have settled.
  const handleLayoutAnimationComplete = useCallback(() => {
    setIsLayoutAnimating(false);
    setRemeasureKey((k) => k + 1);
    revealSelected();
  }, [revealSelected]);

  const isToggleDisabled = isEmpty && !canExpandWhenEmpty;

  return (
    <LayoutGroup>
      <motion.div
        layout
        {...(dropTarget ? dropProps : {})}
        data-zone-id={isExpandedEffective ? dropZoneId : undefined}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className={cx(
          'tablet-landscape:min-w-sm tablet-landscape:w-fit z-10 mx-auto w-full max-w-2xl drop-shadow-xl',
          floating ? 'absolute inset-x-0 bottom-0' : 'shrink-0',
          floating && !isExpandedEffective && 'pointer-events-none',
        )}
      >
        {/* Toggle button. A drawer that cannot collapse has no tab, but still
            tells screen readers how many people are left. */}
        {collapsible ? (
          <motion.div layout="position" className="flex justify-center">
            <motion.button
              layout="position"
              type="button"
              onClick={() => {
                if (!isToggleDisabled) setIsExpanded(!isExpanded);
              }}
              disabled={isToggleDisabled}
              className={cx(
                'bg-surface publish-colors pointer-events-auto flex h-11 w-32 items-center justify-center rounded-t-[1.375rem] transition-colors',
                willAccept &&
                  (isOver
                    ? activeDropTargetOverBackground
                    : activeDropTargetBackground),
                isToggleDisabled && 'cursor-not-allowed opacity-50',
              )}
              data-zone-id={!isExpandedEffective ? dropZoneId : undefined}
              data-drop-target-valid={willAccept || undefined}
              data-drop-target-over={isOver || undefined}
              aria-labelledby={`${unplacedId} ${toggleLabelId}`}
              aria-expanded={isExpandedEffective}
            >
              <MotionChevron
                className="size-7"
                aria-hidden
                animate={{ rotate: isExpandedEffective ? 0 : 180 }}
              />
              <span id={unplacedId} className="sr-only">
                <AppMessage
                  message={messages.unplacedCount}
                  values={{ count: nodes.length }}
                />
              </span>
              <span id={toggleLabelId} className="sr-only">
                {intl.formatMessage(
                  isExpandedEffective
                    ? messages.collapseDrawer
                    : messages.expandDrawer,
                )}
              </span>
            </motion.button>
          </motion.div>
        ) : (
          <span className="sr-only">
            <AppMessage
              message={messages.unplacedCount}
              values={{ count: nodes.length }}
            />
          </span>
        )}

        <motion.div
          layout
          initial={{ height: 0, opacity: 0 }}
          animate={
            isExpandedEffective
              ? {
                  height: 'auto',
                  opacity: 1,
                  transition: {
                    height: { type: 'spring', stiffness: 300, damping: 24 },
                    opacity: { duration: 0.15 },
                  },
                }
              : {
                  height: 0,
                  opacity: 0,
                  transition: {
                    height: { duration: 0.25, ease: [0, 0, 0.2, 1] },
                    opacity: { duration: 0.15 },
                  },
                }
          }
          className={cx(
            'publish-colors overflow-hidden rounded transition-colors',
            !willAccept && 'bg-surface',
            willAccept &&
              (isOver
                ? activeDropTargetOverBackground
                : activeDropTargetBackground),
          )}
        >
          <ScrollArea
            ref={viewportRef}
            orientation="horizontal"
            fade
            remeasureKey={remeasureKey}
            viewportClassName="flex items-center gap-4 p-4"
          >
            {isEmpty && canExpandWhenEmpty ? (
              // Matches the height of a drawer node so the empty drawer
              // expands to a full row.
              <div className="flex min-h-24 w-full items-center justify-center px-8 text-sm opacity-70">
                {/* Only loop while the drawer is open to be seen. */}
                {isExpandedEffective && <NodeDropAnimation />}
                <span className="sr-only">
                  <AppMessage message={messages.dropToRemove} />
                </span>
              </div>
            ) : (
              <AnimatePresence>
                {nodes.map((node) => (
                  <DrawerNode
                    key={node[entityPrimaryKeyProperty]}
                    node={node}
                    itemType={itemType}
                    onLayoutAnimationComplete={handleLayoutAnimationComplete}
                    draggable={draggable}
                    onClick={onNodeClick}
                    selected={
                      selectedNodeId !== undefined &&
                      node[entityPrimaryKeyProperty] === selectedNodeId
                    }
                  />
                ))}
              </AnimatePresence>
            )}
          </ScrollArea>
        </motion.div>
      </motion.div>
    </LayoutGroup>
  );
}
