'use client';

import { ChevronDown, TriangleAlert } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { Badge } from '../Badge';
import { Button } from '../Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../DropdownMenu';
import { IdentityMark } from '../IdentityMark';
import { Skeleton } from '../Skeleton';
import { cx } from '../utils/cva';

export type EntitySwitcherStatus = 'ready' | 'loading' | 'failed';

export type EntitySwitcherItem = {
  /** Stable id. Identifies the item to `onSelect` and colours its mark. */
  id: string;
  /** The entity's name, shown whole in the menu and truncated in the trigger. */
  name: string;
  /** A secondary line under the name — a role, an owner, a count. */
  meta?: string;
  /** A short status word shown as a `Badge` — "Draft", "Archived". */
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
   * into every translation.
   */
  kicker: string;
  /** The entity being acted in, and its siblings. */
  items: ReadonlyArray<EntitySwitcherItem>;
  /**
   * The entity being acted in. `undefined` — or an id no item names — leaves
   * the trigger showing `placeholder`, and leaves every menu item unchecked.
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
   * Replaces the default `IdentityMark` in both the trigger and the menu — a
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
 * menu can be opened — the caret.
 *
 * Shared by the interactive and the inert trigger so the two occupy the same
 * space and read the same way. The caret is the only difference the reader
 * sees, and it is exactly what tells them whether there is a menu.
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
 * **Radio semantics.** Exactly one sibling is the one being acted in, and
 * `menuitemradio` is how that reaches a screen reader without depending on
 * seeing a tick. Choosing the entity already current is a no-op rather than a
 * re-navigation.
 *
 * **A menu of one is a dead end.** With nothing to switch to, no command and
 * no failure to retry, the trigger renders inert: no caret, no menu, and not
 * in the tab order, because a button that opens a menu naming only where you
 * already are wastes a tab stop and tells the reader nothing.
 *
 * **A failed list is not an empty one.** On `status="failed"` the trigger
 * stays exactly where it was — it must never silently vanish, which strands
 * the researcher with no way back — and the menu carries the failure and its
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

  const current = items.find((item) => item.id === currentId);
  const failed = status === 'failed';
  const loading = status === 'loading';

  // What the menu is for. Any one of these is enough to make opening it worth
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
        Not a `Button` and not focusable: there is nothing to activate. The
        two spans are read in document order, so no `aria-labelledby` is
        needed here — that wiring exists on the interactive trigger only
        because a button's name is COMPUTED rather than read.
      */
      <span
        className={cx('flex min-w-0 items-center gap-2 px-3 py-1.5', className)}
        aria-busy={loading || undefined}
      >
        {face}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="sm"
            variant="text"
            color="dynamic"
            className={cx(
              'h-auto min-w-0 gap-2 rounded-sm border-transparent px-3 py-1.5',
              className,
            )}
            aria-busy={loading || undefined}
            /*
              A whole translated word and a datum, joined into "Team SONIC
              Lab" by the accessible-name algorithm rather than by JavaScript.
              An `aria-label` would REPLACE the visible name instead of
              qualifying it, and a template string would bake English word
              order into the name.

              Referenced by id rather than left to the button's own contents:
              text concatenation inserts a space only between BLOCK-level
              children, and these two are inline, so the computed name would
              read "TeamSONIC Lab". Multiple `aria-labelledby` references are
              always joined with a space.
            */
            aria-labelledby={`${kickerId} ${nameId}`}
          />
        }
      >
        {face}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-w-[24rem] min-w-[15rem]"
      >
        {items.length > 0 && (
          <DropdownMenuRadioGroup
            aria-label={kicker}
            value={currentId ?? ''}
            onValueChange={(value: unknown) => {
              // Base UI reports every press, the already-checked one
              // included. Re-selecting where you already are is not a switch,
              // and in a router-driven host it would be a redundant
              // navigation.
              if (typeof value !== 'string' || value === currentId) return;
              onSelect(value);
            }}
            className="flex flex-col gap-1"
          >
            {items.map((item) => (
              <DropdownMenuRadioItem
                key={item.id}
                value={item.id}
                closeOnClick
                // The name the menu is matched on when the reader types,
                // rather than the mark's monogram and the badge coming along
                // with it.
                label={item.name}
                /*
                  `DropdownMenuRadioItem` keeps its check indicator mounted for
                  every item, which is what reserves one tick column so the
                  names line up whichever item is checked — but it ships no
                  rule for the unchecked ones, and Base UI only marks them with
                  `data-unchecked`. Left alone, every team wears a tick.
                  `invisible` rather than `hidden`: the column has to survive.

                  ThemeSwitcher relies on that indicator staying visible (its
                  "icon" is a sun or a moon, shown on every row), so this
                  belongs here rather than in the shared wrapper.
                */
                className="gap-3 [&>[data-unchecked]]:invisible"
              >
                {markFor(item, renderMark, 'sm')}
                {/* No truncation here, deliberately: the menu is where a
                    name the trigger had to cut off can be read in full. */}
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{item.name}</span>
                  {item.meta !== undefined && (
                    <span className="text-xs opacity-70">{item.meta}</span>
                  )}
                </span>
                {item.badge !== undefined && (
                  <Badge variant="outline" className="ms-auto shrink-0">
                    {item.badge}
                  </Badge>
                )}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
        {failed && onRetry && (
          <>
            {items.length > 0 && <DropdownMenuSeparator />}
            {/*
              A group, so the message is the retry's `aria-labelledby` target
              rather than a stray non-item child of a `role="menu"`: reaching
              the retry announces what it is a retry FOR.
            */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-destructive flex items-start gap-2 font-normal text-wrap">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                {failureMessage}
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={onRetry}>
                {retryLabel}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
        {action && (
          <>
            {(items.length > 0 || failed) && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={action.onSelect}>
              {action.label}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
