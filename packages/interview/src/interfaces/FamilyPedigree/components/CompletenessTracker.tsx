'use client';

import { Check } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef } from 'react';

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
 * of what is still needed. Pressing Next before it is full opens the list.
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
  const panelRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);

  const fraction = progress.total === 0 ? 1 : progress.done / progress.total;
  const complete = progress.items.length === 0;

  // Opening moves focus into the list, so it is read out wherever it was
  // opened from (the ring, or the Next button); closing returns to the ring.
  useEffect(() => {
    if (open && !wasOpen.current) panelRef.current?.focus();
    if (!open && wasOpen.current) ringRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const transition = reduceMotion ? { duration: 0 } : SPRING;

  return (
    <motion.div
      layout
      transition={transition}
      className={cx(
        'bg-surface-1 publish-colors text-text elevation-high absolute bottom-6 left-6 z-20 overflow-hidden',
        open && 'w-96 max-w-[calc(100%-3rem)]',
      )}
      style={{ borderRadius: open ? 12 : 9999 }}
      data-testid="pedigree-completeness"
    >
      {open ? (
        <motion.div
          ref={panelRef}
          role="region"
          aria-labelledby={titleId}
          tabIndex={-1}
          layout="position"
          className="flex flex-col gap-3 p-4 outline-none"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              onOpenChange(false);
            }
          }}
        >
          <div className="flex items-start gap-3">
            <ProgressRing fraction={fraction} size="sm" />
            <p id={titleId} className="flex-1 self-center font-semibold">
              <AppMessage
                message={
                  complete ? messages.trackerComplete : messages.trackerTitle
                }
              />
            </p>
            <CloseButton
              title={intl.formatMessage(messages.trackerClose)}
              onClick={() => onOpenChange(false)}
            />
          </div>
          {!complete && (
            <ul className="ml-13 flex flex-col gap-2">
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
            <p className="ml-13 text-sm opacity-80">
              <AppMessage message={messages.trackerRecommendedNote} />
            </p>
          )}
        </motion.div>
      ) : (
        <motion.button
          ref={ringRef}
          layout="position"
          type="button"
          aria-expanded={false}
          aria-label={intl.formatMessage(messages.trackerProgressLabel, {
            complete: complete ? 'true' : 'false',
            percent: fraction,
          })}
          className="focusable flex rounded-full p-2"
          onClick={() => onOpenChange(true)}
        >
          <ProgressRing fraction={fraction} size="lg" />
        </motion.button>
      )}
    </motion.div>
  );
}
