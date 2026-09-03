'use client';

import { Select } from '@base-ui/react/select';
import { Check, ChevronDown, Plus, TriangleAlert } from 'lucide-react';
import {
  cloneElement,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { IdentityMark } from '../IdentityMark';
import { usePortalContainer } from '../PortalContainer';
import { Skeleton } from '../Skeleton';
import { cx } from '../utils/cva';

export type SwitcherStatus = 'ready' | 'loading' | 'failed';

export type SwitcherItem = {
  /** Stable id. Identifies the item to `onSelect` and colours its mark. */
  id: string;
  /** The entity's name. */
  name: string;
  /** A secondary line under the name — a role, an owner, a count, a status. */
  meta?: string;
  /** A short status word shown as a chip — "Owner", "Draft". */
  badge?: string;
  /** Replaces this one item's mark. Takes precedence over `renderMark`. */
  leading?: ReactNode;
};

type SwitcherSegmentBase = {
  /**
   * The whole translated word above the name — "Team", "Study". A whole
   * string, never assembled from fragments: it is half of the trigger's
   * accessible name, and it labels the list's own group.
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
  /** Stands in for the name when `currentId` names nothing in `items`. */
  placeholder?: string;
  /**
   * The row under the list, as either a destination or a command.
   *
   * A destination passes `render` — a router link element, cloned here with
   * the row's styling — so it stays a real link: openable in a new tab,
   * copyable, and announced as a link. A command passes `onSelect` and gets a
   * button, because there is nowhere to go until it has run.
   */
  action?:
    | {
        label: string;
        render: ReactElement<Record<string, unknown>>;
        onSelect?: undefined;
      }
    | { label: string; onSelect: () => void; render?: undefined };
  /**
   * Replaces the default `IdentityMark` in both the trigger and the list.
   * `item.leading` wins over it for a single item.
   */
  renderMark?: (item: SwitcherItem) => ReactNode;
  /**
   * The trigger's whole accessible name, built from the entity name it is
   * showing. Defaults to `${kicker} ${entityName}`.
   *
   * Word order belongs to the host's translation, not to this component:
   * English wants "Team SONIC Lab" and Japanese the equivalent of "SONIC Lab
   * team", so it has to be one interpolated message the translator owns.
   *
   * ```tsx
   * accessibleName={(name) => t('switcher.teamLabel', { name })}
   * ```
   *
   * It must CONTAIN the visible name (WCAG 2.5.3), so that a speech-input
   * user can reach the control by what they can see. Development builds warn
   * when it does not.
   */
  accessibleName?: (entityName: string) => string;
};

/**
 * The retry and the two strings that frame it are required exactly when the
 * status can be `'failed'`. Two members rather than one per status so a caller
 * holding a status it cannot narrow (`status={query.status}`) still
 * type-checks.
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
  /** The outer segment: the team whose work is on screen. */
  team?: SwitcherSegment;
  /**
   * The inner segment: the study open inside that team. Omit it entirely
   * where none is open — the control then draws as one segment.
   */
  study?: SwitcherSegment;
  className?: string;
};

/**
 * Below `xl` (36em) a segment keeps only its mark and its caret.
 *
 * A container query rather than a viewport breakpoint: what decides whether
 * the names fit is the width this control was given, not the window's.
 *
 * `sr-only` rather than `hidden`, so the text stays rendered and the
 * accessible name computes the same way collapsed or not.
 */
const COLLAPSE_CLASS = '@max-xl:sr-only';

/**
 * A floor, and no ceiling. The shell spec requires the header to size to its
 * content and never clip or truncate a label, because German and Portuguese
 * run about a third longer than English. The floor is what reserves the
 * skeleton's width, so the header does not jump when the name arrives.
 */
const NAME_WIDTH_CLASS = 'min-w-24';

/**
 * The frame's own corners, minus its border, on the edges of a segment that
 * meet it — the nesting rule, so a 14px outer curve with 1px of border has a
 * 13px inner one.
 *
 * The frame clips, so a segment's SURFACE would come out right with no radius
 * at all. The focus ring is why this exists: an outline traces the element's
 * own border-radius, so a square segment rings square inside a rounded frame.
 */
const OUTER_CORNER = {
  start: 'rounded-s-[calc(var(--radius-sm)-1px)]',
  end: 'rounded-e-[calc(var(--radius-sm)-1px)]',
  both: 'rounded-[calc(var(--radius-sm)-1px)]',
} as const;

/**
 * A segment's face. The focus ring is drawn inside, because the frame's clip
 * would remove an outward offset.
 *
 * `not-data-popup-open:` on the hover rule rather than source order: both are
 * single-class selectors, so which wins would otherwise depend on Tailwind's
 * emission order.
 */
const SEGMENT_CLASS = cx(
  'flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-2',
  'bg-input text-input-contrast text-start transition-colors',
  'focusable focus-visible:-outline-offset-3',
  'not-data-popup-open:hover:bg-input-contrast/8',
  'data-popup-open:bg-selected data-popup-open:text-selected-contrast',
);

/**
 * The rows under a list — the retry and the action. They are plain buttons
 * outside `Select.List`, so they carry their own hover and focus treatment
 * rather than Base UI's `data-highlighted`, which only the options get.
 */
const ROW_CLASS = cx(
  'flex w-full cursor-pointer items-center gap-3 rounded-xs px-3 py-2',
  'text-start transition-colors outline-none',
  'focusable hover:bg-surface-2 hover:text-surface-2-contrast',
  'focus-visible:bg-surface-2 focus-visible:text-surface-2-contrast',
);

/** A rule between a list and the rows that follow it. */
const SEPARATOR_CLASS = 'border-outline my-1.5 border-t';

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
 * One segment of the control. Private on purpose: a team switcher and a study
 * switcher are the same control with different words.
 */
function Segment({
  corners,
  divided,
  segment,
}: {
  /** Which of this segment's corners are the frame's own. */
  corners: keyof typeof OUTER_CORNER;
  /** Draws the rule that separates this segment from the one before it. */
  divided: boolean;
  segment: SwitcherSegment;
}) {
  const {
    accessibleName,
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
  const failureId = useId();
  const portalContainer = usePortalContainer();

  // Held here rather than left to Base UI because the rows beneath the list
  // are ours: a plain button does not close the popup the way a `Select.Item`
  // does.
  const [open, setOpen] = useState(false);

  const current = items.find((item) => item.id === currentId);
  const failed = status === 'failed';
  const loading = status === 'loading';

  // While loading there is no name yet, so the label is the kicker alone
  // rather than a sentence with an empty slot in it.
  const shownName = current?.name ?? placeholder;
  const triggerLabel =
    loading || shownName === undefined
      ? kicker
      : (accessibleName?.(shownName) ?? `${kicker} ${shownName}`);

  if (
    process.env.NODE_ENV !== 'production' &&
    accessibleName &&
    !loading &&
    shownName !== undefined &&
    !triggerLabel.includes(shownName)
  ) {
    // Warned rather than thrown: a drifted translation should not take down a
    // header. The convention this package already uses — see
    // `form/utils/focusFirstError.ts`.
    // eslint-disable-next-line no-console
    console.warn(
      `EntitySwitcher: accessibleName returned ${JSON.stringify(triggerLabel)}, ` +
        `which does not contain the visible name ${JSON.stringify(shownName)}. ` +
        'A control’s accessible name has to contain its visible label ' +
        '(WCAG 2.5.3) so speech input can reach it by what is on screen.',
    );
  }

  // What the list is for. None of these means the segment is a label in a
  // frame rather than a control.
  const hasList = failed || action !== undefined || items.length > 1;

  // Whether anything stands in for the name when the column collapses.
  const hasMark = loading || current !== undefined;

  const face = (
    <>
      {loading ? (
        // The mark's space is reserved with it, so the header does not shift
        // sideways when the name arrives.
        <Skeleton className="size-8 shrink-0 rounded-xs" />
      ) : current ? (
        markFor(current, renderMark, 'md')
      ) : null}
      <span
        className={cx(
          // The column collapses only when the mark can stand in for it.
          // Collapsing without one leaves a bare chevron that says nothing
          // about what it switches.
          'flex min-w-0 flex-col items-start',
          hasMark ? COLLAPSE_CLASS : undefined,
        )}
      >
        <span className="text-2xs leading-tight font-semibold uppercase opacity-70">
          {kicker}
        </span>
        <span
          className={cx(
            'text-sm leading-tight font-semibold',
            // One line, whole. The lockup grows to hold it.
            'block whitespace-nowrap',
            NAME_WIDTH_CLASS,
          )}
        >
          {/* The skeleton's `em` height is deliberately not a step off the
              spacing scale: the type scale is fluid, so a fixed height would
              drift away from the name it stands in for. */}
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
  const corner = OUTER_CORNER[corners];

  if (!hasList) {
    return (
      // Not a button and not focusable: there is nothing to activate, so this
      // has no accessible name to compute and the two spans are read as
      // ordinary content.
      <span
        data-switcher-segment
        className={cx(
          'bg-input text-input-contrast flex min-w-0 flex-1 items-center gap-2 px-3 py-2',
          corner,
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
        // Marks what IS a segment: `Select` renders a hidden form control
        // beside its trigger, so counting the frame's children counts those
        // too.
        data-switcher-segment
        className={cx(SEGMENT_CLASS, corner, divider)}
        aria-busy={loading || undefined}
        // One string, because the accessible name is one sentence.
        // `aria-labelledby` cannot express it: it concatenates in the order of
        // its IDREFs, so the word order would be this component's in every
        // locale. It still contains the visible text (WCAG 2.5.3).
        aria-label={triggerLabel}
      >
        {face}
      </Select.Trigger>
      <Select.Portal container={portalContainer ?? undefined}>
        <Select.Positioner
          // Base UI's default overlaps the trigger so the selected item lands
          // on the trigger's value text. In a header that covers the header
          // the popup was opened from.
          alignItemWithTrigger={false}
          side="bottom"
          align="start"
          sideOffset={8}
        >
          <Select.Popup
            className={cx(
              'bg-surface-popover text-surface-popover-contrast publish-colors',
              'border-outline elevation-high w-xs max-w-(--available-width)',
              'rounded border-2 p-2 outline-none',
              // Bounded, with the list as the part that scrolls. Base UI
              // publishes `--available-height` but applies nothing itself, so
              // a long list pushed the retry and the trailing destination off
              // the bottom of the screen. Those rows stay put while the
              // options move.
              'flex max-h-(--available-height) flex-col',
            )}
          >
            {/*
              ALWAYS rendered, even empty. Base UI puts `role="listbox"` on
              `Select.Popup` when there is no `Select.List` to carry it, which
              made the failure message and its retry children of the listbox —
              and a listbox may only contain options.
            */}
            <Select.List className="flex min-h-0 flex-col gap-0.5 overflow-y-auto overscroll-contain">
              {/*
                Named, not headed: the kicker is already on the trigger the
                reader just operated, so a visible heading repeating it is
                chrome. The label keeps the group named for a reader who
                arrives in the list without having seen that trigger.
              */}
              {items.length > 0 && (
                <Select.Group aria-label={kicker}>
                  {items.map((item) => (
                    <Select.Item
                      key={item.id}
                      value={item.id}
                      // What the list is matched on when the reader types,
                      // rather than the mark's monogram and the chip coming
                      // along with it.
                      label={item.name}
                      className={cx(
                        'group flex cursor-pointer items-center gap-3 rounded-xs px-3 py-2',
                        'transition-colors outline-none select-none',
                        'not-data-selected:data-highlighted:bg-surface-2 not-data-selected:data-highlighted:text-surface-2-contrast',
                        'data-selected:bg-selected data-selected:text-selected-contrast',
                      )}
                    >
                      {markFor(item, renderMark, 'sm')}
                      {/* Wraps rather than truncating: this is where a name
                          too long for the frame above can be read in full. */}
                      <Select.ItemText className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm leading-tight font-semibold">
                          {item.name}
                        </span>
                        {item.meta !== undefined && (
                          <span
                            // Names the supporting line. The identity mark is
                            // also `text-xs`, so a class query cannot tell the
                            // two apart — see `data-caret`.
                            data-meta
                            // Full strength on the selected row: dimmed, this
                            // composites toward `--selected` and drops to
                            // 2.90:1. Elsewhere 70% is 5.19:1.
                            className="text-xs leading-tight opacity-70 group-data-selected:opacity-100"
                          >
                            {item.meta}
                          </span>
                        )}
                      </Select.ItemText>
                      {item.badge !== undefined && (
                        // A filled chip, tinted with the row's OWN text colour
                        // so it follows whatever row it is on. The tint comes
                        // off on the selected row, where it would pull the
                        // chip's label to about 4.2:1.
                        <span className="text-2xs shrink-0 rounded-full bg-current/15 px-2 py-1 leading-tight font-semibold uppercase group-data-selected:bg-transparent">
                          {item.badge}
                        </span>
                      )}
                      {/*
                        The tick's column is reserved by this wrapper rather
                        than by the indicator, which Base UI unmounts when the
                        item is not selected.
                      */}
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        <Select.ItemIndicator>
                          <Check aria-hidden className="size-4" />
                        </Select.ItemIndicator>
                      </span>
                    </Select.Item>
                  ))}
                </Select.Group>
              )}
            </Select.List>
            {failed && onRetry && (
              <>
                {items.length > 0 && (
                  <Select.Separator className={SEPARATOR_CLASS} />
                )}
                {/*
                  `aria-describedby` rather than a group label: outside the
                  listbox there is no group to label, and a retry announced on
                  its own does not say what it is a retry for.
                */}
                <p
                  id={failureId}
                  className="text-destructive flex items-start gap-2 px-3 py-2 text-xs"
                >
                  <TriangleAlert
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <span>{failureMessage}</span>
                </p>
                <button
                  type="button"
                  aria-describedby={failureId}
                  // NOT `closeThen`. Closing first hides the only place the
                  // failure is stated, so a retry that fails again would
                  // settle back exactly as it was with nothing to say so.
                  onClick={onRetry}
                  className={cx(ROW_CLASS, 'text-sm font-semibold')}
                >
                  {/* The leading slot, kept empty: every other row opens with
                      a tile, and a label starting 36px to their left would
                      read as a stray line of text. */}
                  <span aria-hidden className="size-6 shrink-0" />
                  <span>{retryLabel}</span>
                </button>
              </>
            )}
            {action && (
              <>
                {(items.length > 0 || failed) && (
                  <Select.Separator className={SEPARATOR_CLASS} />
                )}
                {(() => {
                  const body = (
                    <>
                      {/* A dashed tile where a mark would be, at the mark's
                          own size: the row lines up with the entities above it
                          and still reads as "make a new one". */}
                      <span className="border-outline flex size-6 shrink-0 items-center justify-center rounded-xs border-2 border-dashed">
                        <Plus aria-hidden className="size-3.5" />
                      </span>
                      <span className="text-sm font-semibold">
                        {action.label}
                      </span>
                    </>
                  );
                  const className = cx(
                    ROW_CLASS,
                    'opacity-70 hover:opacity-100 focus-visible:opacity-100',
                  );
                  // A destination keeps its own element, so it stays a link.
                  // Closing the popup is still ours to do.
                  return action.render ? (
                    cloneElement(action.render, {
                      className,
                      onClick: () => setOpen(false),
                      children: body,
                    })
                  ) : (
                    <button
                      type="button"
                      onClick={closeThen(action.onSelect)}
                      className={className}
                    >
                      {body}
                    </button>
                  );
                })()}
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
 * **One component, not two composed ones.** The frame and the segments are the
 * same component's markup, so they cannot disagree about radius, height, or
 * where a painted surface stops — three things that went wrong separately
 * while this was a lockup wrapping generic switchers.
 *
 * **The frame clips; the segments paint plain rectangles into it.** They
 * stretch rather than centring, so a segment holding a 32px mark and one
 * holding a status pip still meet the frame top and bottom.
 *
 * **The study segment is absent, not empty.** Pass no `study` and the control
 * draws as one segment, with no divider and no empty compartment.
 *
 * **A listbox, not a menu.** Choosing which sibling you are acting in is a
 * selection, not a command — and Base UI's `Select` opens ON the current
 * entity rather than at the top of the list.
 *
 * **A list of one is a dead end.** With nothing to switch to, no command and
 * no failure to retry, a segment renders inert and out of the tab order.
 *
 * **A failed list is not an empty one.** On `status="failed"` the segment
 * stays where it was — vanishing would strand the researcher — and the popup
 * carries the failure and its retry alongside any items already in hand.
 *
 * The host must give this a width it does not derive from its contents:
 * `container-type: inline-size` applies inline-size containment, so an element
 * that sized itself to its contents would measure zero and hold every segment
 * collapsed.
 */
export function TeamAndStudySwitcher({
  className,
  team,
  study,
}: TeamAndStudySwitcherProps) {
  // A bordered box holding no segment reads as a control that failed to load
  // rather than as the absence of one.
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
        {team && (
          <Segment
            corners={study ? 'start' : 'both'}
            divided={false}
            segment={team}
          />
        )}
        {study && (
          <Segment
            corners={team ? 'end' : 'both'}
            divided={team !== undefined}
            segment={study}
          />
        )}
      </div>
    </div>
  );
}
