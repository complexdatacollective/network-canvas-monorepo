'use client';

import { EyeOff, LayoutTemplate } from 'lucide-react';
import {
  LayoutGroup,
  motion,
  useReducedMotion,
  type Variants,
} from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { Collection } from '@codaco/fresco-ui/collection/components/Collection';
import { CollectionFilterInput } from '@codaco/fresco-ui/collection/components/CollectionFilterInput';
import { ListLayout } from '@codaco/fresco-ui/collection/layout/ListLayout';
import type { ItemProps, Key } from '@codaco/fresco-ui/collection/types';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import InterfacePicture from '@codaco/interface-images/InterfacePicture';
import manifest, {
  type InterfaceType,
} from '@codaco/interface-images/manifest';

import { useCurrentStep } from '../contexts/CurrentStepContext';
import { getSkipMap } from '../selectors/skip-logic';
import type { NavigationOrientation } from '../Shell';
import { getProtocolStages } from '../store/modules/protocol';

type StagesMenuProps = {
  onSelect: (index: number) => void;
  orientation?: NavigationOrientation;
  /**
   * Whether the menu content should be shown. Toggling this drives the
   * staggered enter/exit of the timeline and stage cards; the host sets it
   * `true` once the drawer has finished opening and `false` to begin closing.
   */
  open: boolean;
  /**
   * Called once the exit animation has finished, so the host can dismiss the
   * drawer only after the cards have animated out.
   */
  onClosed: () => void;
};

type StageItem = {
  id: string;
  index: number;
  type: string;
  label: string;
  position: string;
  isCurrent: boolean;
  isSkipped: boolean;
};

const isInterfaceType = (type: string): type is InterfaceType =>
  Object.hasOwn(manifest, type);

const keyExtractor = (item: StageItem) => item.id;
const textValueExtractor = (item: StageItem) => item.label;

// Only begin filtering once more than one character has been typed.
const FILTER_MIN_QUERY_LENGTH = 2;
// Disable Fuse relevance scores so filtered results stay in stage order rather
// than being re-sorted by match quality.
const FILTER_FUSE_OPTIONS = { includeScore: false };
// Horizontal cards sit in a spaced row; the timeline segments bridge the gap
// (half of `gap-6` = `-left-3` / `-right-3`) so the line stays continuous.
const HORIZONTAL_GAP = 6;

// Timeline (line + numbered nodes) reveals as a directional "wipe"; the stage
// cards rise + fade in on a heavier spring. Keep the whole sequence bounded so a
// long protocol doesn't turn into a slideshow.
const WIPE_DURATION = 0.16;
const NODE_LEAD = 0.05;
const CONTENT_LEAD = 0.02;
const CARD_DURATION = 0.2;
const EXIT_DURATION = 0.1;
const EXIT_BUFFER = 0.04;

const clampStep = (base: number, count: number, maxWindow: number) =>
  count > 1 ? Math.min(base, maxWindow / (count - 1)) : 0;

type Steps = { wipe: number; content: number; exit: number };

type MenuVariants = {
  card: Variants;
  line: Variants;
  node: Variants;
  content: Variants;
};

const makeVariants = (
  orientation: NavigationOrientation,
  steps: Steps,
  reduce: boolean,
): MenuVariants => {
  const instant = { duration: 0 };
  const hidden = orientation === 'vertical' ? { scaleY: 0 } : { scaleX: 0 };
  const shown = orientation === 'vertical' ? { scaleY: 1 } : { scaleX: 1 };

  return {
    // The whole card fades as one unit, so the selected/hover background is
    // never visible ahead of the staggered reveal.
    card: {
      open: (i: number) => ({
        opacity: 1,
        transition: reduce
          ? instant
          : {
              delay: i * steps.content + CONTENT_LEAD,
              duration: CARD_DURATION,
              ease: 'easeOut',
            },
      }),
      closed: (i: number) => ({
        opacity: 0,
        transition: reduce
          ? instant
          : { delay: i * steps.exit, duration: EXIT_DURATION, ease: 'easeIn' },
      }),
    },
    line: {
      open: (i: number) => ({
        ...shown,
        transition: reduce
          ? instant
          : {
              delay: i * steps.wipe,
              duration: WIPE_DURATION,
              ease: 'easeInOut',
            },
      }),
      closed: (i: number) => ({
        ...hidden,
        transition: reduce
          ? instant
          : { delay: i * steps.exit, duration: EXIT_DURATION, ease: 'easeIn' },
      }),
    },
    node: {
      open: (i: number) => ({
        scale: 1,
        transition: reduce
          ? instant
          : {
              delay: i * steps.wipe + NODE_LEAD,
              duration: 0.26,
              ease: 'easeOut',
            },
      }),
      closed: (i: number) => ({
        scale: 0,
        transition: reduce
          ? instant
          : { delay: i * steps.exit, duration: EXIT_DURATION, ease: 'easeIn' },
      }),
    },
    content: {
      open: (i: number) => ({
        y: 0,
        transition: reduce
          ? instant
          : {
              delay: i * steps.content + CONTENT_LEAD,
              type: 'spring',
              stiffness: 220,
              damping: 20,
              mass: 1.1,
            },
      }),
      closed: (i: number) => ({
        y: reduce ? 0 : 16,
        transition: reduce
          ? instant
          : { delay: i * steps.exit, duration: EXIT_DURATION, ease: 'easeIn' },
      }),
    },
  };
};

export default function StagesMenu({
  onSelect,
  orientation = 'vertical',
  open,
  onClosed,
}: StagesMenuProps) {
  const stages = useSelector(getProtocolStages);
  const { displayedStep: currentStageIndex } = useCurrentStep();
  const skipMap = useSelector(getSkipMap);
  const reduceMotion = useReducedMotion() ?? false;

  const isHorizontal = orientation === 'horizontal';

  const layout = useMemo(
    () =>
      new ListLayout<StageItem>({
        gap: isHorizontal ? HORIZONTAL_GAP : 0,
        orientation,
      }),
    [orientation, isHorizontal],
  );

  const items = useMemo<StageItem[]>(
    () =>
      stages.map((stage, index) => ({
        id: stage.id,
        index,
        type: stage.type,
        label: stage.label.trim() ? stage.label : 'Untitled stage',
        position: String(index + 1),
        isCurrent: index === currentStageIndex,
        isSkipped: skipMap[index] === true,
      })),
    [stages, currentStageIndex, skipMap],
  );

  const currentId = items[currentStageIndex]?.id;

  const [matchingKeys, setMatchingKeys] = useState<Set<Key> | null>(null);
  const visibleItems = useMemo(
    () =>
      matchingKeys ? items.filter((item) => matchingKeys.has(item.id)) : items,
    [items, matchingKeys],
  );
  const positionById = useMemo(() => {
    const map = new Map<string, number>();
    visibleItems.forEach((item, index) => map.set(item.id, index));
    return map;
  }, [visibleItems]);

  const firstId = visibleItems.at(0)?.id;
  const lastId = visibleItems.at(-1)?.id;
  const count = visibleItems.length;

  const steps = useMemo<Steps>(
    () => ({
      wipe: clampStep(0.045, count, 0.33),
      content: clampStep(0.055, count, 0.4),
      exit: clampStep(0.02, count, 0.18),
    }),
    [count],
  );

  const variants = useMemo(
    () => makeVariants(orientation, steps, reduceMotion),
    [orientation, steps, reduceMotion],
  );

  // Signal the host once the staggered exit has played out, so the drawer only
  // slides away after the cards are gone. Timings are deterministic tweens on
  // exit, so a single timeout is enough. Keep dependencies to `open` alone: the
  // count/steps are read from refs so a mid-close filter change can't cancel
  // (and never re-arm) the pending timeout.
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const exitMsRef = useRef(0);
  exitMsRef.current = reduceMotion
    ? 0
    : (Math.max(0, count - 1) * steps.exit + EXIT_DURATION + EXIT_BUFFER) *
      1000;
  const prevOpen = useRef(open);
  useEffect(() => {
    const wasOpen = prevOpen.current;
    prevOpen.current = open;
    if (wasOpen && !open) {
      const id = setTimeout(() => onClosedRef.current(), exitMsRef.current);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [open]);

  const handleSelectionChange = (keys: Set<Key>) => {
    const [key] = keys;
    if (key === undefined) {
      return;
    }
    const item = items.find((candidate) => candidate.id === key);
    if (item) {
      onSelect(item.index);
    }
  };

  const animate = open ? 'open' : 'closed';

  const renderItem = (item: StageItem, itemProps: ItemProps) => {
    const isFirst = item.id === firstId;
    const isLast = item.id === lastId;
    const isOnly = isFirst && isLast;
    const custom = positionById.get(item.id) ?? item.index;

    const picture = isInterfaceType(item.type) ? (
      <InterfacePicture
        type={item.type}
        ratio="4:3"
        sizes={isHorizontal ? '8rem' : '6rem'}
        alt=""
        className="size-full object-cover"
      />
    ) : (
      <span className="flex size-full items-center justify-center bg-black/20">
        <LayoutTemplate className="size-6 opacity-40" />
      </span>
    );

    const node = (
      <motion.span
        aria-hidden
        variants={variants.node}
        custom={custom}
        initial="closed"
        animate={animate}
        className="bg-neon-coral relative z-10 flex size-8 items-center justify-center rounded-full text-xs font-bold text-white tabular-nums"
      >
        {item.position}
      </motion.span>
    );

    const label = (
      <motion.span
        variants={variants.content}
        custom={custom}
        initial="closed"
        animate={animate}
        className={cx(
          'text-sm font-bold wrap-break-word',
          isHorizontal ? 'line-clamp-2 text-center' : 'min-w-0 flex-1',
        )}
      >
        {item.label}
      </motion.span>
    );

    const image = (
      <motion.span
        variants={variants.content}
        custom={custom}
        initial="closed"
        animate={animate}
        className={cx(
          'relative block shrink-0 overflow-hidden rounded-xs [&>picture]:block [&>picture]:size-full',
          isHorizontal ? 'aspect-4/3 w-full' : 'aspect-4/3 w-24',
        )}
      >
        {picture}
        {item.isSkipped && (
          <span
            role="img"
            aria-label="Skipped"
            className="bg-surface/85 text-text elevation-low absolute top-1 right-1 flex size-6 items-center justify-center rounded-full backdrop-blur-sm"
          >
            <EyeOff className="size-3.5" aria-hidden />
          </span>
        )}
      </motion.span>
    );

    if (isHorizontal) {
      return (
        <motion.button
          {...itemProps}
          type="button"
          aria-current={item.isCurrent ? 'step' : undefined}
          layoutId={`stage-menu-${item.id}`}
          variants={variants.card}
          custom={custom}
          initial="closed"
          animate={animate}
          className={cx(
            // No horizontal padding on the button itself: the timeline band is
            // full width so adjacent cards' segments meet with no gap. The
            // image/label get their own padding via the inner wrapper.
            'focusable relative flex w-36 flex-col items-center gap-3 rounded-sm py-4 text-center transition-colors',
            'data-selected:bg-primary data-selected:text-primary-contrast',
            'hover:bg-accent data-focused:bg-accent',
          )}
        >
          <span className="relative flex h-8 w-full items-center justify-center">
            <motion.span
              aria-hidden
              variants={variants.line}
              custom={custom}
              initial="closed"
              animate={animate}
              className={cx(
                'bg-neon-coral pointer-events-none absolute top-1/2 h-1 origin-left -translate-y-1/2',
                isOnly
                  ? 'hidden'
                  : isFirst
                    ? '-right-3 left-1/2'
                    : isLast
                      ? 'right-1/2 -left-3'
                      : '-inset-x-3',
              )}
            />
            {node}
          </span>
          <span className="flex w-full flex-col items-center gap-3 px-3">
            {image}
            {label}
          </span>
        </motion.button>
      );
    }

    return (
      <motion.button
        {...itemProps}
        type="button"
        aria-current={item.isCurrent ? 'step' : undefined}
        layoutId={`stage-menu-${item.id}`}
        variants={variants.card}
        custom={custom}
        initial="closed"
        animate={animate}
        className={cx(
          'focusable relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
          'data-selected:bg-primary data-selected:text-primary-contrast',
          'hover:bg-accent data-focused:bg-accent',
        )}
      >
        <motion.span
          aria-hidden
          variants={variants.line}
          custom={custom}
          initial="closed"
          animate={animate}
          className={cx(
            'bg-neon-coral pointer-events-none absolute left-8 w-1 origin-top -translate-x-1/2',
            isOnly
              ? 'hidden'
              : isFirst
                ? 'top-1/2 bottom-0'
                : isLast
                  ? 'top-0 bottom-1/2'
                  : 'inset-y-0',
          )}
        />
        {node}
        {image}
        {label}
      </motion.button>
    );
  };

  return (
    <LayoutGroup>
      <Collection
        items={items}
        keyExtractor={keyExtractor}
        textValueExtractor={textValueExtractor}
        layout={layout}
        renderItem={renderItem}
        animate={false}
        orientation={orientation}
        selectionMode="single"
        defaultSelectedKeys={currentId !== undefined ? [currentId] : []}
        onSelectionChange={handleSelectionChange}
        filterKeys={['label', 'position']}
        filterDebounceMs={0}
        filterMinQueryLength={FILTER_MIN_QUERY_LENGTH}
        filterFuseOptions={FILTER_FUSE_OPTIONS}
        onFilterChange={(query) => {
          if (query.length < FILTER_MIN_QUERY_LENGTH) {
            setMatchingKeys(null);
          }
        }}
        onFilterResultsChange={(keys) => setMatchingKeys(keys)}
        aria-label="Stages"
        className="min-h-0 flex-1"
        viewportClassName={isHorizontal ? 'px-6 py-6' : 'py-4'}
        emptyState={
          <Paragraph margin="none" className="text-text/70 p-8 text-sm">
            Nothing matched your search term.
          </Paragraph>
        }
      >
        {(CollectionElements) => (
          <div
            className={cx('flex flex-col', isHorizontal ? 'min-h-0' : 'h-full')}
          >
            {CollectionElements}
            <div className="border-text/10 shrink-0 border-t p-4">
              <CollectionFilterInput
                placeholder="Filter..."
                size="sm"
                showResultCount={false}
              />
            </div>
          </div>
        )}
      </Collection>
    </LayoutGroup>
  );
}
