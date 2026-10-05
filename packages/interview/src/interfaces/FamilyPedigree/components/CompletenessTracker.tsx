'use client';

import { Check } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import { cx } from '@codaco/fresco-ui/utils/cva';

import type { CompletenessItem, CompletenessProgress } from '../completeness';
import { messages } from '../messages';
import type { Family } from '../model';

type CompletenessTrackerProps = {
  progress: CompletenessProgress;
  enforcement: 'required' | 'recommended';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  family: Family;
  displayName: (personId: string) => string;
  onItemSelect: (item: CompletenessItem) => void;
};

const ITEM_MESSAGES = {
  parents: messages.itemParents,
  siblings: messages.itemSiblings,
  children: messages.itemChildren,
  details: messages.itemDetails,
};

const SPRING = { type: 'spring', stiffness: 500, damping: 40 } as const;

/** A ring that fills as the family nears completion. */
function ProgressRing({
  fraction,
  size,
}: {
  fraction: number;
  size: 'sm' | 'lg';
}) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const complete = fraction >= 1;
  return (
    <span
      className={cx(
        'relative inline-flex shrink-0 items-center justify-center',
        size === 'lg' ? 'size-16' : 'size-10',
      )}
    >
      <svg viewBox="0 0 40 40" className="size-full -rotate-90" aria-hidden>
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          strokeWidth="4"
          className="stroke-current opacity-20"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className={cx(
            'transition-[stroke-dashoffset] duration-500',
            complete ? 'stroke-success' : 'stroke-primary',
          )}
        />
      </svg>
      {complete && (
        <Check
          aria-hidden
          className={cx(
            'text-success absolute',
            size === 'lg' ? 'size-7' : 'size-5',
          )}
        />
      )}
    </span>
  );
}

/**
 * Progress towards the family the researcher requires, in the corner of the
 * stage: a ring that fills as people are added, expanding into a short list
 * of what is still needed when hovered, focused or clicked. Pressing Next
 * before it is full opens the list.
 */
export default function CompletenessTracker({
  progress,
  enforcement,
  open,
  onOpenChange,
  family,
  displayName,
  onItemSelect,
}: CompletenessTrackerProps) {
  const intl = useAppIntl();
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);

  // The list shows while it is open (pinned by a click or by pressing Next),
  // while the mouse is over it, or while focus is in it. Closing it hides it
  // until both the pointer and focus have left, so it does not spring
  // straight back.
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [suppressed, setSuppressed] = useState(false);
  // Read from timers and handlers that outlive the render they came from.
  const hoveredRef = useRef(false);
  const focusWithinRef = useRef(false);
  hoveredRef.current = hovered;
  focusWithinRef.current = focusWithin;
  const expanded = !suppressed && (open || hovered || focusWithin);

  // Leaving waits a moment, so brushing past the edge does not collapse it.
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  const fraction = progress.total === 0 ? 1 : progress.done / progress.total;
  const complete = progress.items.length === 0;

  // Opening it (from the ring, or the Next button) moves focus into the list,
  // so it is read out; closing it returns focus to the ring.
  useEffect(() => {
    if (open && !wasOpen.current) listRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const close = () => {
    setSuppressed(true);
    onOpenChange(false);
    ringRef.current?.focus();
  };

  const transition = reduceMotion ? { duration: 0 } : SPRING;

  return (
    <motion.div
      layout
      transition={transition}
      className={cx(
        'bg-surface-1 publish-colors text-text elevation-high absolute bottom-6 left-6 z-20 overflow-hidden',
        expanded && 'w-96 max-w-[calc(100%-3rem)]',
      )}
      style={{ borderRadius: expanded ? 12 : 9999 }}
      data-testid="pedigree-completeness"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse') return;
        clearTimeout(leaveTimer.current);
        setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return;
        clearTimeout(leaveTimer.current);
        leaveTimer.current = setTimeout(() => {
          setHovered(false);
          if (!focusWithinRef.current) setSuppressed(false);
        }, 200);
      }}
      onFocus={() => setFocusWithin(true)}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setFocusWithin(false);
        if (!hoveredRef.current) setSuppressed(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && expanded) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <div
        className={cx('flex items-center gap-2', expanded ? 'p-2 pr-3' : '')}
      >
        <motion.button
          ref={ringRef}
          layout="position"
          type="button"
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-label={intl.formatMessage(messages.trackerProgressLabel, {
            complete: complete ? 'true' : 'false',
            percent: fraction,
          })}
          className="focusable flex shrink-0 rounded-full p-2"
          onClick={() => {
            if (open) close();
            else {
              setSuppressed(false);
              onOpenChange(true);
            }
          }}
        >
          <ProgressRing fraction={fraction} size={expanded ? 'sm' : 'lg'} />
        </motion.button>
        {expanded && (
          <>
            <p id={titleId} className="flex-1 font-semibold">
              <AppMessage
                message={
                  complete ? messages.trackerComplete : messages.trackerTitle
                }
              />
            </p>
            <CloseButton
              title={intl.formatMessage(messages.trackerClose)}
              onClick={close}
            />
          </>
        )}
      </div>
      {expanded && (
        <motion.div
          ref={listRef}
          id={listId}
          role="region"
          aria-labelledby={titleId}
          tabIndex={-1}
          layout="position"
          className="flex flex-col gap-3 px-4 pb-4 outline-none"
        >
          {!complete && (
            <ul className="ml-14 flex flex-col gap-2">
              {progress.items.map((item) => (
                <li
                  key={`${item.kind}:${item.personId}`}
                  className="flex items-baseline gap-2"
                >
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 -translate-y-0.5 rounded-full bg-current"
                  />
                  <button
                    type="button"
                    className="focusable text-left underline-offset-4 hover:underline"
                    onClick={() => onItemSelect(item)}
                  >
                    {intl.formatMessage(ITEM_MESSAGES[item.kind], {
                      isYou: family.byId.get(item.personId)?.isEgo
                        ? 'true'
                        : 'false',
                      name: displayName(item.personId),
                      missing: item.kind === 'parents' ? item.missing : 0,
                    })}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!complete && enforcement === 'recommended' && (
            <p className="ml-14 text-sm opacity-80">
              <AppMessage message={messages.trackerRecommendedNote} />
            </p>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
