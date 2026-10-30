'use client';

import { EyeOff, RouteOff } from 'lucide-react';
import { motion, type Variants } from 'motion/react';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Collection } from '@codaco/fresco-ui/collection/components/Collection';
import { CollectionFilterInput } from '@codaco/fresco-ui/collection/components/CollectionFilterInput';
import { ListLayout } from '@codaco/fresco-ui/collection/layout/ListLayout';
import type { ItemProps, Key } from '@codaco/fresco-ui/collection/types';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import { StageTypeBadge } from '@codaco/fresco-ui/stages/StageTypeBadge';
import { stageColorStyle } from '@codaco/fresco-ui/stages/stageTypes';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { type CSSVariablesStyle } from '@codaco/fresco-ui/utils/cssVariables';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { useCurrentStep } from '../contexts/CurrentStepContext';
import { runtimeMessages as messages } from '../i18n/runtimeMessages';
import { useResolveLocalizedString } from '../localization/ProtocolLocalizationProvider';
import {
  getSkipMap,
  getStageAvailabilityMap,
  type StageAvailability,
} from '../selectors/skip-logic';
import type { NavigationOrientation } from '../Shell';
import { getStages } from '../store/modules/protocol';

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
  /** The stage's name as the participant reads it. */
  label: string;
  position: string;
  isCurrent: boolean;
  isUnavailable: boolean;
  availability: StageAvailability;
};

// Stable id for the listbox so the host drawer can move initial focus onto it
// when the menu opens (the collection then focuses the current stage).
export const STAGES_MENU_LIST_ID = 'stages-menu-list';

const keyExtractor = (item: StageItem) => item.id;
const textValueExtractor = (item: StageItem) => item.label;

// Only begin filtering once more than one character has been typed.
const FILTER_MIN_QUERY_LENGTH = 2;
// Disable Fuse relevance scores so filtered results stay in stage order rather
// than being re-sorted by match quality.
const FILTER_FUSE_OPTIONS = { includeScore: false };
// Horizontal cards sit in a spaced row; the timeline segments bridge the gap
// (half of `gap-6` = `-inset-x-3`) so the line stays continuous.
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
  const intl = useAppIntl();
  const resolve = useResolveLocalizedString();
  const stages = useSelector(getStages);
  const { displayedStep: currentStageIndex } = useCurrentStep();
  const availabilityMap = useSelector(getStageAvailabilityMap);
  const skipMap = useSelector(getSkipMap);
  const reduceMotion = usePrefersReducedMotion() ?? false;

  const isHorizontal = orientation === 'horizontal';

  const layout = useMemo(
    () =>
      new ListLayout<StageItem>({
        gap: isHorizontal ? HORIZONTAL_GAP : 0,
        orientation,
      }),
    [orientation, isHorizontal],
  );

  // Finish stages are left out: a participant reaches the end of the
  // interview with Next, and a review never goes there.
  const items = useMemo<StageItem[]>(
    () =>
      stages.flatMap((stage, index) => {
        if (stage.type === 'FinishSession') return [];
        const label = resolve(stage.label).text;
        return [
          {
            id: stage.id,
            index,
            type: stage.type,
            label,
            position: intl.formatNumber(index + 1, { useGrouping: false }),
            isCurrent: index === currentStageIndex,
            isUnavailable: skipMap[index] === true,
            availability: availabilityMap[index] ?? { kind: 'available' },
          },
        ];
      }),
    [stages, currentStageIndex, availabilityMap, skipMap, intl, resolve],
  );

  const currentId = items.find((item) => item.isCurrent)?.id;

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

  // Each stage's stretch of line takes the previous visible stage's colour up
  // to its stop, as on the start screen's timeline.
  const previousTypeById = useMemo(() => {
    const map = new Map<string, string>();
    visibleItems.forEach((item, index) => {
      const previous = visibleItems[index - 1];
      if (previous) map.set(item.id, previous.type);
    });
    return map;
  }, [visibleItems]);

  const firstId = visibleItems.at(0)?.id;
  const lastId = visibleItems.at(-1)?.id;
  const count = visibleItems.length;

  const steps = useMemo<Steps>(
    () => ({
      wipe: clampStep(0.07, count, 0.5),
      content: clampStep(0.09, count, 0.65),
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
  // exit time and callback are read through effect events so a mid-close
  // filter change can't cancel (and never re-arm) the pending timeout.
  const exitMs = reduceMotion
    ? 0
    : (Math.max(0, count - 1) * steps.exit + EXIT_DURATION + EXIT_BUFFER) *
      1000;
  const readExitMs = useEffectEvent(() => exitMs);
  const notifyClosed = useEffectEvent(() => onClosed());
  const prevOpen = useRef(open);
  useEffect(() => {
    const wasOpen = prevOpen.current;
    prevOpen.current = open;
    if (wasOpen && !open) {
      const id = setTimeout(() => notifyClosed(), readExitMs());
      return () => clearTimeout(id);
    }
    return undefined;
  }, [open]);

  // Centre the current stage when the menu opens. The collection's own focus
  // scroll only brings it to the nearest edge, which leaves an end stage flush
  // against the edge; a frame later we recentre it.
  useEffect(() => {
    if (!open || currentId === undefined) return undefined;
    const id = requestAnimationFrame(() => {
      document
        .getElementById(`${STAGES_MENU_LIST_ID}-item-${currentId}`)
        ?.scrollIntoView(
          isHorizontal
            ? { inline: 'center', block: 'nearest' }
            : { block: 'center', inline: 'nearest' },
        );
    });
    return () => cancelAnimationFrame(id);
  }, [open, currentId, isHorizontal]);

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

  // `initial` matches `animate`, so the staggered reveal only plays on the
  // open→"open" transition — cards that mount later (as filter results change)
  // appear instantly rather than replaying the entrance.
  const animate = open ? 'open' : 'closed';

  const renderItem = (item: StageItem, itemProps: ItemProps) => {
    const isFirst = item.id === firstId;
    const isLast = item.id === lastId;
    const custom = positionById.get(item.id) ?? item.index;
    const previousType = previousTypeById.get(item.id);

    // This stage's stretch of the line: the previous stage's colour up to the
    // stop, this stage's after it. The ends of the list leave their outer
    // half empty.
    const segmentStyle: CSSVariablesStyle = {
      '--segment-before':
        isFirst || previousType === undefined
          ? 'transparent'
          : stageColorStyle(previousType).color,
      '--segment-after': isLast
        ? 'transparent'
        : stageColorStyle(item.type).color,
    };

    const availabilityStatus =
      item.availability.kind === 'available'
        ? null
        : item.availability.kind === 'bypassed'
          ? intl.formatMessage(messages.outsideCurrentPath)
          : intl.formatMessage(messages.hiddenByAnswers);
    const AvailabilityIcon =
      item.availability.kind === 'bypassed' ? RouteOff : EyeOff;

    const line = (
      <motion.span
        aria-hidden
        variants={variants.line}
        custom={custom}
        initial={animate}
        animate={animate}
        style={segmentStyle}
        className={cx(
          'pointer-events-none absolute from-(--segment-before) from-50% to-(--segment-after) to-50%',
          isHorizontal
            ? '-inset-x-3 top-1/2 h-2.5 origin-left -translate-y-1/2 bg-linear-to-r rtl:origin-right rtl:bg-linear-to-l'
            : 'inset-y-0 inset-s-1/2 w-2.5 origin-top -translate-x-1/2 bg-linear-to-b rtl:translate-x-1/2',
        )}
      />
    );

    const stop = (
      <motion.span
        aria-hidden
        variants={variants.node}
        custom={custom}
        initial={animate}
        animate={animate}
        className="relative flex"
      >
        <StageTypeBadge
          type={item.type}
          size="lg"
          ringed
          className={cx(item.isUnavailable && 'opacity-60')}
        />
        {item.isUnavailable && (
          <span className="bg-cerulean-blue elevation-low absolute -inset-e-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full text-white">
            <AvailabilityIcon className="size-3.5" />
          </span>
        )}
      </motion.span>
    );

    const number = (
      <span
        aria-hidden
        className="font-monospace text-text/60 text-xs tracking-widest tabular-nums"
      >
        {item.position}
      </span>
    );

    // The label sits on a card, as on the start screen's timeline, and the
    // card carries the current, hovered and focused states. The interface's
    // name is left off: it is the researcher's vocabulary, not the
    // participant's.
    const label = (
      <motion.span
        variants={variants.content}
        custom={custom}
        initial={animate}
        animate={animate}
        className={cx(
          'font-heading flex min-w-0 flex-col gap-1 rounded-[1.75rem] bg-white/8 px-5 py-3 text-base leading-tight font-extrabold wrap-break-word',
          'group-hover:bg-accent group-hover:text-accent-contrast group-data-focused:bg-accent group-data-focused:text-accent-contrast',
          'group-data-selected:bg-primary group-data-selected:text-primary-contrast',
          isHorizontal ? 'w-full items-center text-center' : 'flex-1',
        )}
      >
        <span className={isHorizontal ? 'line-clamp-2' : undefined}>
          {item.label}
        </span>
        {availabilityStatus && (
          <span className="font-body flex items-center gap-1 text-xs font-medium opacity-75">
            <AvailabilityIcon className="size-3.5 shrink-0" aria-hidden />
            <span>{availabilityStatus}</span>
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
          variants={variants.card}
          custom={custom}
          initial={animate}
          animate={animate}
          className={cx(
            // No horizontal padding on the button itself: the line runs the
            // full width so adjacent cards' stretches meet with no gap.
            'group focusable relative flex w-40 cursor-pointer flex-col items-center gap-2 rounded-sm py-3 text-center',
            // Edge spacing lives on the first/last card so it survives the
            // horizontal scroll — a scroll container's own end padding is
            // dropped from the scrollable area, flushing the last card to the
            // edge.
            isFirst && 'ms-6',
            isLast && 'me-6',
          )}
        >
          {number}
          <span className="relative flex w-full items-center justify-center py-1">
            {line}
            {stop}
          </span>
          <span className="flex w-full px-2">{label}</span>
        </motion.button>
      );
    }

    return (
      <motion.button
        {...itemProps}
        type="button"
        aria-current={item.isCurrent ? 'step' : undefined}
        variants={variants.card}
        custom={custom}
        initial={animate}
        animate={animate}
        className="group focusable relative flex w-full cursor-pointer items-center gap-3 px-4 text-start"
      >
        <span className="w-6 shrink-0 text-end">{number}</span>
        {/* The stop's column runs the row's full height, so the line inside
            it meets the next row's with no gap. */}
        <span className="relative flex shrink-0 items-center self-stretch py-4">
          {line}
          {stop}
        </span>
        <span className="flex min-w-0 flex-1 py-2">{label}</span>
      </motion.button>
    );
  };

  return (
    <Collection
      items={items}
      keyExtractor={keyExtractor}
      textValueExtractor={textValueExtractor}
      layout={layout}
      renderItem={renderItem}
      // Plain (unanimated) collection path: filter changes apply instantly with
      // no enter/exit/reposition animation. The open/close reveal is driven
      // separately by the per-item variants above.
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
      id={STAGES_MENU_LIST_ID}
      aria-label={intl.formatMessage(messages.interviewScreens)}
      className="min-h-0 flex-1"
      viewportClassName={isHorizontal ? 'py-6' : 'py-4'}
      emptyState={
        <Paragraph
          intent="smallText"
          margin="none"
          className="text-text/70 p-8"
        >
          <AppMessage message={messages.noSearchMatch} />
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
              placeholder={intl.formatMessage(messages.filter)}
              size="sm"
              showResultCount={false}
            />
          </div>
        </div>
      )}
    </Collection>
  );
}
