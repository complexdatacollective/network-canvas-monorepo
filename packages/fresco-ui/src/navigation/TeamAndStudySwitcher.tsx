'use client';

import { Select } from '@base-ui/react/select';
import { Check, ChevronDown, Plus } from 'lucide-react';
import {
  cloneElement,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { IdentityMark } from '../IdentityMark';
import Pill from '../Pill';
import { usePortalContainer } from '../PortalContainer';
import { Skeleton } from '../Skeleton';
import { composeEventHandlers } from '../utils/composeEventHandlers';
import { cx } from '../utils/cva';

export type SwitcherStatus = 'ready' | 'loading';

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
 * A list that could not be read is NOT this component's to report. It shows
 * what it was given, and the shell above it owns the failure — one switcher
 * carrying its own error surface would put a second, quieter account of the
 * same outage next to the one the app already makes.
 */
export type SwitcherSegment = SwitcherSegmentBase & { status?: SwitcherStatus };

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
 * The frame's INNER curve — its radius less its 2px border — on the edges of a
 * segment that meet it.
 *
 * A larger radius cuts more away at a corner, so a segment carrying the
 * frame's own radius falls short of the frame's inner curve and lets the page
 * show through between the fill and the border. Subtracting the border is what
 * makes the two concentric. `overflow-hidden` on the frame keeps this from
 * being able to overshoot in the other direction.
 *
 * `--radius-base`, never `--radius`. Under `@theme inline` a utility inlines
 * its token's value: `--radius-base` inlines a `var()` that resolves against
 * the element, so a themed region gets its own radius, while `--radius` is
 * declared once at `:root` and inherits the default theme's number everywhere.
 * Reading it froze every segment at 28px while the frame followed Studio to
 * 14px. The `2px` here is the frame's `border-2`; the two move together.
 */
const OUTER_CORNER = {
  start: 'rounded-s-[calc(var(--radius-base,1.75rem)-2px)]',
  end: 'rounded-e-[calc(var(--radius-base,1.75rem)-2px)]',
  both: 'rounded-[calc(var(--radius-base,1.75rem)-2px)]',
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
  /*
    `flex-auto`, not `flex-1`. `flex-1` measures from a zero basis, so two
    segments take an equal share whatever is in them — collapsed, the one
    holding a 32px mark was squeezed out of its right padding while the one
    holding an 8px status dot kept 14px of slack. From a content basis each
    keeps its own padding and the pair still fills the frame.
  */
  'flex min-w-0 flex-auto cursor-pointer items-center gap-3 px-3 py-2',
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
  'flex w-full cursor-pointer items-center gap-4 rounded-sm px-3 py-2',
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
    items,
    kicker,
    onSelect,
    placeholder,
    renderMark,
    status = 'ready',
  } = segment;
  const portalContainer = usePortalContainer();

  // Held here rather than left to Base UI because the rows beneath the list
  // are ours: a plain button does not close the popup the way a `Select.Item`
  // does.
  const [open, setOpen] = useState(false);

  const current = items.find((item) => item.id === currentId);
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
  const hasList = action !== undefined || items.length > 1;

  // What the mark slot will actually draw, computed once and rendered below.
  // `renderMark` and `item.leading` are both `ReactNode`, so either may be
  // `null` — and collapsing the name on the strength of a current entity that
  // renders no mark leaves a bare caret, or an empty frame on an inert
  // segment. Whether there IS a mark has to come from the node.
  const mark = current ? markFor(current, renderMark, 'md') : null;
  const hasMark = loading || (mark !== null && mark !== undefined);

  const face = (
    <>
      {loading ? (
        // The mark's space is reserved with it, so the header does not shift
        // sideways when the name arrives.
        <Skeleton className="size-8 shrink-0 rounded-xs" />
      ) : (
        mark
      )}
      <span
        className={cx(
          // The column collapses only when the mark can stand in for it.
          // Collapsing without one leaves a bare chevron that says nothing
          // about what it switches.
          // No `items-start`: that sizes each line to its own content, so the
          // name kept its full width however narrow the column got and the
          // ellipsis never engaged. Stretched, the lines take the column's
          // width and the text stays left-aligned by `text-start` above.
          'flex min-w-0 flex-col',
          hasMark ? COLLAPSE_CLASS : undefined,
        )}
      >
        <span className="text-2xs leading-tight font-semibold uppercase opacity-70">
          {kicker}
        </span>
        <span
          className={cx(
            'text-sm leading-tight font-semibold',
            // One line, cut with an ellipsis when the container cannot hold
            // it. Below the collapse threshold the whole column gives way to
            // the mark instead — an ellipsis is for the widths in between,
            // where there is still enough of a name to be worth reading.
            'truncate',
          )}
        >
          {/* Sized in `em` on purpose, both ways: the type scale is fluid, so
              a figure off the spacing scale would drift away from the name
              this stands in for as the container grows. */}
          {loading ? (
            <Skeleton className="inline-block h-[0.9em] w-[7em] rounded-xs align-middle" />
          ) : (
            (current?.name ?? placeholder)
          )}
        </span>
      </span>
      {hasList ? (
        <ChevronDown
          aria-hidden
          data-caret
          className="size-4 shrink-0 opacity-70"
        />
      ) : null}
    </>
  );

  // `border-s-2`, the frame's own weight: a 1px rule between two segments
  // read as a hairline beside a 2px edge.
  const divider = divided ? 'border-outline border-s-2' : undefined;
  const corner = OUTER_CORNER[corners];

  if (!hasList) {
    return (
      // Not a button and not focusable: there is nothing to activate, so this
      // has no accessible name to compute and the two spans are read as
      // ordinary content.
      <span
        data-switcher-segment
        className={cx(
          'bg-input text-input-contrast flex min-w-0 flex-auto items-center gap-3 px-3 py-2',
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
          // `z-50`, as `form/fields/Select`'s positioner carries. Without a
          // `PortalContainerProvider` this portals to `document.body`, where
          // any positioned page content — a sticky table header at `z-10`, say
          // — would otherwise paint over the options and swallow their clicks.
          className="z-50"
          alignItemWithTrigger={false}
          side="bottom"
          align="start"
          sideOffset={8}
        >
          <Select.Popup
            className={cx(
              'bg-surface-popover text-surface-popover-contrast',
              // Sized to its content, not pinned. `w-xs` was a fixed
              // `width: 20em`, and `max-w` can only cap a width — never widen
              // one — so a long team name wrapped over five lines with the
              // room beside it going unused. The floor keeps a short list from
              // reading as a tooltip; the ceiling is whichever is smaller of
              // the room Base UI reports and a width that still reads as a
              // popup rather than a panel.
              'border-outline w-max shadow-xl',
              'max-w-[min(var(--available-width),var(--container-md))]',
              // The curve fresco-ui's own `Select` dropdown uses, so the two
              // popups read as the same kind of surface. Its rows match too:
              // `rounded-sm`, the shared `dropdownItemVariants` figure.
              'rounded-sm border-2 p-2 outline-none',
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
                        'group flex cursor-pointer items-center gap-4 rounded-sm px-3 py-2',
                        'transition-colors outline-none select-none',
                        'not-data-selected:data-highlighted:bg-surface-2 not-data-selected:data-highlighted:text-surface-2-contrast',
                        'data-selected:bg-selected data-selected:text-selected-contrast',
                      )}
                    >
                      {markFor(item, renderMark, 'md')}
                      {/* Wraps rather than truncating: this is where a name
                          too long for the frame above can be read in full. */}
                      <Select.ItemText className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm leading-tight font-semibold break-words">
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
                        <Pill
                          size="sm"
                          // `filled` tints with the row's OWN text colour, so
                          // the pill follows whatever row it is on. The tint
                          // comes off on the selected row, where it would pull
                          // the label to about 4.2:1.
                          variant="filled"
                          className="shrink-0 uppercase group-data-selected:bg-transparent"
                        >
                          {item.badge}
                        </Pill>
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
            {action && (
              <>
                {items.length > 0 && (
                  <Select.Separator className={SEPARATOR_CLASS} />
                )}
                {(() => {
                  const body = (
                    <>
                      {/* A dashed tile where a mark would be, at the mark's
                          own size — `size-8` is `IdentityMark`'s `md` — so the
                          row lines up with the entities above it and still
                          reads as "make a new one". */}
                      <span className="border-outline flex size-8 shrink-0 items-center justify-center rounded-xs border-2 border-dashed">
                        <Plus aria-hidden className="size-4" />
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
                  // Closing the popup is still ours to do — composed with the
                  // element's own handler rather than replacing it, since a
                  // caller may guard the navigation or record it.
                  return action.render ? (
                    cloneElement(action.render, {
                      className,
                      onClick: composeEventHandlers(
                        () => setOpen(false),
                        action.render.props.onClick as
                          | ((event: unknown) => void)
                          | undefined,
                      ),
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
          'inline-flex max-w-full min-w-0 items-stretch',
          /*
            `border-2`, the weight fresco-ui's own bordered containers use —
            `form/fields/Boolean` and `RichSelectGroup` are the same shape,
            an `overflow-hidden rounded` box with segments painted inside it.

            The clip is what makes a segment follow this border. A segment
            declares the frame's own radius and is trimmed to the frame's
            INNER curve, so the two are concentric at any border width and any
            theme, with no arithmetic here to keep in step.
          */
          'border-outline overflow-hidden rounded border-2',
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
