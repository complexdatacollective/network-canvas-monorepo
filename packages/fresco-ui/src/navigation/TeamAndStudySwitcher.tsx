'use client';

import { Select } from '@base-ui/react/select';
import { Check, ChevronDown, Plus, TriangleAlert } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { IdentityMark } from '../IdentityMark';
import { usePortalContainer } from '../PortalContainer';
import { Skeleton } from '../Skeleton';
import { cx } from '../utils/cva';

export type SwitcherStatus = 'ready' | 'loading' | 'failed';

export type SwitcherItem = {
  /** Stable id. Identifies the item to `onSelect` and colours its mark. */
  id: string;
  /** The entity's name, shown whole in the list and truncated in the trigger. */
  name: string;
  /** A secondary line under the name — a role, an owner, a count, a status. */
  meta?: string;
  /** A short status word shown as a chip — "Owner", "Draft". */
  badge?: string;
  /**
   * Replaces this one item's mark. A status pip for a study whose state
   * matters more than its identity, say. Takes precedence over `renderMark`.
   */
  leading?: ReactNode;
};

type SwitcherSegmentBase = {
  /**
   * The whole translated word above the name — "Team", "Study".
   *
   * A whole string, never assembled from fragments: it is half of the
   * trigger's accessible name, and a template would bake English word order
   * into every translation. It also labels the list's own group, so a reader
   * arriving in the list is told what the options ARE.
   */
  kicker: string;
  /** The entity being acted in, and its siblings. */
  items: ReadonlyArray<SwitcherItem>;
  /**
   * The entity being acted in. `undefined` — or an id no item names — leaves
   * the trigger showing `placeholder`, and leaves every option unselected.
   */
  currentId: string | undefined;
  /** Called with the chosen id. Never called for the id already current. */
  onSelect: (id: string) => void;
  /**
   * Stands in for the name when `currentId` names nothing in `items` — the
   * host's translated "Choose a team".
   */
  placeholder?: string;
  /** A trailing command under the list — "Create a team". */
  action?: { label: string; onSelect: () => void };
  /**
   * Replaces the default `IdentityMark` in both the trigger and the list — a
   * status pip, an avatar, or nothing at all. `item.leading` wins over it for
   * a single item.
   */
  renderMark?: (item: SwitcherItem) => ReactNode;
};

/**
 * A failed list has to offer a way out of the failure, so the retry and the
 * two strings that frame it are required exactly when the status can be
 * `'failed'` — which is to say, whenever a retry is not supplied, `'failed'`
 * is not an expressible status.
 *
 * Two members rather than one per status so a caller holding a status it
 * cannot narrow (`status={query.status}`) still type-checks: passing the
 * retry admits every status, and omitting it admits only the two that do not
 * need one.
 */
type SwitcherRecovery =
  | {
      status?: 'ready' | 'loading';
      onRetry?: undefined;
      failureMessage?: undefined;
      retryLabel?: undefined;
    }
  | {
      status?: SwitcherStatus;
      /** Re-runs whatever failed to produce `items`. */
      onRetry: () => void;
      /** Translated, and short: "Your teams could not be loaded." */
      failureMessage: string;
      /** Translated label for the retry command: "Try again". */
      retryLabel: string;
    };

export type SwitcherSegment = SwitcherSegmentBase & SwitcherRecovery;

export type TeamAndStudySwitcherProps = {
  /**
   * The outer segment: the team whose work is on screen. Omit it where there
   * is no team to name — a researcher who belongs to none, or a study
   * opened before its team is known.
   */
  team?: SwitcherSegment;
  /**
   * The inner segment: the study open inside that team. Omit it entirely
   * where none is — the control then draws as one segment rather than as two
   * with an empty compartment.
   */
  study?: SwitcherSegment;
  className?: string;
};

/**
 * Below this a segment keeps only its mark and its caret.
 *
 * A CONTAINER query, not a viewport breakpoint: this control sits in the app
 * header, and could sit in a narrow side panel or a dialog. What decides
 * whether the names fit is the width it was given, not the width of the
 * window.
 *
 * `sr-only` rather than `hidden`. The accessible-name algorithm skips hidden
 * nodes unless `aria-labelledby` references them directly, and while these
 * two spans ARE referenced directly, relying on that exception across engines
 * to keep a control named is not worth the risk. `sr-only` clips the text out
 * of the layout while leaving it rendered, so the name computes the same way
 * collapsed or not.
 */
const COLLAPSE_CLASS = '@max-[34rem]:sr-only';

/**
 * A floor and a cap that step up together, so a segment neither collapses onto
 * a two-character name nor eats the header with a long one. The skeleton fills
 * the same floor, which is what keeps the header from reflowing when the name
 * arrives.
 */
const NAME_WIDTH_CLASS = cx(
  'max-w-[10rem] min-w-[6rem]',
  '@min-[48rem]:max-w-[14rem]',
  '@min-[64rem]:max-w-[18rem]',
);

/**
 * A segment's face.
 *
 * **No radius of its own, deliberately.** The frame around the segments clips,
 * so a segment paints a plain rectangle and the frame decides where the
 * corners are. Giving the segment a radius too is what used to leave a thin
 * crescent between its surface and the border: a 14px curve painted inside the
 * 13px curve of a 1px border does not follow it, and the mismatch showed
 * wherever a segment was hovered or open.
 *
 * The focus ring is drawn INSIDE for the same reason. `focus-styles` offsets
 * the outline 3px outwards, which is precisely what the frame would clip, so
 * the offset is inverted here and the ring hugs the inside of the segment.
 *
 * `not-data-popup-open:` rather than source order on the hover rule. Both are
 * single-class selectors, so which one wins is decided by Tailwind's own
 * emission order and not by the order they are written in here; excluding the
 * open state from the hover rule makes the outcome independent of that.
 */
const SEGMENT_CLASS = cx(
  'flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-2',
  'bg-input text-input-contrast text-start transition-colors',
  'focusable focus-visible:outline-offset-[-3px]',
  'not-data-popup-open:hover:bg-input-contrast/8',
  'data-popup-open:bg-selected data-popup-open:text-selected-contrast',
);

/**
 * The rows under a list — the retry and the action. They are plain buttons
 * outside `Select.List`, so they carry their own hover and focus treatment
 * rather than Base UI's `data-highlighted`, which only the options get.
 */
const ROW_CLASS = cx(
  'flex w-full cursor-pointer items-center gap-3 rounded-xs px-2 py-1.5',
  'text-start transition-colors outline-none',
  'focusable hover:bg-surface-2 hover:text-surface-2-contrast',
  'focus-visible:bg-surface-2 focus-visible:text-surface-2-contrast',
);

/** A rule between a list and the rows that follow it. */
const SEPARATOR_CLASS = 'border-outline my-1 border-t';

function markFor(
  item: SwitcherItem,
  renderMark: SwitcherSegment['renderMark'],
  size: 'sm' | 'md',
): ReactNode {
  if (item.leading !== undefined) return item.leading;
  if (renderMark) return renderMark(item);
  return <IdentityMark id={item.id} name={item.name} size={size} />;
}

/**
 * One segment of the control. Private on purpose: a team switcher and a
 * study switcher are the same control with different words, and exporting
 * this would invite a second, differently-behaved arrangement of them.
 */
function Segment({
  divided,
  segment,
}: {
  /** Draws the rule that separates this segment from the one before it. */
  divided: boolean;
  segment: SwitcherSegment;
}) {
  const {
    action,
    currentId,
    failureMessage,
    items,
    kicker,
    onRetry,
    onSelect,
    placeholder,
    renderMark,
    retryLabel,
    status = 'ready',
  } = segment;
  const kickerId = useId();
  const nameId = useId();
  const failureId = useId();
  const portalContainer = usePortalContainer();

  /*
    Open state is held here rather than left to Base UI because the rows
    beneath the list are ours: a plain button does not close the popup the way
    a `Select.Item` does, and a retry that leaves the popup standing over the
    list it is refreshing is worse than no retry.
  */
  const [open, setOpen] = useState(false);

  const current = items.find((item) => item.id === currentId);
  const failed = status === 'failed';
  const loading = status === 'loading';

  // What the list is for. Any one of these is enough to make opening it worth
  // a tab stop; none of them means the segment is a label in a frame.
  const hasList = failed || action !== undefined || items.length > 1;

  const face = (
    <>
      {loading ? (
        // The mark's own space, reserved with it: a segment that gains a tile
        // when the name arrives shifts the whole header sideways, which is the
        // reflow the skeleton exists to prevent.
        <Skeleton className="size-8 shrink-0 rounded-xs" />
      ) : current ? (
        markFor(current, renderMark, 'md')
      ) : null}
      <span className={cx('flex min-w-0 flex-col items-start', COLLAPSE_CLASS)}>
        <span
          id={kickerId}
          className="text-2xs leading-tight font-semibold uppercase opacity-70"
        >
          {kicker}
        </span>
        <span
          id={nameId}
          title={current?.name}
          className={cx(
            'truncate text-sm leading-tight font-semibold',
            NAME_WIDTH_CLASS,
          )}
        >
          {loading ? (
            <Skeleton className="inline-block h-[0.9em] w-full rounded-xs align-middle" />
          ) : (
            (current?.name ?? placeholder)
          )}
        </span>
      </span>
      {hasList ? (
        <ChevronDown aria-hidden data-caret className="shrink-0 opacity-70" />
      ) : null}
    </>
  );

  const divider = divided ? 'border-outline border-s' : undefined;

  if (!hasList) {
    return (
      /*
        Not a button and not focusable: there is nothing to activate. The two
        spans are read in document order, so no `aria-labelledby` is needed
        here — that wiring exists on the interactive segment only because a
        control's name is COMPUTED rather than read.
      */
      <span
        data-switcher-segment
        className={cx(
          'bg-input text-input-contrast flex min-w-0 flex-1 items-center gap-2 px-3 py-2',
          divider,
        )}
        aria-busy={loading || undefined}
      >
        {face}
      </span>
    );
  }

  const closeThen = (run: () => void) => () => {
    setOpen(false);
    run();
  };

  return (
    <Select.Root
      value={currentId ?? null}
      open={open}
      onOpenChange={setOpen}
      onValueChange={(value: unknown) => {
        // Base UI reports every press, the already-selected one included.
        // Re-selecting where you already are is not a switch, and in a
        // router-driven host it would be a redundant navigation.
        if (typeof value !== 'string' || value === currentId) return;
        onSelect(value);
      }}
    >
      <Select.Trigger
        /*
          Marks what IS a segment. `Select` renders a hidden form control
          beside its trigger, so counting the frame's children counts those
          too — this is what lets a caller (or a test) ask how many segments
          are drawn and get the number a reader would see.
        */
        data-switcher-segment
        className={cx(SEGMENT_CLASS, divider)}
        aria-busy={loading || undefined}
        /*
          A whole translated word and a datum, joined into "Team SONIC Lab" by
          the accessible-name algorithm rather than by JavaScript. An
          `aria-label` would REPLACE the visible name instead of qualifying it,
          and a template string would bake English word order into the name.

          Referenced by id rather than left to the control's own contents: text
          concatenation inserts a space only between BLOCK-level children, and
          these two are inline, so the computed name would read "TeamSONIC
          Lab". Multiple `aria-labelledby` references are always joined with a
          space.
        */
        aria-labelledby={`${kickerId} ${nameId}`}
      >
        {face}
      </Select.Trigger>
      <Select.Portal container={portalContainer ?? undefined}>
        <Select.Positioner
          /*
            Base UI's default overlaps the trigger so the selected item's text
            lands on the trigger's value text. That is right for a form field
            sitting in a column of fields, and wrong for a switcher in a
            header: the popup would cover the header it was opened from.
          */
          alignItemWithTrigger={false}
          side="bottom"
          align="start"
          sideOffset={8}
        >
          <Select.Popup
            className={cx(
              'bg-surface-popover text-surface-popover-contrast publish-colors',
              'border-outline elevation-high w-xs max-w-(--available-width)',
              'rounded border-2 p-1.5 outline-none',
            )}
          >
            {items.length > 0 && (
              <Select.List className="flex flex-col gap-0.5">
                {/*
                  A group so the kicker LABELS the options rather than floating
                  among them: `Select.GroupLabel` is associated with its group
                  automatically, so the reader is told these are teams, and the
                  heading is not itself announced as something to choose.
                */}
                <Select.Group>
                  <Select.GroupLabel className="text-2xs px-2 py-1 font-semibold uppercase opacity-70">
                    {kicker}
                  </Select.GroupLabel>
                  {items.map((item) => (
                    <Select.Item
                      key={item.id}
                      value={item.id}
                      // The name the list is matched on when the reader types,
                      // rather than the mark's monogram and the chip coming
                      // along with it.
                      label={item.name}
                      className={cx(
                        'flex cursor-pointer items-center gap-3 rounded-xs px-2 py-1.5',
                        'transition-colors outline-none select-none',
                        'not-data-selected:data-highlighted:bg-surface-2 not-data-selected:data-highlighted:text-surface-2-contrast',
                        'data-selected:bg-selected data-selected:text-selected-contrast',
                      )}
                    >
                      {markFor(item, renderMark, 'sm')}
                      {/* No truncation here, deliberately: the list is where a
                          name the trigger had to cut off can be read in full. */}
                      <Select.ItemText className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm leading-tight font-semibold">
                          {item.name}
                        </span>
                        {item.meta !== undefined && (
                          <span className="text-xs leading-tight opacity-70">
                            {item.meta}
                          </span>
                        )}
                      </Select.ItemText>
                      {item.badge !== undefined && (
                        /*
                          A filled chip rather than an outlined one, and at full
                          strength rather than dimmed: it has to read on two
                          different grounds — the popup surface, and
                          `--selected` on whichever row is current — and an
                          outline at 70% was faint on both.

                          `bg-current` tints with the row's OWN text colour, so
                          the chip follows the row it is on instead of being
                          pinned to one surface.
                        */
                        <span className="text-2xs shrink-0 rounded-full bg-current/15 px-2 py-0.5 font-semibold uppercase">
                          {item.badge}
                        </span>
                      )}
                      {/*
                        The tick's column is reserved by this wrapper rather
                        than by the indicator, which Base UI unmounts when the
                        item is not selected. Without it every name would shift
                        sideways as the selection moved.
                      */}
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        <Select.ItemIndicator>
                          <Check aria-hidden className="size-4" />
                        </Select.ItemIndicator>
                      </span>
                    </Select.Item>
                  ))}
                </Select.Group>
              </Select.List>
            )}
            {failed && onRetry && (
              <>
                {items.length > 0 && (
                  <Select.Separator className={SEPARATOR_CLASS} />
                )}
                {/*
                  `aria-describedby` rather than a group label: outside the
                  listbox there is no group to label, and a retry announced on
                  its own does not say what it is a retry FOR.
                */}
                <p
                  id={failureId}
                  className="text-destructive flex items-start gap-2 px-2 py-1 text-xs"
                >
                  <TriangleAlert
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0"
                  />
                  {failureMessage}
                </p>
                <button
                  type="button"
                  aria-describedby={failureId}
                  onClick={closeThen(onRetry)}
                  className={cx(ROW_CLASS, 'text-sm font-semibold')}
                >
                  {/*
                    The leading slot, kept empty. Every other row in the popup
                    opens with a tile — a mark, or the action's dashed square —
                    and a label that started 36px to the left of all of them
                    would read as a stray line of text rather than a row.
                  */}
                  <span aria-hidden className="size-6 shrink-0" />
                  {retryLabel}
                </button>
              </>
            )}
            {action && (
              <>
                {(items.length > 0 || failed) && (
                  <Select.Separator className={SEPARATOR_CLASS} />
                )}
                <button
                  type="button"
                  onClick={closeThen(action.onSelect)}
                  className={cx(
                    ROW_CLASS,
                    'opacity-70 hover:opacity-100 focus-visible:opacity-100',
                  )}
                >
                  {/*
                    A dashed tile where a mark would be, at the mark's own size:
                    the row lines up with the entities above it and still reads
                    as "make a new one" rather than "here is another one".
                  */}
                  <span className="border-outline flex size-6 shrink-0 items-center justify-center rounded-xs border-2 border-dashed">
                    <Plus aria-hidden className="size-3.5" />
                  </span>
                  <span className="text-sm font-semibold">{action.label}</span>
                </button>
              </>
            )}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

/**
 * Where a researcher is, and how they move: the team whose work is on screen,
 * and the study open inside it, as one control.
 *
 * ```tsx
 * <TeamAndStudySwitcher
 *   team={{ kicker: t('team'), items: teams, currentId: teamId, onSelect: goToTeam }}
 *   study={study && { kicker: t('study'), items: studies, currentId: study.id, onSelect: openStudy }}
 * />
 * ```
 *
 * **One component, not two composed ones.** The segments share a frame, and a
 * frame drawn by one component around controls drawn by another has to agree
 * with them about radius, height and where a painted surface stops — three
 * things that went wrong separately while this was a lockup wrapping generic
 * switchers. Here the frame and the segments are the same component's markup,
 * so they cannot disagree.
 *
 * **The frame clips; the segments have no corners.** The frame owns the border
 * and the radius and hides its overflow, so each segment paints a plain
 * rectangle into it and the corners come out right by construction rather than
 * by two radii being kept in step. The segments stretch rather than centring,
 * so a segment holding a 32px mark and one holding a status pip still meet the
 * frame top and bottom.
 *
 * **The study segment is absent, not empty.** Pass no `study` and the
 * control draws as one segment: there is no divider and no empty compartment,
 * because there is nothing there.
 *
 * **A listbox, not a menu.** Choosing which of several siblings you are acting
 * in is a selection, not a command, and Base UI's `Select` is the part built
 * for it: options inside a `listbox`, the current one `aria-selected`, and —
 * the reason for using it — opening lands the reader ON the current entity
 * rather than at the top.
 *
 * **A list of one is a dead end.** With nothing to switch to, no command and
 * no failure to retry, a segment renders inert: no caret, no list, and not in
 * the tab order.
 *
 * **A failed list is not an empty one.** On `status="failed"` the segment stays
 * exactly where it was — it must never silently vanish, which strands the
 * researcher with no way back — and the popup carries the failure and its
 * retry, alongside any items already in hand.
 *
 * The host must give this a width it does not derive from its contents: as a
 * block-level child that is automatic, and in a flex or grid row it means
 * `flex-1`, `w-full`, or a sized track. `container-type: inline-size` applies
 * inline-size containment, so an element that sized itself to its contents
 * would measure zero and hold every segment in its collapsed presentation.
 */
export function TeamAndStudySwitcher({
  className,
  team,
  study,
}: TeamAndStudySwitcherProps) {
  // Nothing to name is not an empty frame: a bordered box holding no segment
  // reads as a control that failed to load rather than as the absence of one.
  if (!team && !study) return null;

  return (
    <div className={cx('@container min-w-0', className)}>
      <div
        className={cx(
          'border-outline inline-flex max-w-full min-w-0 items-stretch',
          // The frame's whole job: one border, one radius, and the clip that
          // lets the segments inside it stay square.
          'overflow-hidden rounded-sm border',
        )}
      >
        {team && <Segment divided={false} segment={team} />}
        {study && <Segment divided={team !== undefined} segment={study} />}
      </div>
    </div>
  );
}
