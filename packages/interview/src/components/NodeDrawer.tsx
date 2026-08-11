import { ChevronDown } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';

import { useDropTarget } from '@codaco/fresco-ui/dnd/dnd';
import type { DropCallback } from '@codaco/fresco-ui/dnd/types';
import usePrevious from '@codaco/fresco-ui/hooks/usePrevious';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

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
}: NodeDrawerProps) {
  const [internalExpanded, setInternalExpanded] = useState(nodes.length > 0);
  const isExpanded = expanded ?? internalExpanded;
  const setIsExpanded = onExpandedChange ?? setInternalExpanded;

  const hasNodes = nodes.length > 0;
  const isEmpty = !hasNodes;
  const canExpandWhenEmpty = !!dropTarget;

  const { dropProps, isOver, willAccept } = useDropTarget({
    id: 'node-drawer',
    accepts: dropTarget?.accepts ?? [],
    announcedName: dropTarget?.announcedName ?? 'Drawer',
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

  const handleLayoutAnimationComplete = useCallback(() => {
    setIsLayoutAnimating(false);
    setRemeasureKey((k) => k + 1);
  }, []);

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
        {/* Toggle button */}
        <motion.div layout="position" className="flex justify-center">
          <motion.button
            layout="position"
            type="button"
            onClick={() => {
              if (!isToggleDisabled) setIsExpanded(!isExpanded);
            }}
            disabled={isToggleDisabled}
            className={cx(
              'bg-surface publish-colors pointer-events-auto flex h-12 items-center gap-2 rounded-t-lg px-8 text-sm transition-colors',
              willAccept &&
                (isOver
                  ? activeDropTargetOverBackground
                  : activeDropTargetBackground),
              headingVariants({ level: 'label' }),
              isToggleDisabled && 'cursor-not-allowed opacity-50',
            )}
            data-zone-id={!isExpandedEffective ? dropZoneId : undefined}
            data-drop-target-valid={willAccept || undefined}
            data-drop-target-over={isOver || undefined}
            aria-label={
              isExpandedEffective ? 'Collapse drawer' : 'Expand drawer'
            }
            aria-expanded={isExpandedEffective}
          >
            <MotionChevron
              className="size-[1em]"
              animate={{ rotate: isExpandedEffective ? 0 : 180 }}
            />
            {nodes.length} unplaced
          </motion.button>
        </motion.div>

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
            orientation="horizontal"
            fade
            remeasureKey={remeasureKey}
            viewportClassName="flex items-center gap-4 p-4"
          >
            {isEmpty && canExpandWhenEmpty ? (
              // Matches the height of a drawer node so the empty drawer
              // expands to a full row.
              <div className="flex min-h-24 w-full items-center justify-center px-8 text-sm opacity-70">
                Drop here to remove
              </div>
            ) : (
              <AnimatePresence>
                {nodes.map((node) => (
                  <DrawerNode
                    key={node[entityPrimaryKeyProperty]}
                    node={node}
                    itemType={itemType}
                    onLayoutAnimationComplete={handleLayoutAnimationComplete}
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
