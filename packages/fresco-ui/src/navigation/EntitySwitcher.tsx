'use client';

import { Select } from '@base-ui/react/select';
import { Check, ChevronDown, Plus, TriangleAlert } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { IdentityMark } from '../IdentityMark';
import { usePortalContainer } from '../PortalContainer';
import { Skeleton } from '../Skeleton';
import { cx } from '../utils/cva';

export type EntitySwitcherStatus = 'ready' | 'loading' | 'failed';

export type EntitySwitcherItem = {
  /** Stable id. Identifies the item to `onSelect` and colours its mark. */
  id: string;
  /** The entity's name, shown whole in the list and truncated in the trigger. */
  name: string;
  /** A secondary line under the name — a role, an owner, a count. */
  meta?: string;
  /** A short status word shown as a chip — "Draft", "Archived". */
  badge?: string;
  /**
   * Replaces this one item's mark. A status dot for a study whose state
   * matters more than its identity, say. Takes precedence over `renderMark`.
   */
  leading?: ReactNode;
};

type EntitySwitcherBaseProps = {
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
  items: ReadonlyArray<EntitySwitcherItem>;
  /**
   * The entity being acted in. `undefined` — or an id no item names — leaves
   * the trigger showing `placeholder`, and leaves every option unselected.
   */
  currentId: string | undefined;
  /** Called with the chosen id. Never called for the id already current. */
  onSelect: (id: string) => void;
  /**
   * Stands in for the name when `currentId` names nothing in `items` — the
   * host's translated "Choose a team". Without it the trigger shows the
   * kicker alone.
   */
  placeholder?: string;
  /** A trailing command under the list — "Create a team". */
  action?: { label: string; onSelect: () => void };
  /**
   * Replaces the default `IdentityMark` in both the trigger and the list — a
   * status dot, an avatar, or nothing at all. `item.leading` wins over it for
   * a single item.
   */
  renderMark?: (item: EntitySwitcherItem) => ReactNode;
  className?: string;
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
type EntitySwitcherRecoveryProps =
  | {
      status?: 'ready' | 'loading';
      onRetry?: undefined;
      failureMessage?: undefined;
      retryLabel?: undefined;
    }
  | {
      status?: EntitySwitcherStatus;
      /** Re-runs whatever failed to produce `items`. */
      onRetry: () => void;
      /** Translated, and short: "Your teams could not be loaded." */
      failureMessage: string;
      /** Translated label for the retry command: "Try again". */
      retryLabel: string;
    };

export type EntitySwitcherProps = EntitySwitcherBaseProps &
  EntitySwitcherRecoveryProps;

/**
 * Below this the trigger keeps only its mark and its caret.
 *
 * A CONTAINER query, not a viewport breakpoint: a switcher can sit in the app
 * header, in a narrow side panel, or in a dialog, and what decides whether
 * the name fits is the width it was given, not the width of the window.
 * Unnamed, so it resolves against the nearest container — `SwitcherLockup`
 * provides one; standalone, wrap the switcher in `@container`.
 *
 * `sr-only` rather than `hidden`. The accessible-name algorithm skips hidden
 * nodes unless `aria-labelledby` references them directly, and while these
 * two spans ARE referenced directly, relying on that exception across
 * engines to keep a control named is not worth the risk. `sr-only` clips the
 * text out of the layout while leaving it rendered, so the name computes the
 * same way collapsed or not.
 */
const COLLAPSE_CLASS = '@max-[34rem]:sr-only';

/**
 * A floor and a cap that step up together, so the trigger neither collapses
 * onto a two-character name nor eats a header with a long one. The skeleton
 * fills the same floor, which is what keeps the header from reflowing when
 * the name arrives.
 */
const NAME_WIDTH_CLASS = cx(
  'max-w-[10rem] min-w-[6rem]',
  '@min-[48rem]:max-w-[14rem]',
  '@min-[64rem]:max-w-[18rem]',
);

/**
 * The trigger's face, drawn on Base UI's own button rather than on this
 * package's `Button`: transparent at rest so it reads as a label until it is
 * reached for, a raised surface under the pointer, and the accent wash while
 * the list is open.
 *
 * `not-data-popup-open:` rather than source order on the hover rule. Both are
 * single-class selectors, so which one wins is decided by Tailwind's own
 * emission order and not by the order they are written in here; excluding the
 * open state from the hover rule makes the outcome independent of that.
 */
const TRIGGER_CLASS = cx(
  'flex min-w-0 cursor-pointer items-center gap-2 rounded-xs px-3 py-1.5',
  'border border-transparent text-start transition-colors',
  'focusable',
  'not-data-popup-open:hover:bg-surface-2 not-data-popup-open:hover:text-surface-2-contrast',
  'data-popup-open:bg-surface-accent data-popup-open:text-surface-accent-contrast',
);

/**
 * The rows under the list — the retry and the action. They are plain buttons
 * outside `Select.List`, so they carry their own hover and focus treatment
 * rather than Base UI's `data-highlighted`, which only the options get.
 */
const ROW_CLASS = cx(
  'flex w-full cursor-pointer items-center gap-3 rounded-xs px-2 py-1.5',
  'text-start transition-colors outline-none',
  'focusable hover:bg-surface-2 hover:text-surface-2-contrast',
  'focus-visible:bg-surface-2 focus-visible:text-surface-2-contrast',
);

/** A rule between the list and the rows that follow it. */
const SEPARATOR_CLASS = 'border-outline my-1 border-t';

function markFor(
  item: EntitySwitcherItem,
  renderMark: EntitySwitcherProps['renderMark'],
  size: 'sm' | 'md',
): ReactNode {
  if (item.leading !== undefined) return item.leading;
  if (renderMark) return renderMark(item);
  return <IdentityMark id={item.id} name={item.name} size={size} />;
}

/**
 * The trigger's face: mark, the kicker-over-name column, and — where the
 * list can be opened — the caret.
 *
 * Shared by the interactive and the inert trigger so the two occupy the same
 * space and read the same way. The caret is the only difference the reader
 * sees, and it is exactly what tells them whether there is a list.
 */
function SwitcherFace({
  caret,
  kicker,
  kickerId,
  loading,
  mark,
  name,
  nameId,
}: {
  caret: boolean;
  kicker: string;
  kickerId: string;
  loading: boolean;
  mark: ReactNode;
  name: string | undefined;
  nameId: string;
}) {
  return (
    <>
      {mark}
      <span className={cx('flex min-w-0 flex-col items-start', COLLAPSE_CLASS)}>
        <span
          id={kickerId}
          className="text-xs leading-tight font-normal tracking-wide uppercase opacity-70"
        >
          {kicker}
        </span>
        <span
          id={nameId}
          title={name}
          className={cx(
            'truncate text-sm leading-tight font-semibold',
            NAME_WIDTH_CLASS,
          )}
        >
          {loading ? (
            <Skeleton className="inline-block h-[0.9em] w-full rounded-xs align-middle" />
          ) : (
            name
          )}
        </span>
      </span>
      {caret ? (
        <ChevronDown aria-hidden data-caret className="shrink-0 opacity-70" />
      ) : null}
    </>
  );
}

/**
 * The control a researcher uses to see which entity they are acting in, and
 * to move to a sibling of it.
 *
 * One component, configured — a team switcher and a study switcher differ
 * only in their `kicker` and their `items`, and two components would be two
 * places for the same keyboard behaviour, the same failure handling and the
 * same collapse rule to drift apart.
 *
 * ```tsx
 * <EntitySwitcher
 *   kicker={t('team')}
 *   items={teams}
 *   currentId={teamId}
 *   onSelect={(id) => void navigate({ to: '/team/$teamId', params: { teamId: id } })}
 *   action={{ label: t('createTeam'), onSelect: openCreateTeam }}
 * />
 * ```
 *
 * **A listbox, not a menu.** Choosing which of several siblings you are
 * acting in is a selection, not a command, and Base UI's `Select` is the part
 * built for it: the options are `option`s inside a `listbox`, the current one
 * is `aria-selected`, and — the reason for using it here — opening the list
 * lands the reader ON the current entity rather than at the top. `Menu` has
 * no `selectedIndex` and no `initialFocus`, so with it the reader always
 * started on the first sibling and had to walk to where they already were.
 *
 * **The list stays a pure listbox.** The retry and the action are children of
 * the popup but NOT of `Select.List`, because a `listbox` may only contain
 * options — a command sitting among them would be announced as one more
 * entity to switch to.
 *
 * **A list of one is a dead end.** With nothing to switch to, no command and
 * no failure to retry, the trigger renders inert: no caret, no list, and not
 * in the tab order, because a control that opens a list naming only where you
 * already are wastes a tab stop and tells the reader nothing.
 *
 * **A failed list is not an empty one.** On `status="failed"` the trigger
 * stays exactly where it was — it must never silently vanish, which strands
 * the researcher with no way back — and the popup carries the failure and its
 * retry, alongside any items that were already in hand.
 *
 * **Loading reserves its space.** The skeleton fills the same name width the
 * name will, so the header does not jump when the query settles.
 */
export function EntitySwitcher(props: EntitySwitcherProps) {
  const {
    action,
    className,
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
  } = props;
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
  // a tab stop; none of them means the trigger is a label with a border.
  const hasMenu = failed || action !== undefined || items.length > 1;

  const face = (
    <SwitcherFace
      caret={hasMenu}
      kicker={kicker}
      kickerId={kickerId}
      loading={loading}
      mark={
        loading ? (
          // The mark's own space, reserved with it: a trigger that gains a
          // tile when the name arrives shifts the whole header sideways,
          // which is the reflow the skeleton exists to prevent.
          <Skeleton className="size-8 shrink-0 rounded-xs" />
        ) : current ? (
          markFor(current, renderMark, 'md')
        ) : null
      }
      name={current?.name ?? (loading ? undefined : placeholder)}
      nameId={nameId}
    />
  );

  if (!hasMenu) {
    return (
      /*
        Not a button and not focusable: there is nothing to activate. The two
        spans are read in document order, so no `aria-labelledby` is needed
        here — that wiring exists on the interactive trigger only because a
        control's name is COMPUTED rather than read.
      */
      <span
        className={cx('flex min-w-0 items-center gap-2 px-3 py-1.5', className)}
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
        className={cx(TRIGGER_CLASS, className)}
        aria-busy={loading || undefined}
        /*
          A whole translated word and a datum, joined into "Team SONIC Lab" by
          the accessible-name algorithm rather than by JavaScript. An
          `aria-label` would REPLACE the visible name instead of qualifying
          it, and a template string would bake English word order into the
          name.

          Referenced by id rather than left to the control's own contents:
          text concatenation inserts a space only between BLOCK-level
          children, and these two are inline, so the computed name would read
          "TeamSONIC Lab". Multiple `aria-labelledby` references are always
          joined with a space.
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
                  <Select.GroupLabel className="px-2 py-1 text-xs font-semibold tracking-wide uppercase opacity-70">
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
                        'data-selected:bg-surface-accent data-selected:text-surface-accent-contrast',
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
                        <span className="border-outline shrink-0 rounded-full border px-2 text-xs opacity-70">
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
                  `aria-describedby` rather than the group-label wiring a menu
                  allowed: outside the listbox there is no group to label, and
                  a retry announced on its own does not say what it is a retry
                  FOR.
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
                    A dashed tile where a mark would be, at the mark's own
                    size: the row lines up with the entities above it and
                    still reads as "make a new one" rather than "here is
                    another one".
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
