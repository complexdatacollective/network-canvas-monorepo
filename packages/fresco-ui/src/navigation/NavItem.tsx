'use client';

import type { LucideIcon } from 'lucide-react';
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

export type NavItemProps = {
  /** The destination. Passed through to `renderLink` untouched. */
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
   */
  count?: number;
  /** Whether this is the destination currently being shown. */
  current?: boolean;
  /**
   * Renders the link element. Supplied by the host so this component knows
   * nothing about routing: pass a router's `Link`, or leave it out for a plain
   * `<a>`.
   */
  renderLink?: (props: NavItemLinkRenderProps) => ReactElement;
  /** Applied to the `<li>` this component renders. */
  className?: string;
};

const navItemLinkVariants = cva({
  base: cx(
    'focusable relative flex w-full items-center gap-3 rounded-sm py-2 ps-4 pe-3',
    // A floor rather than a fixed height: the row is at least a comfortable
    // touch target at every width, and grows instead of clipping when a
    // translated label wraps onto a second line.
    'min-h-11',
    'font-heading text-sm leading-tight font-semibold',
    'text-text/75 hover:bg-surface-1 hover:text-text transition-colors',
    'aria-[current=page]:bg-surface-2 aria-[current=page]:text-text',
    // The current destination is marked twice over: the row's fill, and this
    // bar. `aria-current` carries the state for assistive technology, and two
    // visual cues rather than one keep it legible where a background tint is
    // flattened away — forced-colours mode, a failing display, dim ambient
    // light.
    'before:bg-primary before:absolute before:inset-y-2 before:w-1 before:rounded-full',
    'before:inset-s-0 before:opacity-0 before:transition-opacity before:content-[""]',
    'aria-[current=page]:before:opacity-100',
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
 */
const NavItem = ({
  href,
  label,
  icon: Icon,
  count,
  current = false,
  renderLink = defaultRenderLink,
  className,
}: NavItemProps) => {
  // Omitted rather than shown as 0 (see `count`). A non-finite or negative
  // count is a caller's arithmetic going wrong, and is left off for the same
  // reason: a nav row is the wrong place to report it.
  const showCount = count !== undefined && Number.isFinite(count) && count > 0;

  const content = (
    <>
      {Icon ? <Icon aria-hidden className="size-5 shrink-0" /> : null}
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
