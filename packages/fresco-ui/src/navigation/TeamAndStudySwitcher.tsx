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
  /**
   * The trigger's whole accessible name, built from the entity name it is
   * showing.
   *
   * **Word order lives here, in the host's translation, because no order this
   * component could pick is right in every locale.** English wants the type
   * before the name — "Team SONIC Lab" — and Japanese wants it after, the
   * equivalent of "SONIC Lab team". Others want a particle or brackets between
   * them. That is a property of the sentence, not of the control, so it
   * belongs in one interpolated message the translator owns:
   *
   * ```tsx
   * accessibleName={(name) => t('switcher.teamLabel', { name })}
   * //  en: "Team {name}"      ja: "{name} チーム"
   * ```
   *
   * Two separately translated strings joined by this component cannot express
   * that, however they are joined: `aria-labelledby` concatenates in the order
   * of its IDREFs, so the order is the component's either way.
   *
   * Defaults to `${kicker} ${entityName}`, which is what the fixed pair of
   * references produced before.
   *
   * It must CONTAIN the visible name: the accessible name of a control has to
   * include its visible label (WCAG 2.5.3), so a speech-input user asking for
   * what they can see reaches the control. Development builds warn when the
   * returned string does not.
   */
  accessibleName?: (entityName: string) => string;
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
 * Below `xl` (36em) a segment keeps only its mark and its caret.
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
const COLLAPSE_CLASS = '@max-xl:sr-only';

/**
 * A floor and a cap that step up together, so a segment neither collapses onto
 * a two-character name nor eats the header with a long one. The skeleton fills
 * the same floor, which is what keeps the header from reflowing when the name
 * arrives.
 */
const NAME_WIDTH_CLASS = cx(
  'max-w-40 min-w-24',
  '@min-3xl:max-w-56',
  '@min-5xl:max-w-72',
);

/**
 * The frame's own corners, minus its border, on the edges of a segment that
 * meet it.
 *
 * A segment used to carry no radius at all: the frame clips, so its surface
 * came out the right shape regardless, and matching the frame's 14px curve
 * inside a 1px border left a crescent where the two did not follow each other.
 *
 * The focus ring needs it, though. An outline traces the element's own
 * border-radius, so a square segment rings square inside a rounded frame, and
 * the corner of the ring sits outside the frame it is drawn in. Subtracting
 * the border from the token is the nesting rule — a 14px outer curve with 1px
 * of border has a 13px inner one — so the surface is exactly the frame's inner
 * shape, and the ring follows it.
 */
const OUTER_CORNER = {
  start: 'rounded-s-[calc(var(--radius-sm)-1px)]',
  end: 'rounded-e-[calc(var(--radius-sm)-1px)]',
  both: 'rounded-[calc(var(--radius-sm)-1px)]',
} as const;

/**
 * A segment's face.
 *
 * The focus ring is drawn INSIDE. `focus-styles` offsets the outline outwards,
 * which is precisely what the frame's clip would remove, so the offset is
 * inverted here and the ring hugs the inside of the segment.
 *
 * `not-data-popup-open:` rather than source order on the hover rule. Both are
 * single-class selectors, so which one wins is decided by Tailwind's own
 * emission order and not by the order they are written in here; excluding the
 * open state from the hover rule makes the outcome independent of that.
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
  'text-box-trimmed:py-3',
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
 * One segment of the control. Private on purpose: a team switcher and a
 * study switcher are the same control with different words, and exporting
 * this would invite a second, differently-behaved arrangement of them.
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

  /*
    The name the trigger is showing, and the accessible name built from it.

    While loading there is no name yet, so the label is the kicker alone rather
    than a sentence with an empty slot in it — "Team" says what the control is,
    and `aria-busy` says the rest.
  */
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
    // Not thrown: a translation that has drifted should not take down a header.
    // Loud enough to fix, quiet enough to ship around. The convention this
    // package already uses for a development-time complaint — see
    // `form/utils/focusFirstError.ts`.
    // eslint-disable-next-line no-console
    console.warn(
      `EntitySwitcher: accessibleName returned ${JSON.stringify(triggerLabel)}, ` +
        `which does not contain the visible name ${JSON.stringify(shownName)}. ` +
        'A control\u2019s accessible name has to contain its visible label ' +
        '(WCAG 2.5.3) so speech input can reach it by what is on screen.',
    );
  }

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
      <span
        className={cx(
          /*
            An explicit gap, because the trim took away the one that was there
            by accident. Untrimmed, the half-leading below the kicker and above
            the name held them apart — 2.78px and 3.91px at these sizes, 6.69px
            between them. Trimmed to cap and baseline that goes to nothing and
            the pair reads as one smudged line.

            6px, the nearest step to what the leading was giving, so the rhythm
            is the one people are used to — but stated now, and no longer a
            by-product of the font's metrics that changes with the typeface.
          */
          'flex min-w-0 flex-col items-start gap-1.5',
          COLLAPSE_CLASS,
        )}
      >
        <span className="text-box-trim text-2xs leading-tight font-semibold uppercase opacity-70">
          {kicker}
        </span>
        <span
          title={current?.name}
          className={cx(
            'text-box-trim text-sm leading-tight font-semibold',
            /*
              `overflow-x-clip` rather than `truncate`. Truncation hides
              overflow in BOTH axes, and a cap-trimmed box ends at the
              baseline — so the descenders of a name like "Wave 2 pilot" fall
              outside it and get clipped off. Clipping sideways only shortens
              the name without cutting the letters that remain.
            */
            'block overflow-x-clip text-ellipsis whitespace-nowrap',
            NAME_WIDTH_CLASS,
          )}
        >
          {/* The skeleton's `em` height is not a step off the spacing scale
              on purpose: the type scale is fluid, so a fixed height would
              drift away from the name it stands in for as the container
              grows. */}
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
      /*
        Not a button and not focusable: there is nothing to activate, so this
        has no accessible NAME to compute — the two spans are read as ordinary
        content, in document order. `accessibleName` is about a control's name
        and does not apply here; the reading order a locale wants for plain
        content is a matter of how the two spans are laid out, which is CSS.
      */
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
        /*
          Marks what IS a segment. `Select` renders a hidden form control
          beside its trigger, so counting the frame's children counts those
          too — this is what lets a caller (or a test) ask how many segments
          are drawn and get the number a reader would see.
        */
        data-switcher-segment
        className={cx(SEGMENT_CLASS, corner, divider)}
        aria-busy={loading || undefined}
        /*
          One string, because the accessible name is one sentence.

          This used to reference the kicker and the name spans in that order.
          That was chosen to avoid baking English word order into the name —
          and did exactly that anyway: `aria-labelledby` concatenates in the
          order of its IDREFS, not in document order, so "Team SONIC Lab" was
          the only name it could ever produce. A locale wanting the type after
          the name, as Japanese does, had no way to say so.

          Word order is a property of the sentence, so it lives in the host's
          interpolated message via `accessibleName`. The default keeps the old
          output exactly.

          It still CONTAINS the visible text, which was the reason to avoid
          `aria-label` before: a name that replaced what is on screen would put
          a speech-input user out of reach of the control (WCAG 2.5.3).
        */
        aria-label={triggerLabel}
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
              'rounded border-2 p-2 outline-none',
            )}
          >
            {/*
              ALWAYS rendered, even with nothing in it. Base UI puts
              `role="listbox"` on `Select.Popup` when there is no `Select.List`
              to carry it — so on a failure with no cached items, which is the
              ordinary whole-list failure, the message and the retry became
              children of the listbox itself. A `listbox` may only contain
              options, and a button inside one is skipped or misannounced.
              An empty list keeps the role where it belongs and leaves the rows
              below it siblings of the list rather than of its options.
            */}
            <Select.List className="flex flex-col gap-0.5">
              {/*
                Named, not headed. The kicker is already on the trigger the
                reader just operated, so a heading repeating it inside the
                popup is a line of chrome saying what they were looking at when
                they opened it. `aria-label` keeps the group named for a reader
                who arrives in the list without having seen that trigger, which
                is what the visible heading was carrying.
              */}
              {items.length > 0 && (
                <Select.Group aria-label={kicker}>
                  {items.map((item) => (
                    <Select.Item
                      key={item.id}
                      value={item.id}
                      // The name the list is matched on when the reader types,
                      // rather than the mark's monogram and the chip coming
                      // along with it.
                      label={item.name}
                      className={cx(
                        /*
                          `text-box-trimmed:` on the vertical padding: where
                          the trim applies these rows are cap-height boxes, and
                          the padding that framed a line box leaves them
                          squeezed. A browser without `text-box` keeps the
                          smaller value, which is right for the taller box it
                          still draws.
                        */
                        'group flex cursor-pointer items-center gap-3 rounded-xs px-3 py-2',
                        'text-box-trimmed:py-3',
                        'transition-colors outline-none select-none',
                        'not-data-selected:data-highlighted:bg-surface-2 not-data-selected:data-highlighted:text-surface-2-contrast',
                        'data-selected:bg-selected data-selected:text-selected-contrast',
                      )}
                    >
                      {markFor(item, renderMark, 'sm')}
                      {/* No truncation here, deliberately: the list is where a
                          name the trigger had to cut off can be read in full. */}
                      {/* Spaced for the reason the trigger's stack is: trimmed to cap and
   baseline, the name and its supporting line have no leading between
   them and would otherwise touch. Same 6px, so a row in the list and
   the trigger above it keep the same rhythm. */}
                      <Select.ItemText className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="text-box-trim text-sm leading-tight font-semibold">
                          {item.name}
                        </span>
                        {item.meta !== undefined && (
                          <span
                            /* Names the supporting line. The identity mark is
                               also `text-xs`, so a class query cannot tell the
                               two apart — see `data-caret`. */
                            data-meta
                            /*
                              Full strength on the selected row. Dimmed, this
                              text composites toward `--selected` and drops to
                              2.90:1 against it — below 4.5:1, and 90% only
                              reaches 4.19:1, so nothing short of full opacity
                              clears it. Elsewhere 70% is 5.19:1 and the
                              hierarchy is worth keeping.
                            */
                            className="text-box-trim text-xs leading-tight opacity-70 group-data-selected:opacity-100"
                          >
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
                        <span className="text-box-trim text-box-trimmed:py-1 text-2xs shrink-0 rounded-full bg-current/15 px-2 font-semibold uppercase">
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
                  its own does not say what it is a retry FOR.
                */}
                <p
                  id={failureId}
                  className="text-destructive flex items-start gap-2 px-3 py-2 text-xs"
                >
                  <TriangleAlert
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0"
                  />
                  {/* The icon and the text are flex children, so the text
                      takes its own box. */}
                  <span className="text-box-trim">{failureMessage}</span>
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
                  {/* Its own box: `text-box-trim` is inert on the flex row. */}
                  <span className="text-box-trim">{retryLabel}</span>
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
                  <span className="text-box-trim text-sm font-semibold">
                    {action.label}
                  </span>
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
