'use client';

import { Lock, type LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { cva, cx } from '../utils/cva';

/**
 * The props handed to `renderLink`. Spread them onto the host's link component
 * — every one of them has to reach the rendered element, `className` and
 * `aria-current` included.
 */
export type NavItemLinkRenderProps = {
  'href': string;
  'children': ReactNode;
  'className': string;
  /** Present only on the current destination. */
  'aria-current'?: 'page';
};

type NavItemBaseProps = {
  /**
   * The destination. Passed through to `renderLink` untouched — and, when the
   * destination is unavailable, not rendered at all.
   */
  href: string;
  /**
   * The destination's name, as one whole translated string. It is the visible
   * text and — with the count, when there is one — the link's accessible name,
   * so it is never assembled from fragments here.
   */
  label: string;
  /**
   * A decorative leading icon. Hidden from assistive technology: it repeats
   * the label, and a nav row that announced both would say everything twice.
   */
  icon?: LucideIcon;
  /**
   * How many things are at the destination. Rendered inside the link, so it
   * becomes part of the link's accessible name rather than a number announced
   * on its own. Omitted entirely when it is zero — "Participants" reads better
   * than "Participants 0", and an empty area has nothing to count.
   *
   * Ignored on an unavailable destination: a place this deployment does not
   * have has nothing to count.
   */
  count?: number;
  /** Whether this is the destination currently being shown. */
  current?: boolean;
  /**
   * Renders the link element. Supplied by the host so this component knows
   * nothing about routing: pass a router's `Link`, or leave it out for a plain
   * `<a>`. Not called for an unavailable destination — there is no link.
   */
  renderLink?: (props: NavItemLinkRenderProps) => ReactElement;
  /** Applied to the `<li>` this component renders. */
  className?: string;
};

/**
 * Availability, as a pair that cannot be half-supplied: `disabled` without a
 * reason does not typecheck. A dimmed row nobody can explain is the failure
 * this state exists to avoid, so the explanation is not optional.
 */
type NavItemAvailabilityProps =
  | { disabled?: false; unavailableReason?: never }
  | {
      /**
       * The destination is not available on this deployment. For a place that
       * genuinely does not exist here — a managed-only destination on a
       * self-hosted instance — not for one that is merely unbuilt, and not for
       * one the researcher lacks permission to enter (that is the
       * destination's own story to tell, on arrival).
       */
      disabled: true;
      /**
       * Why, in a few words, as one whole translated string: "Managed
       * deployments only". Displayed beneath the label and read as part of the
       * row, so the row explains itself rather than being mysteriously dim.
       */
      unavailableReason: string;
    };

export type NavItemProps = NavItemBaseProps & NavItemAvailabilityProps;

/**
 * The row, shared by both states: same height, same rhythm, same leading icon
 * slot, so an unavailable destination sits in the list rather than disturbing
 * it.
 */
const NAV_ITEM_ROW = cx(
  'flex w-full items-center gap-3 rounded-sm py-2 ps-4 pe-3',
  // A floor rather than a fixed height: the row is at least a comfortable
  // touch target at every width, and grows instead of clipping when a
  // translated label wraps onto a second line.
  'min-h-11',
  'font-heading text-sm leading-tight font-semibold',
);

const navItemLinkVariants = cva({
  base: cx(
    'focusable',
    NAV_ITEM_ROW,
    'text-text/75 hover:bg-surface-1 hover:text-text transition-colors',
    // The approved mockup marks the current destination with a tinted fill in
    // the accent colour, not a neutral surface step. `accent/10` rather than a
    // token: the theme has no soft-accent slot, and a surface level would be
    // the grey this replaces.
    // The approved design marks the current destination with the tinted fill
    // and nothing else. An inset bar alongside it was an addition nobody asked
    // for, and it is `aria-current` that carries the state where the fill
    // cannot be seen — that is the cue the design relies on, not a second
    // decoration.
    'aria-[current=page]:bg-accent/10 aria-[current=page]:text-accent',
  ),
});

const navItemUnavailableVariants = cva({
  base: cx(
    NAV_ITEM_ROW,
    // One step down from the enabled row's `text-text/75`, and no further.
    // Measured in the browser against the theme's own values rather than
    // assumed — composited pixels, not the token read off the stylesheet. The
    // worst case is the light theme over `--background`, the surface a sidebar
    // sits on: 5.20:1, against 6.00:1 for the enabled row. Over `--surface`
    // (the drawer) it is 5.41:1, and the dark theme's worst case is 7.44:1.
    // The next step down, /65, measures 4.44:1 and fails 1.4.3 — the same
    // cliff `NavList`'s group heading found at /60, which is why the reason
    // line, at 12.6px still normal text as far as 1.4.3 is concerned, shares
    // this colour rather than being dimmed further.
    //
    // So dimming is very nearly all the room there is, which is the argument
    // for not asking it to carry the state: the row is told apart by the
    // reason beneath the label, the lock, and the absence of any hover
    // response, none of which is a colour.
    'text-text/70',
  ),
});

/** The plain-anchor fallback, for hosts that have no router link component. */
function defaultRenderLink({ children, ...props }: NavItemLinkRenderProps) {
  return <a {...props}>{children}</a>;
}

/**
 * One navigation destination: a link, an optional leading icon, and an
 * optional count.
 *
 * ```tsx
 * <NavItem
 *   href={`/study/${studyId}/participants`}
 *   label={t('participants')}
 *   icon={Users}
 *   count={study.participantCount}
 *   current={pathname.endsWith('/participants')}
 *   renderLink={({ children, ...props }) => <Link {...props}>{children}</Link>}
 * />
 * ```
 *
 * It renders the `<li>` as well as the link, so it drops straight into
 * `NavList`'s lists — and into any other `<ul>`, which is the only place an
 * `<li>` belongs.
 *
 * **Operated by Tab and Enter.** A sidebar is a list of links, not a composite
 * widget: it implements no roving focus, because taking eleven destinations
 * out of the tab order and putting them behind arrow keys makes them harder to
 * reach, not easier.
 *
 * **The count is part of the link's accessible name.** It is rendered inside
 * the link, so the accessible name is computed from the link's own content —
 * "Participants 84" — and no string is assembled in JavaScript. That is what
 * makes it translate: the label is a whole string and the number is a number,
 * and the accessibility layer joins them. Nothing is inserted between them,
 * deliberately: a literal ", " would be composed English punctuation, and the
 * locales that write lists with `، ` or `、` would get the wrong mark.
 *
 * **An unavailable destination is shown, not hidden.** `disabled` with an
 * `unavailableReason` renders the row as text rather than a link:
 *
 * ```tsx
 * <NavItem
 *   href={billingHref}
 *   label={t('billing')}
 *   icon={CreditCard}
 *   disabled
 *   unavailableReason={t('managedDeploymentsOnly')}
 * />
 * ```
 *
 * It is for a destination this deployment genuinely does not have — billing on
 * a self-hosted instance — not for one that has yet to be built. An unbuilt
 * destination gets a route and a placeholder, because the researcher can
 * usefully see where the work will appear; a destination that will never exist
 * here can only be explained.
 *
 * The comment on that branch, below, records the semantics the row is given
 * and why it is not a disabled widget.
 */
const NavItem = (props: NavItemProps) => {
  const {
    href,
    label,
    icon: Icon,
    count,
    current = false,
    renderLink = defaultRenderLink,
    className,
  } = props;

  const icon = Icon ? <Icon aria-hidden className="size-5 shrink-0" /> : null;

  // Narrowed from `props` rather than from a destructured `disabled`, so
  // `unavailableReason` is a `string` here and not `string | undefined`.
  if (props.disabled) {
    return (
      <li className={className}>
        {/*
          NOT A LINK, AND NOT A DISABLED WIDGET
          =====================================

          A plain, non-interactive element: no `href`, no `tabIndex`, no
          `role`, and no `aria-disabled`. The alternative considered was the
          usual disabled-control shape — a focusable element carrying
          `aria-disabled="true"` — and it is wrong here twice over.

          It cannot be spelled without a lie. `aria-disabled` is not a global
          attribute; it is honoured on widget roles, and the roles that would
          make it meaningful here are `link` and `button`. Both announce a
          destination that cannot be entered as something a researcher can
          operate, which is precisely what this state exists to stop. On a
          plain `<span>` or an `<a>` with no `href` — neither of which has a
          role — `aria-disabled` is inert: it changes no announcement, and
          only reassures the person who wrote it.

          The discoverability it usually buys is already paid for. A focusable
          disabled control is worth its stop in the tab order when Tab is how
          the thing would be found — a submit button that is off until the form
          is valid. A sidebar is a labelled list of links, and a screen reader
          enumerates it by list navigation and by the links rotor, not by Tab.
          This row is an `<li>` in that list: it is counted, and arrowing
          through the list reads "Billing, Managed deployments only" whether or
          not it can hold focus. What focus would add is a stop on a row that
          does nothing when activated — noise for the keyboard user, and a
          focus ring that promises an action there isn't. So it stays out of
          the tab order.

          Told apart from an enabled row without colour: the reason line, which
          no enabled row has; the lock; and no hover response, no pointer
          cursor, no focus ring. The dimming (see
          `navItemUnavailableVariants`) is the least of the four and never the
          only one.
        */}
        <div className={navItemUnavailableVariants()}>
          {icon}
          <span className="min-w-0 flex-1 text-start">
            <span className="block wrap-break-word">{label}</span>
            {/*
              The explanation, visible rather than tucked into a `title` or an
              `aria-describedby` on something unfocusable. A tooltip would need
              hover or focus, and this row offers neither; a visually hidden
              string would leave the sighted researcher with a dim row and no
              reason, which is the failure mode this prop exists to prevent.
              Its own line, so a wrapped label and a wrapped reason cannot run
              together, and in the body font so it reads as prose about the
              destination rather than as a second destination.
            */}
            <span className="font-body mt-0.5 block text-xs font-normal">
              {props.unavailableReason}
            </span>
          </span>
          {/*
            Redundant with the reason line, and deliberately so: it is the cue
            that survives a glance down the sidebar. Hidden from assistive
            technology, which has the sentence.
          */}
          <Lock aria-hidden className="size-4 shrink-0" />
        </div>
      </li>
    );
  }

  // Omitted rather than shown as 0 (see `count`). A non-finite or negative
  // count is a caller's arithmetic going wrong, and is left off for the same
  // reason: a nav row is the wrong place to report it.
  const showCount = count !== undefined && Number.isFinite(count) && count > 0;

  const content = (
    <>
      {icon}
      <span className="min-w-0 flex-1 text-start wrap-break-word">{label}</span>
      {showCount ? (
        // Block-level, not inline, and that is load-bearing: the accessible
        // name concatenates a block child with a space around it, so the name
        // is "Participants 84" rather than "Participants84". Deliberately not
        // `Badge` — the only Badge variant without a filled or bordered chip is
        // `outline`, and five bordered chips down a sidebar shout over the
        // labels they annotate.
        <div className="text-text/70 shrink-0 text-xs font-bold tabular-nums">
          {/* Grouped by the runtime's locale, so five-figure counts stay
              readable. */}
          {count.toLocaleString()}
        </div>
      ) : null}
    </>
  );

  return (
    <li className={className}>
      {renderLink({
        'href': href,
        'children': content,
        'className': navItemLinkVariants(),
        'aria-current': current ? 'page' : undefined,
      })}
    </li>
  );
};

export default NavItem;
