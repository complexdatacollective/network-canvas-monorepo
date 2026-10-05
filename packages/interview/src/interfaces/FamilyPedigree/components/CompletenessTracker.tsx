'use client';

import { Check } from 'lucide-react';
import { type Ref, useEffect, useId, useRef, useState } from 'react';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import {
  defineToolbarChild,
  ToolbarButton,
  ToolbarPopover,
} from '@codaco/fresco-ui/SegmentedToolbar';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';

import type { CompletenessItem, CompletenessProgress } from '../completeness';
import { messages } from '../messages';
import type { Family } from '../model';

type CompletenessTrackerProps = {
  progress: CompletenessProgress;
  enforcement: 'required' | 'recommended';
  /** The list is pinned open, by a click on the ring or by pressing Next. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  family: Family;
  displayName: (personId: string) => string;
  onItemSelect: (item: CompletenessItem) => void;
  /** Forwarded to the ring, the toolbar's control. */
  ref?: Ref<HTMLButtonElement>;
};

const ITEM_MESSAGES = {
  parents: messages.itemParents,
  siblings: messages.itemSiblings,
  children: messages.itemChildren,
  details: messages.itemDetails,
};

/** A ring that fills as the family nears completion, with the percentage in
 * its middle, or a tick once complete. It fills its button to the edge. */
function ProgressRing({ fraction }: { fraction: number }) {
  const intl = useAppIntl();
  const strokeWidth = 3.5;
  // The stroke's outer edge meets the edge of the 40-unit view box.
  const radius = 20 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const complete = fraction >= 1;
  return (
    <span className="relative inline-flex size-full items-center justify-center">
      <svg viewBox="0 0 40 40" className="size-full -rotate-90" aria-hidden>
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-current opacity-20"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className={cx(
            'transition-[stroke-dashoffset] duration-500',
            complete ? 'stroke-success' : 'stroke-primary',
          )}
        />
      </svg>
      {complete ? (
        <Check
          aria-hidden
          className="text-success absolute size-8 stroke-[4px]"
        />
      ) : (
        <span
          aria-hidden
          className="absolute text-sm font-semibold tabular-nums"
        >
          {intl.formatNumber(fraction, {
            style: 'percent',
            maximumFractionDigits: 0,
          })}
        </span>
      )}
    </span>
  );
}

/**
 * Progress towards the family the researcher requires, as a ring in the
 * stage's toolbar. Hovering or focusing it shows a short list of what is
 * still needed in a popover; clicking it, or pressing Next before the family
 * is complete, pins the list open.
 */
function CompletenessTracker({
  progress,
  enforcement,
  open,
  onOpenChange,
  family,
  displayName,
  onItemSelect,
  ref,
}: CompletenessTrackerProps) {
  const intl = useAppIntl();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The list shows while it is pinned, while the mouse is over the ring or
  // the list, or while keyboard focus is on either. Closing it hides it
  // until both the pointer and focus have left, so it does not spring
  // straight back.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [suppressed, setSuppressed] = useState(false);
  // Read from timers and handlers that outlive the render they came from.
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
  hoveredRef.current = hovered;
  focusedRef.current = focused;
  const expanded = !suppressed && (open || hovered || focused);

  // Leaving waits a moment, so the pointer can cross the gap between the
  // ring and the list.
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(leaveTimer.current), []);
  const pointerEnter = (event: React.PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    clearTimeout(leaveTimer.current);
    setHovered(true);
  };
  const pointerLeave = (event: React.PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      setHovered(false);
      if (!focusedRef.current) setSuppressed(false);
    }, 200);
  };

  const isInside = (element: EventTarget | null) =>
    element instanceof Node &&
    (triggerRef.current?.contains(element) === true ||
      popupRef.current?.contains(element) === true);
  // Tabbing from the ring into the list passes through the popover's focus
  // guards, outside both, so wait for focus to settle before deciding it has
  // left.
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(blurTimer.current), []);
  const blur = () => {
    clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => {
      if (isInside(document.activeElement)) return;
      setFocused(false);
      if (!hoveredRef.current) setSuppressed(false);
    }, 0);
  };

  // Pinning it (from the ring, or the Next button) moves focus into the list,
  // so it is read out: at once when the list already shows, or else as the
  // popover opens (its content cannot take focus before it is positioned).
  const focusListOnOpen = useRef(false);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setSuppressed(false);
      focusListOnOpen.current = true;
      listRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  const fraction = progress.total === 0 ? 1 : progress.done / progress.total;
  const complete = progress.items.length === 0;

  return (
    <ToolbarPopover
      ref={ref}
      open={expanded}
      onOpenChange={(next, details) => {
        // A press on the ring while the list shows only from hover or focus
        // pins it, rather than closing it.
        if (next || (details.reason === 'trigger-press' && !open)) {
          setSuppressed(false);
          onOpenChange(true);
          return;
        }
        // Kept closed while the pointer or focus stays on the ring or list;
        // closed from elsewhere (pressing Next again), nothing holds it.
        setSuppressed(hoveredRef.current || focusedRef.current);
        onOpenChange(false);
      }}
      trigger={
        <ToolbarButton
          ref={triggerRef}
          aria-label={intl.formatMessage(messages.trackerProgressLabel, {
            complete: complete ? 'true' : 'false',
            percent: fraction,
          })}
          className="aspect-square w-16 p-0!"
          data-testid="pedigree-completeness"
          onPointerEnter={pointerEnter}
          onPointerLeave={pointerLeave}
          onFocus={(event) => {
            if (!event.currentTarget.matches(':focus-visible')) return;
            setFocused(true);
            // Arriving from elsewhere, rather than back from the list after
            // closing it, shows the list again.
            if (!isInside(event.relatedTarget)) setSuppressed(false);
          }}
          onBlur={blur}
        >
          <ProgressRing fraction={fraction} />
        </ToolbarButton>
      }
      contentProps={{
        side: 'top',
        className: 'w-96 max-w-[calc(100vw-2rem)]',
        ref: popupRef,
        // Focus stays where it is when the list opens from hover or focus.
        initialFocus: () => {
          const focusList = focusListOnOpen.current;
          focusListOnOpen.current = false;
          return focusList ? listRef.current : false;
        },
        finalFocus: () =>
          popupRef.current?.contains(document.activeElement) === true
            ? triggerRef.current
            : false,
        onPointerEnter: pointerEnter,
        onPointerLeave: pointerLeave,
        onFocus: () => setFocused(true),
        onBlur: blur,
      }}
    >
      <div className="flex flex-col gap-3">
        <Heading id={titleId} level="h4" margin="none">
          <AppMessage
            message={
              complete ? messages.trackerComplete : messages.trackerTitle
            }
          />
        </Heading>
        {!complete && (
          <div
            ref={listRef}
            role="region"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="flex flex-col gap-3 outline-none"
          >
            <ul className="flex flex-col gap-2">
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
            {enforcement === 'recommended' && (
              <p className="text-sm opacity-80">
                <AppMessage message={messages.trackerRecommendedNote} />
              </p>
            )}
          </div>
        )}
      </div>
    </ToolbarPopover>
  );
}

export default defineToolbarChild(CompletenessTracker);
