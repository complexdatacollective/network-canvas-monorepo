'use client';

import type { MouseEvent, ReactNode } from 'react';

import { cx } from '../utils/cva';

/**
 * The `id` of the `<main>` the skip link targets. A descendant renders that
 * element — `layout/AppArea` for an area with a sidebar, the route itself for
 * an area without one — so the pair is asserted at runtime rather than trusted
 * to one component.
 */
export const DEFAULT_SKIP_TARGET_ID = 'main-content';

export type AppFrameProps = {
  /**
   * The application header's contents. `AppFrame` renders the `<header>`
   * element itself, so the host supplies only what goes inside it.
   */
  header: ReactNode;
  /**
   * The area region's contents — in a routed host, the router's outlet. This
   * region is the container-query context each area sizes itself against.
   */
  children: ReactNode;
  /**
   * The skip link's whole, translated label ("Skip to main content"). Required
   * rather than defaulted so no English string is baked into the shell.
   */
  skipLinkLabel: string;
  /**
   * The `id` of the `<main>` the skip link moves focus to. Defaults to
   * `main-content`; a host that changes it must change the `<main>` its area
   * layouts render to match.
   */
  skipToId?: string;
  /**
   * An icon rail rendered before the area region, in the inline-start column.
   * No host uses it today: it exists so a rail can be added without touching
   * any area layout. Nothing is rendered for it when absent — not an empty
   * column, not an empty element.
   */
  leadingRail?: ReactNode;
  className?: string;
};

/**
 * Moves focus to the skip link's target.
 *
 * A fragment link scrolls its target into view but only moves focus when the
 * target is already focusable, and `<main>` is not — so a plain `href="#…"`
 * leaves focus on the link, and the researcher's next Tab restarts at the top
 * of the document, on the skip link they just used. The target is given
 * `tabindex="-1"` for the length of this one focus, then left as it was found:
 * it belongs to a subtree this component does not own.
 *
 * The target is resolved through the anchor's own `ownerDocument`, not the
 * ambient `document`, because fresco-ui renders into other documents — a
 * popped-out window, an iframe — where the ambient `document` is a different
 * page altogether and would answer about the wrong one.
 */
const focusSkipTarget = (anchor: HTMLAnchorElement, skipToId: string) => {
  const target = anchor.ownerDocument.getElementById(skipToId);
  if (!target) return null;

  if (target.hasAttribute('tabindex')) {
    target.focus();
    return target;
  }

  target.setAttribute('tabindex', '-1');
  target.addEventListener(
    'blur',
    () => {
      target.removeAttribute('tabindex');
    },
    { once: true },
  );
  target.focus();
  return target;
};

/**
 * The application shell's outer frame: the skip link, the `<header>`, an
 * optional leading rail, and the area region every area layout renders into.
 *
 * Rendered once, above the areas, so the header survives every area
 * transition.
 *
 * It renders **no `<nav>` and no `<main>`**. Both belong to the area
 * (`layout/AppArea`), because an area's sidebar and the `<main>` that sidebar
 * labels replace each other wholesale when the researcher moves between areas
 * — a study's sidebar and the editor's outline are siblings, not one nested in
 * the other. A `<main>` here would nest the editor's inside the study's and
 * give the skip link two candidates.
 *
 * ```tsx
 * <AppFrame header={<StudioHeader />} skipLinkLabel={t('skipToMainContent')}>
 *   <Outlet />
 * </AppFrame>
 * ```
 */
const AppFrame = ({
  header,
  children,
  skipLinkLabel,
  skipToId = DEFAULT_SKIP_TARGET_ID,
  leadingRail,
  className,
}: AppFrameProps) => {
  const handleSkipLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Always suppressed, target or no target: the browser's fallback for an
    // href whose fragment matches nothing is to write the hash into the URL,
    // which in a routed host is a navigation the researcher did not ask for.
    event.preventDefault();
    focusSkipTarget(event.currentTarget, skipToId);
  };

  return (
    <div
      className={cx(
        'grid h-full min-h-0 w-full grid-rows-[auto_minmax(0,1fr)]',
        leadingRail
          ? 'grid-cols-[auto_minmax(0,1fr)]'
          : 'grid-cols-[minmax(0,1fr)]',
        className,
      )}
    >
      {/*
        First in the frame, and so the first focusable element of the document
        the host mounts it in — WCAG 2.4.1 asks the bypass to come before the
        blocks it bypasses, and a skip link reached after the header is a skip
        link nobody reaches.
      */}
      <a
        href={`#${skipToId}`}
        onClick={handleSkipLinkClick}
        className="focusable bg-surface text-surface-contrast fixed inset-s-2 top-2 z-50 -translate-y-24 rounded px-4 py-2 shadow-lg transition-transform focus:translate-y-0 motion-reduce:transition-none"
      >
        {skipLinkLabel}
      </a>
      <header className="col-span-full min-w-0">{header}</header>
      {leadingRail ? (
        <div className="row-start-2 flex min-h-0 flex-col">{leadingRail}</div>
      ) : null}
      {/*
        The area region. `@container` here rather than on the area itself so an
        area's wide/narrow behaviour is decided by the width it is actually
        given — which the rail, once one exists, changes without any area
        layout knowing. Named so an area can query it explicitly past any
        container it introduces of its own; an unnamed `@min-[…]` still matches
        it as the nearest container.
      */}
      <div className="@container/app-area row-start-2 grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)]">
        {children}
      </div>
    </div>
  );
};

export default AppFrame;
